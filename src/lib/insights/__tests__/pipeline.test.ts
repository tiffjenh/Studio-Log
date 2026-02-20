import { describe, it, expect } from "vitest";
import { askInsights, parseToQueryPlan, runTruthQuery } from "@/lib/insights";
import { INSIGHTS_TEST_QUESTIONS } from "@/features/insights/testQuestions";
import type { Lesson, Student } from "@/types";
import type { EarningsRow, StudentSummary } from "@/lib/forecasts/types";

const LESSONS: Lesson[] = [
  { id: "l1", studentId: "s1", date: "2024-06-01", durationMinutes: 60, amountCents: 5000, completed: true },
  { id: "l2", studentId: "s2", date: "2024-07-01", durationMinutes: 60, amountCents: 10000, completed: true },
  { id: "l3", studentId: "s1", date: "2025-01-15", durationMinutes: 60, amountCents: 8000, completed: true },
  { id: "l4", studentId: "s1", date: "2025-01-22", durationMinutes: 60, amountCents: 8000, completed: false },
  { id: "l5", studentId: "s2", date: "2025-02-01", durationMinutes: 60, amountCents: 7000, completed: true },
  { id: "l6", studentId: "s3", date: "2025-02-05", durationMinutes: 30, amountCents: 4500, completed: true },
  { id: "l7", studentId: "s1", date: "2026-01-05", durationMinutes: 60, amountCents: 10000, completed: true },
  { id: "l8", studentId: "s3", date: "2026-01-12", durationMinutes: 30, amountCents: 6000, completed: true },
  { id: "l9", studentId: "s2", date: "2026-01-20", durationMinutes: 60, amountCents: 6000, completed: true },
];

const ROSTER: Student[] = [
  { id: "s1", firstName: "Alice", lastName: "Parker", durationMinutes: 60, rateCents: 8000, dayOfWeek: 1, timeOfDay: "4:00 PM" },
  { id: "s2", firstName: "Bob", lastName: "Lee", durationMinutes: 60, rateCents: 7000, dayOfWeek: 2, timeOfDay: "5:00 PM" },
  { id: "s3", firstName: "Leo", lastName: "Chen", durationMinutes: 30, rateCents: 9000, dayOfWeek: 3, timeOfDay: "3:30 PM" },
];

const EARNINGS: EarningsRow[] = LESSONS
  .filter((l) => l.completed)
  .map((l) => {
    const s = ROSTER.find((x) => x.id === l.studentId)!;
    return {
      date: l.date,
      amount: l.amountCents / 100,
      durationMinutes: l.durationMinutes,
      customer: `${s.firstName} ${s.lastName}`,
      studentId: l.studentId,
    };
  });
const STUDENTS: StudentSummary[] = ROSTER.map((s) => ({
  id: s.id,
  name: `${s.firstName} ${s.lastName}`,
  rateCents: s.rateCents,
  durationMinutes: s.durationMinutes,
}));

const ctx = { user_id: "u1", lessons: LESSONS, roster: ROSTER, earnings: EARNINGS, students: STUDENTS, timezone: "America/Los_Angeles", locale: "en-US" as const };

describe("Insights pipeline", () => {
  it("routes and computes from SQL truth, not default fallback", async () => {
    const plan = parseToQueryPlan("which student has the highest hourly rate?");
    expect(plan.intent).toBe("student_highest_hourly_rate");
    const res = await askInsights("which student has the highest hourly rate?", ctx);
    expect(res.finalAnswerText.toLowerCase()).not.toContain("you have");
    expect(res.finalAnswerText.toLowerCase()).not.toContain("projected monthly earnings");
  });

  it("truth query and answer align for earnings period", async () => {
    const question = "how much did i earn in jan 2026?";
    const plan = parseToQueryPlan(question);
    const truth = await runTruthQuery(plan.sql_truth_query_key, { user_id: "u1", lessons: LESSONS, students: ROSTER }, {
      start_date: plan.time_range?.start,
      end_date: plan.time_range?.end,
    });
    const res = await askInsights(question, ctx);
    expect(res.trace?.queryPlan.intent).toBe("earnings_in_period");
    expect(typeof truth.total_dollars).toBe("number");
    expect(res.finalAnswerText).toContain(String(truth.total_dollars));
  });

  it("asks clarification for ambiguous query", async () => {
    const res = await askInsights("tell me something random about my studio", ctx);
    expect(res.needsClarification).toBe(true);
    expect(res.finalAnswerText.toLowerCase()).toContain("did you mean");
  });

  it("runs 60-question paraphrase matrix without irrelevant defaults", async () => {
    expect(INSIGHTS_TEST_QUESTIONS.length).toBeGreaterThanOrEqual(60);
    for (const tc of INSIGHTS_TEST_QUESTIONS.slice(0, 60)) {
      const res = await askInsights(tc.question, ctx);
      if (tc.expectedClarificationNeeded) {
        expect(res.needsClarification, tc.question).toBe(true);
        continue;
      }
      expect(res.trace?.queryPlan.intent, tc.question).toBe(tc.expectedIntent);
      expect(res.finalAnswerText.toLowerCase(), tc.question).not.toContain("you have");
      if (tc.expectedIntent !== "forecast_monthly" && tc.expectedIntent !== "forecast_yearly") {
        expect(res.finalAnswerText.toLowerCase(), tc.question).not.toContain("projected monthly earnings");
      }
      expect(res.needsClarification, tc.question).toBe(false);
    }
  });
});
