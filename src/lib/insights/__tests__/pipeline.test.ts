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

  it("returns full revenue-per-student breakdown (not truncated)", async () => {
    const truth = await runTruthQuery(
      "revenue_per_student_in_period",
      { user_id: "u1", lessons: LESSONS, students: ROSTER },
      { start_date: "2026-01-01", end_date: "2026-12-31" }
    );
    const rows = (truth.rows as Array<{ student_name: string; total_dollars: number }>) ?? [];
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0].total_dollars).toBeGreaterThanOrEqual(rows[1].total_dollars);
    expect(rows[1].total_dollars).toBeGreaterThanOrEqual(rows[2].total_dollars);
  });

  it("never returns a $0 winner day when a positive day exists", async () => {
    const lessons: Lesson[] = [
      { id: "d1", studentId: "s1", date: "2026-02-01", durationMinutes: 60, amountCents: 0, completed: true },
      { id: "d2", studentId: "s2", date: "2026-02-02", durationMinutes: 60, amountCents: 5000, completed: true },
    ];
    const truth = await runTruthQuery(
      "day_of_week_earnings_max",
      { user_id: "u1", lessons, students: ROSTER },
      { start_date: "2026-02-01", end_date: "2026-02-28" }
    );
    expect(truth.total_dollars as number).toBeGreaterThan(0);
    expect(typeof truth.dow_label).toBe("string");
  });

  it("does not return contradictory empty state when lesson_count > 0", async () => {
    const res = await askInsights("How many lessons did I teach last month?", ctx);
    expect(res.metadata.lesson_count).toBeGreaterThan(0);
    expect(res.finalAnswerText.toLowerCase()).not.toContain("no completed lessons found");
  });

  it("supports cash flow trend and returns multi-point trend output", async () => {
    const res = await askInsights("What's my cash flow trend in 2026?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("cash_flow_trend");
    const outputs = res.computedResult?.outputs as { weekly_series?: unknown[]; direction?: string } | undefined;
    expect((outputs?.weekly_series?.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect(["up", "down", "flat"]).toContain(outputs?.direction);
  });

  it("supports stability questions without earnings/attendance clarification", async () => {
    const res = await askInsights("Is my income stable or volatile in 2026?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("income_stability");
    expect(/stable|volatile|moderately|not enough weekly data/i.test(res.finalAnswerText)).toBe(true);
  });

  it("supports hours worked queries", async () => {
    const res = await askInsights("How many hours did I work in 2025?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("hours_total_in_period");
    const out = res.computedResult?.outputs as { total_hours?: number; lesson_count?: number } | undefined;
    expect(out?.lesson_count).toBe(3);
    expect(out?.total_hours).toBe(2.5);
    expect(/hours/i.test(res.finalAnswerText)).toBe(true);
  });

  it("supports average lessons per week queries", async () => {
    const res = await askInsights("Average lessons per week in 2026", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("avg_lessons_per_week_in_period");
    const out = res.computedResult?.outputs as { avg_lessons_per_week?: number; weeks_count?: number } | undefined;
    expect(typeof out?.avg_lessons_per_week).toBe("number");
    expect((out?.weeks_count ?? 0)).toBeGreaterThan(0);
    expect(/lessons\/week/i.test(res.finalAnswerText)).toBe(true);
  });

  it("supports what-if rate change questions", async () => {
    const res = await askInsights("If I raise rates by $10/hour, what happens to my income in 2026?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("what_if_rate_change");
    expect(res.finalAnswerText).toContain("$10/hr");
    expect(res.finalAnswerText.toLowerCase()).toContain("projected");
  });

  it("tax questions return guidance, not a revenue total", async () => {
    const res = await askInsights("Estimated tax on my income in 2026?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("tax_guidance");
    expect(res.finalAnswerText).toMatch(/tax set-aside guidance/i);
    expect(res.finalAnswerText).toMatch(/25–30%|25-30%/);
  });

  it("supports what-if add students dropdown question", async () => {
    const res = await askInsights("If I add 3 new students, what's my new income in 2026?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("what_if_add_students");
    expect(res.finalAnswerText.toLowerCase()).toContain("adding");
    expect(res.finalAnswerText.toLowerCase()).toContain("/week");
  });

  it("supports what-if time off dropdown question", async () => {
    const res = await askInsights("If I take 2 weeks off, how does that affect my yearly earnings in 2026?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("what_if_take_time_off");
    expect(res.finalAnswerText.toLowerCase()).toContain("weeks off");
  });

  it("supports what-if lose top students dropdown question", async () => {
    const res = await askInsights("What if I lose my top 2 students in 2026?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("what_if_lose_top_students");
    expect(res.finalAnswerText.toLowerCase()).toContain("lose");
    expect(res.finalAnswerText.toLowerCase()).toContain("projected");
  });

  it("supports students-needed-for-target dropdown question", async () => {
    const res = await askInsights("How many students do I need to reach $100k at $70/hr in 2026?", ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.trace?.queryPlan.intent).toBe("students_needed_for_target_income");
    expect(res.finalAnswerText.toLowerCase()).toContain("need");
  });

  it("returns exactly top N students when available", async () => {
    const res = await askInsights("Top 3 students by revenue in 2026", ctx);
    expect(res.needsClarification).toBe(false);
    const rows = (res.computedResult?.outputs as { rows?: unknown[] } | undefined)?.rows ?? [];
    expect(rows.length).toBe(3);
  });
});
