import { hasSupabase, supabase } from "@/lib/supabase";
import { computeForecast } from "@/lib/forecasts/compute";
import type { Lesson, Student } from "@/types";

export const SQL_TRUTH_QUERIES: Record<string, string> = {
  student_highest_hourly_rate: `
SELECT s.id, s.first_name, s.last_name,
       (SUM(l.amount_cents)::numeric / NULLIF(SUM(l.duration_minutes), 0)) * 60 AS effective_hourly_cents
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1 AND l.lesson_date BETWEEN $2 AND $3
GROUP BY s.id, s.first_name, s.last_name
ORDER BY effective_hourly_cents DESC
LIMIT 1;
`,
  student_lowest_hourly_rate: `
SELECT s.id, s.first_name, s.last_name,
       (SUM(l.amount_cents)::numeric / NULLIF(SUM(l.duration_minutes), 0)) * 60 AS effective_hourly_cents
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1 AND l.lesson_date BETWEEN $2 AND $3
GROUP BY s.id, s.first_name, s.last_name
ORDER BY effective_hourly_cents ASC
LIMIT 1;
`,
  students_below_average_rate: `
WITH base AS (
  SELECT student_id,
         SUM(amount_cents)::numeric AS cents,
         SUM(duration_minutes)::numeric AS mins
  FROM public.lessons
  WHERE user_id = $1 AND lesson_date BETWEEN $2 AND $3
  GROUP BY student_id
),
avg_rate AS (
  SELECT (SUM(cents) / NULLIF(SUM(mins),0)) * 60 AS avg_hourly_cents FROM base
)
SELECT s.id, s.first_name, s.last_name, (b.cents / NULLIF(b.mins,0))*60 AS hourly_cents, a.avg_hourly_cents
FROM base b
JOIN avg_rate a ON true
JOIN public.students s ON s.id = b.student_id
WHERE (b.cents / NULLIF(b.mins,0))*60 < a.avg_hourly_cents
ORDER BY hourly_cents ASC;
`,
  student_missed_most_lessons_in_year: `
SELECT s.id, s.first_name, s.last_name, COUNT(*)::int AS missed_count
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1
  AND l.lesson_date BETWEEN $2 AND $3
  AND l.completed = false
GROUP BY s.id, s.first_name, s.last_name
ORDER BY missed_count DESC
LIMIT 1;
`,
  earnings_in_period: `
SELECT COALESCE(SUM(amount_cents),0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3;
`,
  earnings_ytd_for_student: `
SELECT COALESCE(SUM(l.amount_cents),0)::bigint AS total_cents
FROM public.lessons l
WHERE l.user_id = $1
  AND l.student_id = $2
  AND l.completed = true
  AND l.lesson_date BETWEEN $3 AND $4;
`,
  revenue_per_student_in_period: `
SELECT s.id, s.first_name, s.last_name, COALESCE(SUM(l.amount_cents),0)::bigint AS total_cents
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1 AND l.completed = true AND l.lesson_date BETWEEN $2 AND $3
GROUP BY s.id, s.first_name, s.last_name
ORDER BY total_cents DESC;
`,
  student_attendance_summary: `
SELECT
  COUNT(*)::int AS total_lessons,
  COUNT(*) FILTER (WHERE completed = true)::int AS attended_lessons,
  COUNT(*) FILTER (WHERE completed = false)::int AS missed_lessons
FROM public.lessons
WHERE user_id = $1 AND student_id = $2 AND lesson_date BETWEEN $3 AND $4;
`,
};

type TruthDataContext = {
  user_id?: string;
  lessons?: Lesson[];
  students?: Student[];
};

type TruthResult = Record<string, unknown>;

function centsToDollars(cents: number): number {
  return Math.round((cents / 100) * 100) / 100;
}

function toName(s: Student): string {
  return `${s.firstName} ${s.lastName}`.trim();
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

async function loadData(ctx: TruthDataContext): Promise<{ lessons: Lesson[]; students: Student[]; source: "supabase" | "memory" }> {
  if (hasSupabase() && supabase && ctx.user_id) {
    const [{ data: lessonsRows, error: lessonErr }, { data: studentRows, error: studentErr }] = await Promise.all([
      supabase
        .from("lessons")
        .select("id,student_id,lesson_date,time_of_day,duration_minutes,amount_cents,completed,note")
        .eq("user_id", ctx.user_id),
      supabase
        .from("students")
        .select("id,first_name,last_name,duration_minutes,rate_cents,day_of_week,time_of_day")
        .eq("user_id", ctx.user_id),
    ]);
    if (!lessonErr && !studentErr && lessonsRows && studentRows) {
      const lessons: Lesson[] = lessonsRows.map((r) => ({
        id: String(r.id),
        studentId: String(r.student_id),
        date: String(r.lesson_date),
        timeOfDay: (r.time_of_day as string | null) ?? undefined,
        durationMinutes: Number(r.duration_minutes ?? 0),
        amountCents: Number(r.amount_cents ?? 0),
        completed: Boolean(r.completed),
        note: (r.note as string | null) ?? undefined,
      }));
      const students: Student[] = studentRows.map((r) => ({
        id: String(r.id),
        firstName: String(r.first_name ?? ""),
        lastName: String(r.last_name ?? ""),
        durationMinutes: Number(r.duration_minutes ?? 60),
        rateCents: Number(r.rate_cents ?? 0),
        dayOfWeek: Number(r.day_of_week ?? 0),
        timeOfDay: String(r.time_of_day ?? "12:00 PM"),
      }));
      return { lessons, students, source: "supabase" };
    }
  }
  return {
    lessons: ctx.lessons ?? [],
    students: ctx.students ?? [],
    source: "memory",
  };
}

function matchStudentIdByName(students: Student[], rawName?: string): string | null {
  if (!rawName) return null;
  const q = rawName.toLowerCase().trim();
  const matches = students.filter((s) => {
    const full = toName(s).toLowerCase();
    return full === q || full.includes(q) || q.includes(full) || s.firstName.toLowerCase() === q;
  });
  if (matches.length !== 1) return null;
  return matches[0].id;
}

export async function runTruthQuery(
  key: string,
  ctx: TruthDataContext,
  params: Record<string, unknown>
): Promise<TruthResult> {
  const data = await loadData(ctx);
  const start = String(params.start_date ?? "");
  const end = String(params.end_date ?? "");
  const lessons = data.lessons.filter((l) => !start || !end || dateInRange(l.date, start, end));
  const studentsById = new Map(data.students.map((s) => [s.id, s]));

  switch (key) {
    case "earnings_in_period": {
      const totalCents = lessons.filter((l) => l.completed).reduce((acc, l) => acc + l.amountCents, 0);
      return { total_cents: totalCents, total_dollars: centsToDollars(totalCents), data_source: data.source };
    }
    case "revenue_per_student_in_period": {
      const byStudent = new Map<string, number>();
      for (const l of lessons) {
        if (!l.completed) continue;
        byStudent.set(l.studentId, (byStudent.get(l.studentId) ?? 0) + l.amountCents);
      }
      const rows = [...byStudent.entries()]
        .map(([studentId, cents]) => ({
          student_id: studentId,
          student_name: studentsById.get(studentId) ? toName(studentsById.get(studentId)!) : "Unknown",
          total_cents: cents,
          total_dollars: centsToDollars(cents),
        }))
        .sort((a, b) => b.total_cents - a.total_cents);
      return { rows, data_source: data.source };
    }
    case "earnings_ytd_for_student": {
      const studentId =
        typeof params.student_id === "string" ? params.student_id : matchStudentIdByName(data.students, params.student_name as string | undefined);
      if (!studentId) return { error: "student_not_resolved", data_source: data.source };
      const totalCents = lessons
        .filter((l) => l.studentId === studentId && l.completed)
        .reduce((acc, l) => acc + l.amountCents, 0);
      return { student_id: studentId, total_cents: totalCents, total_dollars: centsToDollars(totalCents), data_source: data.source };
    }
    case "student_highest_hourly_rate":
    case "student_lowest_hourly_rate": {
      const byStudent = new Map<string, { cents: number; mins: number }>();
      for (const l of lessons) {
        if (l.durationMinutes <= 0) continue;
        const current = byStudent.get(l.studentId) ?? { cents: 0, mins: 0 };
        current.cents += l.amountCents;
        current.mins += l.durationMinutes;
        byStudent.set(l.studentId, current);
      }
      const ranked = [...byStudent.entries()]
        .map(([studentId, agg]) => ({
          student_id: studentId,
          student_name: studentsById.get(studentId) ? toName(studentsById.get(studentId)!) : "Unknown",
          hourly_cents: agg.mins > 0 ? (agg.cents / agg.mins) * 60 : 0,
        }))
        .sort((a, b) => (key === "student_highest_hourly_rate" ? b.hourly_cents - a.hourly_cents : a.hourly_cents - b.hourly_cents));
      return ranked[0] ? { ...ranked[0], hourly_dollars: centsToDollars(ranked[0].hourly_cents), data_source: data.source } : { row: null, data_source: data.source };
    }
    case "students_below_average_rate": {
      const byStudent = new Map<string, { cents: number; mins: number }>();
      let totalCents = 0;
      let totalMins = 0;
      for (const l of lessons) {
        totalCents += l.amountCents;
        totalMins += l.durationMinutes;
        const current = byStudent.get(l.studentId) ?? { cents: 0, mins: 0 };
        current.cents += l.amountCents;
        current.mins += l.durationMinutes;
        byStudent.set(l.studentId, current);
      }
      const avgHourlyCents = totalMins > 0 ? (totalCents / totalMins) * 60 : 0;
      const rows = [...byStudent.entries()]
        .map(([studentId, agg]) => ({
          student_id: studentId,
          student_name: studentsById.get(studentId) ? toName(studentsById.get(studentId)!) : "Unknown",
          hourly_cents: agg.mins > 0 ? (agg.cents / agg.mins) * 60 : 0,
        }))
        .filter((r) => r.hourly_cents < avgHourlyCents)
        .sort((a, b) => a.hourly_cents - b.hourly_cents);
      return {
        avg_hourly_cents: avgHourlyCents,
        avg_hourly_dollars: centsToDollars(avgHourlyCents),
        rows: rows.map((r) => ({ ...r, hourly_dollars: centsToDollars(r.hourly_cents) })),
        data_source: data.source,
      };
    }
    case "student_missed_most_lessons_in_year": {
      const byStudent = new Map<string, number>();
      for (const l of lessons) {
        if (l.completed) continue;
        byStudent.set(l.studentId, (byStudent.get(l.studentId) ?? 0) + 1);
      }
      const ranked = [...byStudent.entries()].sort((a, b) => b[1] - a[1]);
      if (!ranked[0]) return { row: null, data_source: data.source };
      const [studentId, missedCount] = ranked[0];
      return {
        student_id: studentId,
        student_name: studentsById.get(studentId) ? toName(studentsById.get(studentId)!) : "Unknown",
        missed_count: missedCount,
        data_source: data.source,
      };
    }
    case "student_attendance_summary": {
      const studentId =
        typeof params.student_id === "string" ? params.student_id : matchStudentIdByName(data.students, params.student_name as string | undefined);
      if (!studentId) return { error: "student_not_resolved", data_source: data.source };
      const rows = lessons.filter((l) => l.studentId === studentId);
      const total = rows.length;
      const attended = rows.filter((l) => l.completed).length;
      const missed = rows.filter((l) => !l.completed).length;
      return {
        student_id: studentId,
        student_name: studentsById.get(studentId) ? toName(studentsById.get(studentId)!) : "Unknown",
        total_lessons: total,
        attended_lessons: attended,
        missed_lessons: missed,
        attendance_rate_percent: total > 0 ? Math.round((attended / total) * 10000) / 100 : null,
        data_source: data.source,
      };
    }
    case "average_hourly_rate_in_period": {
      const totalCents = lessons.reduce((acc, l) => acc + l.amountCents, 0);
      const totalMins = lessons.reduce((acc, l) => acc + l.durationMinutes, 0);
      const hourlyCents = totalMins > 0 ? (totalCents / totalMins) * 60 : 0;
      return { hourly_cents: hourlyCents, hourly_dollars: centsToDollars(hourlyCents), data_source: data.source };
    }
    case "percent_change_yoy": {
      const yearA = Number(params.year_a);
      const yearB = Number(params.year_b);
      const totalA = data.lessons.filter((l) => l.completed && l.date >= `${yearA}-01-01` && l.date <= `${yearA}-12-31`).reduce((a, l) => a + l.amountCents, 0);
      const totalB = data.lessons.filter((l) => l.completed && l.date >= `${yearB}-01-01` && l.date <= `${yearB}-12-31`).reduce((a, l) => a + l.amountCents, 0);
      const pct = totalA > 0 ? ((totalB - totalA) / totalA) * 100 : null;
      return {
        year_a: yearA,
        year_b: yearB,
        total_a_dollars: centsToDollars(totalA),
        total_b_dollars: centsToDollars(totalB),
        dollar_change_dollars: centsToDollars(totalB - totalA),
        percent_change: pct == null ? null : Math.round(pct * 100) / 100,
        data_source: data.source,
      };
    }
    case "forecast_monthly":
    case "forecast_yearly": {
      const earningsRows = data.lessons
        .filter((l) => l.completed)
        .map((l) => ({
          date: l.date,
          amount: l.amountCents / 100,
          durationMinutes: l.durationMinutes,
          customer: studentsById.get(l.studentId) ? toName(studentsById.get(l.studentId)!) : undefined,
          studentId: l.studentId,
        }));
      const fc = computeForecast(earningsRows);
      return {
        projected_monthly_dollars: fc.projectedMonthly ?? null,
        projected_yearly_dollars: fc.projectedYearly ?? null,
        avg_weekly_dollars: fc.avgWeekly ?? null,
        trend: fc.trend,
        data_source: data.source,
      };
    }
    default:
      return { error: `unknown_truth_query_key:${key}`, data_source: data.source };
  }
}

