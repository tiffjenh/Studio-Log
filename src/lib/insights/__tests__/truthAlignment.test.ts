import { describe, expect, it } from "vitest";
import type { Lesson, Student } from "@/types";
import {
  bestWeekdayByRevenue,
  filterLessonsInRange,
  normalizeCompletedLessons,
  sumRevenueCents,
  topStudentsByRevenue,
} from "@/lib/insights/metrics/earningsTruth";
import { askInsights } from "@/lib/insights";

const STUDENTS: Student[] = [
  { id: "s1", firstName: "Lucas", lastName: "Parker", durationMinutes: 60, rateCents: 6000, dayOfWeek: 1, timeOfDay: "4:00 PM" },
  { id: "s2", firstName: "Emma", lastName: "Kim", durationMinutes: 60, rateCents: 7000, dayOfWeek: 2, timeOfDay: "5:00 PM" },
  { id: "s3", firstName: "Sofia", lastName: "Parker", durationMinutes: 60, rateCents: 8000, dayOfWeek: 3, timeOfDay: "6:00 PM" },
  { id: "s4", firstName: "Mason", lastName: "Lopez", durationMinutes: 60, rateCents: 9000, dayOfWeek: 4, timeOfDay: "7:00 PM" },
];

const LESSONS: Lesson[] = [
  { id: "l1", studentId: "s1", date: "2026-01-04", durationMinutes: 90, amountCents: 18000, completed: true },
  { id: "l2", studentId: "s2", date: "2026-01-06", durationMinutes: 90, amountCents: 35000, completed: true },
  { id: "l3", studentId: "s3", date: "2026-01-07", durationMinutes: 90, amountCents: 40000, completed: true },
  { id: "l4", studentId: "s4", date: "2026-01-08", durationMinutes: 90, amountCents: 45000, completed: true },
  { id: "l5", studentId: "s1", date: "2026-01-13", durationMinutes: 60, amountCents: 16000, completed: true },
  { id: "l6", studentId: "s2", date: "2026-01-14", durationMinutes: 60, amountCents: 30000, completed: true },
  { id: "l7", studentId: "s3", date: "2026-01-20", durationMinutes: 60, amountCents: 25000, completed: true },
  { id: "l8", studentId: "s4", date: "2026-01-21", durationMinutes: 60, amountCents: 24000, completed: true },
  { id: "l9", studentId: "s1", date: "2026-01-27", durationMinutes: 60, amountCents: 9000, completed: true },
  { id: "l10", studentId: "s2", date: "2026-01-29", durationMinutes: 60, amountCents: 16000, completed: true },
  // Week of 2/1..2/7 for weekday max sanity (Tue highest, Wed lower)
  { id: "l11", studentId: "s1", date: "2026-02-01", durationMinutes: 60, amountCents: 0, completed: true }, // Sun
  { id: "l12", studentId: "s2", date: "2026-02-02", durationMinutes: 60, amountCents: 11000, completed: true }, // Mon
  { id: "l13", studentId: "s3", date: "2026-02-03", durationMinutes: 60, amountCents: 23000, completed: true }, // Tue
  { id: "l14", studentId: "s4", date: "2026-02-04", durationMinutes: 60, amountCents: 12000, completed: true }, // Wed
];

const completed = normalizeCompletedLessons(LESSONS);
const studentsById = new Map(STUDENTS.map((s) => [s.id, s]));

describe("truth metrics align with earnings-style aggregates", () => {
  it("matches Jan 2026 revenue total and top students", () => {
    const jan = filterLessonsInRange(completed, "2026-01-01", "2026-01-31");
    expect(sumRevenueCents(jan)).toBe(258000); // $2,580 fixture total
    const top = topStudentsByRevenue(jan, studentsById, 3);
    expect(top.rows.length).toBe(3);
    expect(top.rows[0]?.student_name).toBe("Emma Kim");
    expect(top.rows[0]?.total_dollars).toBe(810); // 35000+30000+16000 cents
  });

  it("weekday max picks Tuesday for 2/1-2/7 fixture", () => {
    const week = filterLessonsInRange(completed, "2026-02-01", "2026-02-07");
    const best = bestWeekdayByRevenue(week);
    expect(best.dow_label).toBe("Tuesday");
    expect(best.total_dollars).toBe(230);
  });
});

describe("insights answers use truth-aligned outputs", () => {
  const earnings = completed.map((l) => {
    const s = studentsById.get(l.studentId)!;
    return {
      date: l.date,
      amount: l.amountCents / 100,
      durationMinutes: l.durationMinutes,
      customer: `${s.firstName} ${s.lastName}`,
      studentId: l.studentId,
    };
  });
  const studentSummaries = STUDENTS.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    rateCents: s.rateCents,
    durationMinutes: s.durationMinutes,
  }));

  it("returns top 3 rows for Top 3 question", async () => {
    const res = await askInsights("Top 3 students by revenue in January 2026", {
      user_id: "u1",
      lessons: LESSONS,
      roster: STUDENTS,
      earnings,
      students: studentSummaries,
      timezone: "America/Los_Angeles",
      locale: "en-US",
    });
    const rows = ((res.computedResult?.outputs as { rows?: unknown[] } | undefined)?.rows ?? []);
    expect(rows.length).toBe(3);
    expect(res.needsClarification).toBe(false);
  });
});
