import type { Lesson, Student } from "@/types";
import { dedupeLessons, getDayOfWeekFromDateKey } from "@/utils/earnings";

export type RevenueRow = {
  student_id: string;
  student_name: string;
  total_cents: number;
  total_dollars: number;
};

export type WeeklyPoint = {
  start_date: string;
  end_date: string;
  total_cents: number;
  total_dollars: number;
};

function centsToDollars(cents: number): number {
  return Math.round((cents / 100) * 100) / 100;
}

function isoToDate(d: string): Date {
  return new Date(`${d}T12:00:00`);
}

function dateToKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function normalizeCompletedLessons(lessons: Lesson[]): Lesson[] {
  return dedupeLessons(lessons.filter((l) => l.completed));
}

export function filterLessonsInRange(lessons: Lesson[], start: string, end: string): Lesson[] {
  return lessons.filter((l) => l.date >= start && l.date <= end);
}

export function sumRevenueCents(lessons: Lesson[]): number {
  return lessons.reduce((sum, l) => sum + l.amountCents, 0);
}

export function sumHours(lessons: Lesson[]): number {
  return lessons.reduce((sum, l) => sum + l.durationMinutes, 0) / 60;
}

export function revenuePerLesson(lessons: Lesson[]): number {
  if (lessons.length === 0) return 0;
  return centsToDollars(sumRevenueCents(lessons) / lessons.length);
}

export function topStudentsByRevenue(
  lessons: Lesson[],
  studentsById: Map<string, Student>,
  topN?: number
): { rows: RevenueRow[]; available_count: number } {
  const byStudent = new Map<string, number>();
  for (const l of lessons) {
    byStudent.set(l.studentId, (byStudent.get(l.studentId) ?? 0) + l.amountCents);
  }
  const rows = [...byStudent.entries()]
    .map(([studentId, cents]) => {
      const s = studentsById.get(studentId);
      const student_name = s ? `${s.firstName} ${s.lastName}` : "Unknown";
      return {
        student_id: studentId,
        student_name,
        total_cents: cents,
        total_dollars: centsToDollars(cents),
      };
    })
    .sort((a, b) => b.total_cents - a.total_cents);
  return {
    rows: typeof topN === "number" && topN > 0 ? rows.slice(0, topN) : rows,
    available_count: rows.length,
  };
}

export function bestWeekdayByRevenue(lessons: Lesson[]): {
  dow: number | null;
  dow_label: string | null;
  total_cents: number;
  total_dollars: number;
  zero_cause?: string | null;
} {
  const byDow = new Map<number, number>();
  for (const l of lessons) {
    const dow = getDayOfWeekFromDateKey(l.date);
    byDow.set(dow, (byDow.get(dow) ?? 0) + l.amountCents);
  }
  if (byDow.size === 0) {
    return {
      dow: null,
      dow_label: null,
      total_cents: 0,
      total_dollars: 0,
      zero_cause: "no_completed_lessons_in_range",
    };
  }
  const sorted = [...byDow.entries()].sort((a, b) => b[1] - a[1]);
  const [dow, totalCents] = sorted[0]!;
  if (totalCents <= 0) {
    return {
      dow: null,
      dow_label: null,
      total_cents: 0,
      total_dollars: 0,
      zero_cause: "sum_zero_with_rows",
    };
  }
  const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    dow,
    dow_label: DOW_LABELS[dow] ?? "Unknown",
    total_cents: totalCents,
    total_dollars: centsToDollars(totalCents),
    zero_cause: null,
  };
}

export function weeklyRevenueSeries(
  lessons: Lesson[],
  start: string,
  end: string
): WeeklyPoint[] {
  const startDate = startOfWeek(isoToDate(start));
  const endDate = isoToDate(end);
  const points: WeeklyPoint[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const weekStart = dateToKey(cursor);
    const weekEndDate = new Date(cursor);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = dateToKey(weekEndDate);
    const inWeek = lessons.filter((l) => l.date >= weekStart && l.date <= weekEnd);
    const totalCents = sumRevenueCents(inWeek);
    points.push({
      start_date: weekStart,
      end_date: weekEnd,
      total_cents: totalCents,
      total_dollars: centsToDollars(totalCents),
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return points;
}

export function describeTrend(points: WeeklyPoint[]): "up" | "down" | "flat" {
  if (points.length < 2) return "flat";
  const half = Math.floor(points.length / 2);
  const first = points.slice(0, half);
  const second = points.slice(half);
  const avg = (arr: WeeklyPoint[]) =>
    arr.length > 0 ? arr.reduce((sum, p) => sum + p.total_cents, 0) / arr.length : 0;
  const delta = avg(second) - avg(first);
  if (Math.abs(delta) < 1) return "flat";
  return delta > 0 ? "up" : "down";
}

export function coefficientOfVariation(points: WeeklyPoint[]): number | null {
  if (points.length < 2) return null;
  const values = points.map((p) => p.total_cents);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  return stddev / mean;
}
