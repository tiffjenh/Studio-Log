import { hasSupabase, supabase } from "@/lib/supabase";
import { computeForecast } from "@/lib/forecasts/compute";
import { resolveStudentName } from "@/lib/insights/metrics/entityResolution";
import { computeLessonAmountCents } from "@/utils/earnings";
import {
  bestWeekdayByRevenue,
  coefficientOfVariation,
  describeTrend,
  normalizeCompletedLessons,
  revenuePerLesson,
  topStudentsByRevenue,
  weeklyRevenueSeries,
} from "@/lib/insights/metrics/earningsTruth";
import type { Lesson, Student } from "@/types";

export const SQL_TRUTH_QUERIES: Record<string, string> = {
  EARNINGS_RANK_MAX: `
SELECT s.id, s.first_name, s.last_name, COALESCE(SUM(l.amount_cents),0)::bigint AS total_cents
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1 AND l.completed = true AND l.lesson_date BETWEEN $2 AND $3
GROUP BY s.id, s.first_name, s.last_name
ORDER BY total_cents DESC
LIMIT 1;
`,
  EARNINGS_RANK_MIN: `
SELECT s.id, s.first_name, s.last_name, COALESCE(SUM(l.amount_cents),0)::bigint AS total_cents
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1 AND l.completed = true AND l.lesson_date BETWEEN $2 AND $3
GROUP BY s.id, s.first_name, s.last_name
ORDER BY total_cents ASC
LIMIT 1;
`,
  ATTENDANCE_RANK_MISSED: `
SELECT s.id, s.first_name, s.last_name, COUNT(*)::int AS missed_count
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1 AND l.completed = false AND l.lesson_date BETWEEN $2 AND $3
GROUP BY s.id, s.first_name, s.last_name
ORDER BY missed_count DESC
LIMIT 1;
`,
  ATTENDANCE_RANK_COMPLETED: `
SELECT s.id, s.first_name, s.last_name, COUNT(*)::int AS completed_count
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1 AND l.completed = true AND l.lesson_date BETWEEN $2 AND $3
GROUP BY s.id, s.first_name, s.last_name
ORDER BY completed_count DESC
LIMIT 1;
`,
  UNIQUE_STUDENT_COUNT: `
SELECT COUNT(DISTINCT student_id)::int AS student_count
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3;
`,
  TOTAL_EARNINGS_PERIOD: `
SELECT COALESCE(SUM(amount_cents),0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3;
`,
  REVENUE_DELTA_SIMULATION: `
SELECT
  COALESCE(SUM(duration_minutes),0)::bigint AS total_minutes,
  COALESCE(SUM(amount_cents),0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3;
`,
  REVENUE_TARGET_PROJECTION: `
SELECT
  COUNT(DISTINCT student_id)::int AS active_students,
  COALESCE(SUM(duration_minutes),0)::bigint AS total_minutes
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3;
`,
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
  student_completed_most_lessons_in_year: `
SELECT s.id, s.first_name, s.last_name, COUNT(*)::int AS completed_count
FROM public.lessons l
JOIN public.students s ON s.id = l.student_id
WHERE l.user_id = $1
  AND l.lesson_date BETWEEN $2 AND $3
  AND l.completed = true
GROUP BY s.id, s.first_name, s.last_name
ORDER BY completed_count DESC
LIMIT 1;
`,
  earnings_in_period: `
SELECT COALESCE(SUM(amount_cents),0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3;
`,
  unique_student_count_in_period: `
SELECT COUNT(DISTINCT student_id)::int AS student_count
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3;
`,
  lessons_count_in_period: `
SELECT COUNT(*) FILTER (WHERE completed = true)::int AS lesson_count
FROM public.lessons
WHERE user_id = $1 AND lesson_date BETWEEN $2 AND $3;
`,
  hours_total_in_period: `
SELECT
  COUNT(*) FILTER (WHERE completed = true)::int AS lesson_count,
  COALESCE(SUM(duration_minutes) FILTER (WHERE completed = true), 0)::bigint AS total_minutes
FROM public.lessons
WHERE user_id = $1 AND lesson_date BETWEEN $2 AND $3;
`,
  avg_lessons_per_week_in_period: `
SELECT DATE_TRUNC('week', lesson_date)::date AS week_start,
       COUNT(*) FILTER (WHERE completed = true)::int AS lesson_count
FROM public.lessons
WHERE user_id = $1 AND lesson_date BETWEEN $2 AND $3
GROUP BY 1
ORDER BY 1 ASC;
`,
  revenue_per_lesson_in_period: `
SELECT
  COUNT(*) FILTER (WHERE completed = true)::int AS lesson_count,
  COALESCE(SUM(amount_cents) FILTER (WHERE completed = true), 0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND lesson_date BETWEEN $2 AND $3;
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
  avg_weekly_revenue: `
SELECT DATE_TRUNC('week', lesson_date)::date AS week_start,
       COALESCE(SUM(amount_cents),0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3
GROUP BY 1
ORDER BY 1 ASC;
`,
  cash_flow_trend: `
SELECT DATE_TRUNC('week', lesson_date)::date AS week_start,
       COALESCE(SUM(amount_cents),0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3
GROUP BY 1
ORDER BY 1 ASC;
`,
  income_stability: `
SELECT DATE_TRUNC('week', lesson_date)::date AS week_start,
       COALESCE(SUM(amount_cents),0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND completed = true AND lesson_date BETWEEN $2 AND $3
GROUP BY 1
ORDER BY 1 ASC;
`,
  student_attendance_summary: `
SELECT
  COUNT(*)::int AS total_lessons,
  COUNT(*) FILTER (WHERE completed = true)::int AS attended_lessons,
  COUNT(*) FILTER (WHERE completed = false)::int AS missed_lessons
FROM public.lessons
WHERE user_id = $1 AND student_id = $2 AND lesson_date BETWEEN $3 AND $4;
`,
  day_of_week_earnings_max: `
SELECT EXTRACT(DOW FROM lesson_date) AS dow, COALESCE(SUM(amount_cents),0)::bigint AS total_cents
FROM public.lessons
WHERE user_id = $1 AND lesson_date BETWEEN $2 AND $3 AND completed = true
GROUP BY 1 ORDER BY total_cents DESC LIMIT 1;
`,
  // NOTE: what_if_rate_change and tax_guidance are primarily computed in-memory because they
  // require scenario parameters or are non-SQL guidance responses.
};

type TruthDataContext = {
  user_id?: string;
  lessons?: Lesson[];
  students?: Student[];
};

type TruthResult = Record<string, unknown>;

function isInsightsDebugEnabled(): boolean {
  if (import.meta.env.VITE_DEBUG_INSIGHTS === "1") return true;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    Boolean((window as unknown as { DEBUG_INSIGHTS?: boolean }).DEBUG_INSIGHTS) ||
    localStorage.getItem("insights_debug") === "1" ||
    params.get("debug") === "1"
  );
}

function centsToDollars(cents: number): number {
  return Math.round((cents / 100) * 100) / 100;
}

function toName(s: Student): string {
  return `${s.firstName} ${s.lastName}`.trim();
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/** Effective amount for a lesson: use stored amount_cents, or student rate × duration when 0 (matches Earnings chart). */
function effectiveCents(l: Lesson, studentsById: Map<string, Student>): number {
  if (l.amountCents != null && l.amountCents > 0) return l.amountCents;
  const student = studentsById.get(l.studentId);
  if (!student) return 0;
  return computeLessonAmountCents(student, l, l.date);
}

async function loadData(ctx: TruthDataContext): Promise<{ lessons: Lesson[]; students: Student[]; source: "supabase" | "memory" }> {
  // Keep Insights aligned with on-screen Earnings values by preferring in-memory
  // store snapshots when they are provided by the caller.
  if (ctx.lessons && ctx.students) {
    return {
      lessons: ctx.lessons,
      students: ctx.students,
      source: "memory",
    };
  }
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

export async function runInsightsSupabaseSanityCheck(userId?: string): Promise<void> {
  if (!userId || !hasSupabase() || !supabase) return;
  const { data, error } = await supabase
    .from("lessons")
    .select("lesson_date,amount_cents,duration_minutes,completed,student_id")
    .eq("user_id", userId)
    .order("lesson_date", { ascending: false })
    .limit(20);
  if (error) {
    console.warn("[Insights][sanity] fetch error", error.message);
    return;
  }
  const rows = (data ?? []) as Array<{
    lesson_date: string;
    amount_cents: number;
    duration_minutes: number;
    completed: boolean;
    student_id: string;
  }>;
  if (rows.length === 0) {
    console.log("[Insights][sanity]", { rows: 0, completed: 0, not_completed: 0 });
    return;
  }
  const completedCount = rows.filter((r) => r.completed).length;
  const minDate = rows.reduce((m, r) => (r.lesson_date < m ? r.lesson_date : m), rows[0].lesson_date);
  const maxDate = rows.reduce((m, r) => (r.lesson_date > m ? r.lesson_date : m), rows[0].lesson_date);
  console.log("[Insights][sanity]", {
    rows: rows.length,
    completed: completedCount,
    not_completed: rows.length - completedCount,
    min_lesson_date: minDate,
    max_lesson_date: maxDate,
    sample: rows.slice(0, 5),
  });
}

function matchStudentIdByName(students: Student[], rawName?: string): string | null {
  if (!rawName) return null;
  return resolveStudentName(students, rawName);
}

export async function runTruthQuery(
  key: string,
  ctx: TruthDataContext,
  params: Record<string, unknown>
): Promise<TruthResult> {
  const alias: Record<string, string> = {
    EARNINGS_RANK_MAX: "revenue_per_student_in_period",
    EARNINGS_RANK_MIN: "revenue_per_student_in_period",
    ATTENDANCE_RANK_MISSED: "student_missed_most_lessons_in_year",
    ATTENDANCE_RANK_COMPLETED: "student_completed_most_lessons_in_year",
    UNIQUE_STUDENT_COUNT: "unique_student_count_in_period",
    TOTAL_EARNINGS_PERIOD: "earnings_in_period",
    REVENUE_DELTA_SIMULATION: "what_if_rate_change",
    REVENUE_TARGET_PROJECTION: "students_needed_for_target_income",
  };
  const resolvedKey = alias[key] ?? key;
  const resolvedParams =
    key === "EARNINGS_RANK_MAX"
      ? { ...params, rank_order: "desc", top_n: 1 }
      : key === "EARNINGS_RANK_MIN"
        ? { ...params, rank_order: "asc", top_n: 1 }
        : params;
  const debug = isInsightsDebugEnabled();
  const data = await loadData(ctx);
  const start = String(resolvedParams.start_date ?? "");
  const end = String(resolvedParams.end_date ?? "");
  const lessons = data.lessons.filter((l) => !start || !end || dateInRange(l.date, start, end));
  const completedLessons = normalizeCompletedLessons(lessons);
  const studentsById = new Map(data.students.map((s) => [s.id, s]));
  if (debug) {
    console.log("[Insights][truthQuery]", {
      key,
      resolved_key: resolvedKey,
      filters: {
        user_id: ctx.user_id ?? null,
        start_date: start || null,
        end_date: end || null,
        completed_only_intent:
          resolvedKey === "earnings_in_period" ||
          resolvedKey === "revenue_per_student_in_period" ||
          resolvedKey === "average_hourly_rate_in_period" ||
          resolvedKey === "day_of_week_earnings_max" ||
          resolvedKey === "lessons_count_in_period" ||
          resolvedKey === "revenue_per_lesson_in_period" ||
          resolvedKey === "avg_weekly_revenue" ||
          resolvedKey === "cash_flow_trend" ||
          resolvedKey === "income_stability" ||
          resolvedKey === "on_track_goal",
        student_name: (resolvedParams.student_name as string | undefined) ?? null,
      },
      source: data.source,
      rows_in_range: lessons.length,
      sample: lessons.slice(0, 5).map((l) => ({
        id: l.id,
        student_id: l.studentId,
        lesson_date: l.date,
        amount_cents: l.amountCents,
        duration_minutes: l.durationMinutes,
        completed: l.completed,
      })),
    });
  }

  switch (resolvedKey) {
    case "earnings_in_period": {
      const totalCents = completedLessons.reduce((acc, l) => acc + effectiveCents(l, studentsById), 0);
      const zero_cause =
        totalCents !== 0
          ? null
          : completedLessons.length === 0
            ? lessons.length === 0
              ? "no_rows_in_range"
              : "no_completed_lessons_in_range"
            : "sum_zero_with_rows";
      return {
        lesson_count: completedLessons.length,
        total_cents: totalCents,
        total_dollars: centsToDollars(totalCents),
        zero_cause,
        data_source: data.source,
      };
    }
    case "unique_student_count_in_period": {
      const unique = new Set(completedLessons.map((l) => l.studentId));
      return {
        student_count: unique.size,
        lesson_count: completedLessons.length,
        zero_cause:
          completedLessons.length === 0
            ? lessons.length === 0
              ? "no_rows_in_range"
              : "no_completed_lessons_in_range"
            : null,
        data_source: data.source,
      };
    }
    case "lessons_count_in_period": {
      return {
        lesson_count: completedLessons.length,
        zero_cause:
          completedLessons.length === 0
            ? lessons.length === 0
              ? "no_rows_in_range"
              : "no_completed_lessons_in_range"
            : null,
        data_source: data.source,
      };
    }
    case "hours_total_in_period": {
      const totalMins = completedLessons.reduce((acc, l) => acc + (l.durationMinutes ?? 0), 0);
      const totalHours = Math.round((totalMins / 60) * 100) / 100;
      return {
        lesson_count: completedLessons.length,
        total_minutes: totalMins,
        total_hours: totalHours,
        zero_cause:
          completedLessons.length === 0
            ? lessons.length === 0
              ? "no_rows_in_range"
              : "no_completed_lessons_in_range"
            : null,
        data_source: data.source,
      };
    }
    case "avg_lessons_per_week_in_period": {
      if (!start || !end) return { error: "missing_range", data_source: data.source };
      // Reuse weekly bucketing logic to include weeks with zero lessons.
      const weeks = weeklyRevenueSeries([], start, end);
      const weekly_counts = weeks.map((w) => {
        const count = completedLessons.filter((l) => l.date >= w.start_date && l.date <= w.end_date).length;
        return { start_date: w.start_date, end_date: w.end_date, lesson_count: count };
      });
      const totalLessons = weekly_counts.reduce((s, p) => s + p.lesson_count, 0);
      const avg = weekly_counts.length > 0 ? totalLessons / weekly_counts.length : 0;
      return {
        weekly_series: weekly_counts,
        weeks_count: weekly_counts.length,
        lesson_count: totalLessons,
        avg_lessons_per_week: Math.round(avg * 100) / 100,
        zero_cause:
          totalLessons === 0
            ? lessons.length === 0
              ? "no_rows_in_range"
              : "no_completed_lessons_in_range"
            : null,
        data_source: data.source,
      };
    }
    case "revenue_per_lesson_in_period": {
      const totalCents = completedLessons.reduce((acc, l) => acc + effectiveCents(l, studentsById), 0);
      const perLessonDollars = revenuePerLesson(
        completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) }))
      );
      return {
        lesson_count: completedLessons.length,
        total_cents: totalCents,
        avg_cents_per_lesson: completedLessons.length > 0 ? totalCents / completedLessons.length : 0,
        avg_dollars_per_lesson: perLessonDollars,
        zero_cause:
          completedLessons.length === 0
            ? lessons.length === 0
              ? "no_rows_in_range"
              : "no_completed_lessons_in_range"
            : totalCents === 0
              ? "sum_zero_with_rows"
              : null,
        data_source: data.source,
      };
    }
    case "revenue_per_student_in_period": {
      const topN =
        typeof resolvedParams.top_n === "number"
          ? resolvedParams.top_n
          : typeof resolvedParams.top_n === "string"
            ? Number(resolvedParams.top_n)
            : undefined;
      const rankOrder = resolvedParams.rank_order === "asc" ? "asc" : "desc";
      const totalsByStudent = new Map<string, number>();
      for (const lesson of completedLessons) {
        const cents = effectiveCents(lesson, studentsById);
        totalsByStudent.set(lesson.studentId, (totalsByStudent.get(lesson.studentId) ?? 0) + cents);
      }
      const allRows = [...totalsByStudent.entries()].map(([studentId, totalCents]) => ({
        student_id: studentId,
        student_name: studentsById.get(studentId) ? toName(studentsById.get(studentId)!) : "Unknown",
        total_cents: totalCents,
        total_dollars: centsToDollars(totalCents),
      }));
      allRows.sort((a, b) => (
        rankOrder === "asc" ? a.total_dollars - b.total_dollars : b.total_dollars - a.total_dollars
      ));
      const requested = Number.isFinite(topN) ? Number(topN) : undefined;
      const rows = requested ? allRows.slice(0, requested) : allRows;
      return { rows, available_count: allRows.length, requested_top_n: requested ?? null, rank_order: rankOrder, data_source: data.source };
    }
    case "avg_weekly_revenue": {
      if (!start || !end) return { error: "missing_range", data_source: data.source };
      const series = weeklyRevenueSeries(
        completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) })),
        start,
        end
      );
      const totalCents = series.reduce((sum, p) => sum + p.total_cents, 0);
      const avgWeekly = series.length > 0 ? totalCents / series.length : 0;
      return {
        weekly_series: series,
        weeks_count: series.length,
        avg_weekly_cents: avgWeekly,
        avg_weekly_dollars: centsToDollars(avgWeekly),
        total_cents: totalCents,
        total_dollars: centsToDollars(totalCents),
        data_source: data.source,
      };
    }
    case "cash_flow_trend": {
      if (!start || !end) return { error: "missing_range", data_source: data.source };
      const series = weeklyRevenueSeries(
        completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) })),
        start,
        end
      );
      return {
        weekly_series: series,
        weeks_count: series.length,
        direction: describeTrend(series),
        data_source: data.source,
      };
    }
    case "income_stability": {
      if (!start || !end) return { error: "missing_range", data_source: data.source };
      const series = weeklyRevenueSeries(
        completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) })),
        start,
        end
      );
      const cv = coefficientOfVariation(series);
      let label: "stable" | "moderate" | "volatile" | "insufficient_data" = "insufficient_data";
      if (cv != null) {
        if (cv < 0.2) label = "stable";
        else if (cv < 0.45) label = "moderate";
        else label = "volatile";
      }
      return {
        weekly_series: series,
        weeks_count: series.length,
        coefficient_of_variation: cv,
        stability_label: label,
        data_source: data.source,
      };
    }
    case "earnings_ytd_for_student": {
      const studentId =
        typeof resolvedParams.student_id === "string" ? resolvedParams.student_id : matchStudentIdByName(data.students, resolvedParams.student_name as string | undefined);
      if (!studentId) return { error: "student_not_resolved", zero_cause: "student_not_resolved", data_source: data.source };
      const studentRows = lessons.filter((l) => l.studentId === studentId);
      const completedRows = studentRows.filter((l) => l.completed);
      const totalCents = completedRows.reduce((acc, l) => acc + effectiveCents(l, studentsById), 0);
      const zero_cause =
        totalCents !== 0
          ? null
          : completedRows.length === 0
            ? studentRows.length === 0
              ? "no_rows_for_student_in_range"
              : "no_completed_lessons_for_student_in_range"
            : "sum_zero_with_rows";
      return {
        student_id: studentId,
        total_cents: totalCents,
        total_dollars: centsToDollars(totalCents),
        lesson_count: completedRows.length,
        zero_cause,
        data_source: data.source,
      };
    }
    case "student_highest_hourly_rate":
    case "student_lowest_hourly_rate": {
      const byStudent = new Map<string, { cents: number; mins: number }>();
      for (const l of lessons) {
        if (l.durationMinutes <= 0) continue;
        const current = byStudent.get(l.studentId) ?? { cents: 0, mins: 0 };
        current.cents += effectiveCents(l, studentsById);
        current.mins += l.durationMinutes;
        byStudent.set(l.studentId, current);
      }
      const ranked = data.students
        .filter((s) => {
          const agg = byStudent.get(s.id);
          const fromLessons = agg && agg.mins > 0 ? (agg.cents / agg.mins) * 60 : 0;
          return (s.rateCents != null && s.rateCents > 0) || fromLessons > 0;
        })
        .map((s) => {
          const agg = byStudent.get(s.id);
          const fromLessons = agg && agg.mins > 0 ? (agg.cents / agg.mins) * 60 : 0;
          const hourly_cents = (s.rateCents != null && s.rateCents > 0) ? s.rateCents : fromLessons;
          return {
            student_id: s.id,
            student_name: toName(s),
            hourly_cents,
          };
        })
        .sort((a, b) => (key === "student_highest_hourly_rate" ? b.hourly_cents - a.hourly_cents : a.hourly_cents - b.hourly_cents));
      return ranked[0] ? { ...ranked[0], hourly_dollars: centsToDollars(ranked[0].hourly_cents), data_source: data.source } : { row: null, data_source: data.source };
    }
    case "students_below_average_rate": {
      const completedOnly = lessons.filter((l) => l.completed);
      const byStudent = new Map<string, { cents: number; mins: number }>();
      let totalCents = 0;
      let totalMins = 0;
      for (const l of completedOnly) {
        const cents = effectiveCents(l, studentsById);
        totalCents += cents;
        totalMins += l.durationMinutes;
        const current = byStudent.get(l.studentId) ?? { cents: 0, mins: 0 };
        current.cents += cents;
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
    case "student_completed_most_lessons_in_year": {
      const byStudent = new Map<string, number>();
      for (const l of lessons) {
        if (!l.completed) continue;
        byStudent.set(l.studentId, (byStudent.get(l.studentId) ?? 0) + 1);
      }
      const ranked = [...byStudent.entries()].sort((a, b) => b[1] - a[1]);
      if (!ranked[0]) return { row: null, data_source: data.source };
      const [studentId, completedCount] = ranked[0];
      return {
        student_id: studentId,
        student_name: studentsById.get(studentId) ? toName(studentsById.get(studentId)!) : "Unknown",
        completed_count: completedCount,
        data_source: data.source,
      };
    }
    case "student_attendance_summary": {
      const studentId =
        typeof resolvedParams.student_id === "string" ? resolvedParams.student_id : matchStudentIdByName(data.students, resolvedParams.student_name as string | undefined);
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
      const totalCents = completedLessons.reduce((acc, l) => acc + effectiveCents(l, studentsById), 0);
      const totalMins = completedLessons.reduce((acc, l) => acc + l.durationMinutes, 0);
      const hourlyCents = totalMins > 0 ? (totalCents / totalMins) * 60 : 0;
      return { hourly_cents: hourlyCents, hourly_dollars: centsToDollars(hourlyCents), data_source: data.source };
    }
    case "day_of_week_earnings_max": {
      const best = bestWeekdayByRevenue(
        completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) }))
      );
      return {
        ...best,
        zero_cause:
          best.zero_cause ??
          (completedLessons.length === 0
            ? lessons.length === 0
              ? "no_rows_in_range"
              : "no_completed_lessons_in_range"
            : null),
        data_source: data.source,
      };
    }
    case "percent_change_yoy": {
      const yearA = Number(resolvedParams.year_a);
      const yearB = Number(resolvedParams.year_b);
      const inYearA = data.lessons.filter((l) => l.completed && l.date >= `${yearA}-01-01` && l.date <= `${yearA}-12-31`);
      const inYearB = data.lessons.filter((l) => l.completed && l.date >= `${yearB}-01-01` && l.date <= `${yearB}-12-31`);
      const totalA = inYearA.reduce((a, l) => a + effectiveCents(l, studentsById), 0);
      const totalB = inYearB.reduce((a, l) => a + effectiveCents(l, studentsById), 0);
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
    case "what_if_rate_change": {
      const delta = typeof resolvedParams.rate_delta_dollars_per_hour === "number"
        ? resolvedParams.rate_delta_dollars_per_hour
        : typeof resolvedParams.rate_delta_dollars_per_hour === "string"
          ? Number(resolvedParams.rate_delta_dollars_per_hour)
          : null;
      if (delta == null || !Number.isFinite(delta)) {
        return { error: "missing_rate_delta", data_source: data.source };
      }
      const totalCents = completedLessons.reduce((acc, l) => acc + effectiveCents(l, studentsById), 0);
      const totalMins = completedLessons.reduce((acc, l) => acc + (l.durationMinutes ?? 0), 0);
      const totalHours = totalMins / 60;
      const deltaDollars = Math.round((totalHours * delta) * 100) / 100;
      const projected = centsToDollars(totalCents) + deltaDollars;
      return {
        lesson_count: completedLessons.length,
        total_hours: Math.round(totalHours * 100) / 100,
        current_total_dollars: centsToDollars(totalCents),
        rate_delta_dollars_per_hour: delta,
        delta_dollars: deltaDollars,
        projected_total_dollars: Math.round(projected * 100) / 100,
        data_source: data.source,
      };
    }
    case "what_if_add_students": {
      const n =
        typeof resolvedParams.new_students === "number"
          ? resolvedParams.new_students
          : typeof resolvedParams.new_students === "string"
            ? Number(resolvedParams.new_students)
            : null;
      if (n == null || !Number.isFinite(n) || n <= 0) return { error: "missing_new_students", data_source: data.source };
      if (!start || !end) return { error: "missing_range", data_source: data.source };
      const mapped = completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) }));
      const series = weeklyRevenueSeries(mapped, start, end);
      const total = series.reduce((s, p) => s + p.total_dollars, 0);
      const avgWeekly = series.length > 0 ? total / series.length : 0;
      const activeStudents = new Set(mapped.map((l) => l.studentId));
      const perStudent = activeStudents.size > 0 ? avgWeekly / activeStudents.size : 0;
      const delta = perStudent * n;
      return {
        lesson_count: completedLessons.length,
        weeks_count: series.length,
        active_students: activeStudents.size,
        new_students: n,
        avg_weekly_dollars: Math.round(avgWeekly * 100) / 100,
        avg_weekly_per_student_dollars: Math.round(perStudent * 100) / 100,
        delta_weekly_dollars: Math.round(delta * 100) / 100,
        projected_weekly_dollars: Math.round((avgWeekly + delta) * 100) / 100,
        data_source: data.source,
      };
    }
    case "what_if_take_time_off": {
      const weeksOff =
        typeof resolvedParams.weeks_off === "number"
          ? resolvedParams.weeks_off
          : typeof resolvedParams.weeks_off === "string"
            ? Number(resolvedParams.weeks_off)
            : null;
      if (weeksOff == null || !Number.isFinite(weeksOff) || weeksOff <= 0) return { error: "missing_weeks_off", data_source: data.source };
      if (!start || !end) return { error: "missing_range", data_source: data.source };
      const mapped = completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) }));
      const series = weeklyRevenueSeries(mapped, start, end);
      const total = series.reduce((s, p) => s + p.total_dollars, 0);
      const avgWeekly = series.length > 0 ? total / series.length : 0;
      const lost = avgWeekly * weeksOff;
      return {
        lesson_count: completedLessons.length,
        weeks_count: series.length,
        weeks_off: weeksOff,
        avg_weekly_dollars: Math.round(avgWeekly * 100) / 100,
        expected_lost_dollars: Math.round(lost * 100) / 100,
        data_source: data.source,
      };
    }
    case "what_if_lose_top_students": {
      const topN =
        typeof resolvedParams.top_n === "number"
          ? resolvedParams.top_n
          : typeof resolvedParams.top_n === "string"
            ? Number(resolvedParams.top_n)
            : null;
      if (topN == null || !Number.isFinite(topN) || topN <= 0) return { error: "missing_top_n", data_source: data.source };
      const mapped = completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) }));
      const totalCents = mapped.reduce((acc, l) => acc + (l.amountCents ?? 0), 0);
      const { rows } = topStudentsByRevenue(mapped, studentsById, topN);
      const lost = rows.reduce((s, r) => s + r.total_dollars, 0);
      const projected = centsToDollars(totalCents) - lost;
      return {
        lesson_count: completedLessons.length,
        top_n: topN,
        lost_students: rows,
        lost_total_dollars: Math.round(lost * 100) / 100,
        current_total_dollars: centsToDollars(totalCents),
        projected_total_dollars: Math.round(projected * 100) / 100,
        data_source: data.source,
      };
    }
    case "on_track_goal": {
      const goal =
        typeof resolvedParams.annual_goal_dollars === "number"
          ? resolvedParams.annual_goal_dollars
          : typeof resolvedParams.annual_goal_dollars === "string"
            ? Number(resolvedParams.annual_goal_dollars)
            : null;
      if (goal == null || !Number.isFinite(goal) || goal <= 0) return { error: "missing_annual_goal", data_source: data.source };
      if (!start || !end) return { error: "missing_range", data_source: data.source };

      const ytdCents = completedLessons.reduce((acc, l) => acc + effectiveCents(l, studentsById), 0);
      const ytdDollars = Math.round(centsToDollars(ytdCents) * 100) / 100;
      const startDate = new Date(start + "T12:00:00");
      const endDate = new Date(end + "T12:00:00");
      const daysElapsed = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      const daysInYear = 365;
      const projectedTotalDollars = daysElapsed > 0 ? Math.round((ytdDollars * daysInYear / daysElapsed) * 100) / 100 : 0;
      const deltaToGoalDollars = Math.round((goal - projectedTotalDollars) * 100) / 100;
      const remainingDays = Math.max(0, daysInYear - daysElapsed);
      const remainingWeeks = remainingDays / 7;
      const remainingMonths = remainingDays / 30;
      const requiredPerWeek = remainingWeeks > 0 && deltaToGoalDollars > 0 ? Math.round((deltaToGoalDollars / remainingWeeks) * 100) / 100 : null;
      const requiredPerMonth = remainingMonths > 0 && deltaToGoalDollars > 0 ? Math.round((deltaToGoalDollars / remainingMonths) * 100) / 100 : null;

      return {
        lesson_count: completedLessons.length,
        ytd_dollars: ytdDollars,
        annual_goal_dollars: goal,
        projected_total_dollars: projectedTotalDollars,
        delta_to_goal_dollars: deltaToGoalDollars,
        required_per_week_dollars: requiredPerWeek ?? undefined,
        required_per_month_dollars: requiredPerMonth ?? undefined,
        data_source: data.source,
      };
    }
    case "students_needed_for_target_income": {
      const target =
        typeof resolvedParams.target_income_dollars === "number"
          ? resolvedParams.target_income_dollars
          : typeof resolvedParams.target_income_dollars === "string"
            ? Number(resolvedParams.target_income_dollars)
            : null;
      const rate =
        typeof resolvedParams.rate_dollars_per_hour === "number"
          ? resolvedParams.rate_dollars_per_hour
          : typeof resolvedParams.rate_dollars_per_hour === "string"
            ? Number(resolvedParams.rate_dollars_per_hour)
            : null;
      if (target == null || !Number.isFinite(target) || target <= 0) return { error: "missing_target_income", data_source: data.source };
      if (rate == null || !Number.isFinite(rate) || rate <= 0) return { error: "missing_rate", data_source: data.source };
      if (!start || !end) return { error: "missing_range", data_source: data.source };

      const mapped = completedLessons.map((l) => ({ ...l, amountCents: effectiveCents(l, studentsById) }));
      const series = weeklyRevenueSeries(mapped, start, end);
      const activeStudents = new Set(mapped.map((l) => l.studentId));
      const totalMins = mapped.reduce((s, l) => s + (l.durationMinutes ?? 0), 0);
      const totalHours = totalMins / 60;
      const weeks = series.length;
      const explicitHours =
        typeof resolvedParams.hours_per_student_per_week === "number"
          ? resolvedParams.hours_per_student_per_week
          : typeof resolvedParams.hours_per_student_per_week === "string"
            ? Number(resolvedParams.hours_per_student_per_week)
            : null;
      const hoursPerStudentPerWeek =
        explicitHours != null && Number.isFinite(explicitHours) && explicitHours > 0
          ? explicitHours
          : weeks > 0 && activeStudents.size > 0
            ? totalHours / weeks / activeStudents.size
            : 0;
      if (hoursPerStudentPerWeek <= 0) return { error: "insufficient_history", data_source: data.source };
      const incomePerStudentYear = hoursPerStudentPerWeek * rate * 52;
      const needed = Math.ceil(target / incomePerStudentYear);
      return {
        lesson_count: completedLessons.length,
        weeks_count: weeks,
        active_students: activeStudents.size,
        rate_dollars_per_hour: rate,
        target_income_dollars: target,
        typical_weekly_hours_per_student: Math.round(hoursPerStudentPerWeek * 100) / 100,
        projected_income_per_student_year_dollars: Math.round(incomePerStudentYear * 100) / 100,
        students_needed: needed,
        data_source: data.source,
      };
    }
    case "tax_guidance": {
      const totalCents = completedLessons.reduce((acc, l) => acc + effectiveCents(l, studentsById), 0);
      const totalDollars = centsToDollars(totalCents);
      // Guidance only: do not present revenue as "tax owed".
      const lowPct = 0.25;
      const highPct = 0.3;
      const low = Math.round((totalDollars * lowPct) * 100) / 100;
      const high = Math.round((totalDollars * highPct) * 100) / 100;
      return {
        lesson_count: completedLessons.length,
        total_dollars: totalDollars,
        suggested_set_aside_low_dollars: low,
        suggested_set_aside_high_dollars: high,
        note:
          "This is guidance only (not a tax calculation). Actual taxes depend on filing status, state, deductions, and other income.",
        data_source: data.source,
      };
    }
    case "forecast_monthly":
    case "forecast_yearly": {
      const earningsRows = data.lessons
        .filter((l) => l.completed)
        .map((l) => ({
          date: l.date,
          amount: effectiveCents(l, studentsById) / 100,
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

