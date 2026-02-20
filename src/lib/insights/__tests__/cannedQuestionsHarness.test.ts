import { describe, expect, it } from "vitest";
import { askInsights } from "@/lib/insights";
import { INSIGHTS_CATEGORIES } from "@/pages/insightsConstants";
import type { Lesson, Student } from "@/types";

const STUDENTS: Student[] = [
  { id: "s1", firstName: "Alice", lastName: "Parker", durationMinutes: 60, rateCents: 8000, dayOfWeek: 1, timeOfDay: "4:00 PM" },
  { id: "s2", firstName: "Bob", lastName: "Lee", durationMinutes: 60, rateCents: 7000, dayOfWeek: 2, timeOfDay: "5:00 PM" },
  { id: "s3", firstName: "Leo", lastName: "Chen", durationMinutes: 30, rateCents: 9000, dayOfWeek: 3, timeOfDay: "3:30 PM" },
];

const LESSONS: Lesson[] = [
  { id: "l1", studentId: "s1", date: "2025-12-29", durationMinutes: 60, amountCents: 9000, completed: true },
  { id: "l2", studentId: "s2", date: "2026-01-05", durationMinutes: 60, amountCents: 10000, completed: true },
  { id: "l3", studentId: "s3", date: "2026-01-12", durationMinutes: 30, amountCents: 6000, completed: true },
  { id: "l4", studentId: "s2", date: "2026-01-20", durationMinutes: 60, amountCents: 11000, completed: true },
  { id: "l5", studentId: "s1", date: "2026-02-03", durationMinutes: 60, amountCents: 8000, completed: true },
  { id: "l6", studentId: "s3", date: "2026-02-10", durationMinutes: 30, amountCents: 6500, completed: true },
];

const EARNINGS = LESSONS.filter((l) => l.completed).map((l) => {
  const student = STUDENTS.find((s) => s.id === l.studentId)!;
  return {
    date: l.date,
    amount: l.amountCents / 100,
    durationMinutes: l.durationMinutes,
    customer: `${student.firstName} ${student.lastName}`,
    studentId: student.id,
  };
});

const STUDENT_SUMMARIES = STUDENTS.map((s) => ({
  id: s.id,
  name: `${s.firstName} ${s.lastName}`,
  rateCents: s.rateCents,
  durationMinutes: s.durationMinutes,
}));

describe("Insights canned question harness", () => {
  it("runs every dropdown question with invariants", async () => {
    const questions = INSIGHTS_CATEGORIES.flatMap((cat) => cat.questions);
    expect(questions.length).toBeGreaterThan(0);

    for (const question of questions) {
      const res = await askInsights(question, {
        user_id: "u1",
        lessons: LESSONS,
        roster: STUDENTS,
        earnings: EARNINGS,
        students: STUDENT_SUMMARIES,
        timezone: "America/Los_Angeles",
        locale: "en-US",
      });

      expect(res.metadata.lesson_count, question).toBeGreaterThanOrEqual(0);
      const lower = res.finalAnswerText.toLowerCase();
      if (res.metadata.lesson_count === 0) {
        expect(lower.includes("based on"), question).toBe(false);
      }
      if (lower.includes("no completed lessons")) {
        expect(res.metadata.lesson_count, question).toBe(0);
      }
      if (res.metadata.lesson_count > 0) {
        expect(lower.includes("no completed lessons"), question).toBe(false);
      }

      const topMatch = question.match(/\btop\s+(\d+)\b/i);
      const n = topMatch ? Number(topMatch[1]) : null;
      if (n != null && !res.needsClarification && res.trace?.queryPlan.intent === "revenue_per_student_in_period") {
        const rows = ((res.computedResult?.outputs as { rows?: unknown[] } | undefined)?.rows ?? []);
        expect(rows.length, question).toBeLessThanOrEqual(n);
        if (rows.length < n) {
          expect(/only|no completed lessons/i.test(res.finalAnswerText), question).toBe(true);
        }
      }
    }
  });
});
