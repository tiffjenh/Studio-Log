import type { InsightIntent } from "@/lib/insights/schema";

export type DeterministicIntent =
  | "EARNINGS_RANK_MAX"
  | "EARNINGS_RANK_MIN"
  | "ATTENDANCE_RANK_MISSED"
  | "ATTENDANCE_RANK_COMPLETED"
  | "UNIQUE_STUDENT_COUNT"
  | "TOTAL_EARNINGS_PERIOD"
  | "REVENUE_DELTA_SIMULATION"
  | "REVENUE_TARGET_PROJECTION";

export type DeterministicIntentSpec = {
  planIntent: InsightIntent;
  sqlKey: string;
  sql: string;
  defaultTimeframe: "CURRENT_YEAR";
};

export const DETERMINISTIC_INTENT_REGISTRY: Record<DeterministicIntent, DeterministicIntentSpec> = {
  EARNINGS_RANK_MAX: {
    planIntent: "revenue_per_student_in_period",
    sqlKey: "EARNINGS_RANK_MAX",
    sql: `SELECT student_id, SUM(amount_cents) AS total
FROM lessons
WHERE completed = true
AND lesson_date BETWEEN :start AND :end
GROUP BY student_id
ORDER BY total DESC
LIMIT 1;`,
    defaultTimeframe: "CURRENT_YEAR",
  },
  EARNINGS_RANK_MIN: {
    planIntent: "revenue_per_student_in_period",
    sqlKey: "EARNINGS_RANK_MIN",
    sql: `SELECT student_id, SUM(amount_cents) AS total
FROM lessons
WHERE completed = true
AND lesson_date BETWEEN :start AND :end
GROUP BY student_id
ORDER BY total ASC
LIMIT 1;`,
    defaultTimeframe: "CURRENT_YEAR",
  },
  ATTENDANCE_RANK_MISSED: {
    planIntent: "student_missed_most_lessons_in_year",
    sqlKey: "ATTENDANCE_RANK_MISSED",
    sql: `SELECT student_id, COUNT(*) AS missed_count
FROM lessons
WHERE completed = false
AND lesson_date BETWEEN :start AND :end
GROUP BY student_id
ORDER BY missed_count DESC
LIMIT 1;`,
    defaultTimeframe: "CURRENT_YEAR",
  },
  ATTENDANCE_RANK_COMPLETED: {
    planIntent: "student_completed_most_lessons_in_year",
    sqlKey: "ATTENDANCE_RANK_COMPLETED",
    sql: `SELECT student_id, COUNT(*) AS completed_count
FROM lessons
WHERE completed = true
AND lesson_date BETWEEN :start AND :end
GROUP BY student_id
ORDER BY completed_count DESC
LIMIT 1;`,
    defaultTimeframe: "CURRENT_YEAR",
  },
  UNIQUE_STUDENT_COUNT: {
    planIntent: "unique_student_count_in_period",
    sqlKey: "UNIQUE_STUDENT_COUNT",
    sql: `SELECT COUNT(DISTINCT student_id) AS student_count
FROM lessons
WHERE completed = true
AND lesson_date BETWEEN :start AND :end;`,
    defaultTimeframe: "CURRENT_YEAR",
  },
  TOTAL_EARNINGS_PERIOD: {
    planIntent: "earnings_in_period",
    sqlKey: "TOTAL_EARNINGS_PERIOD",
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
FROM lessons
WHERE completed = true
AND lesson_date BETWEEN :start AND :end;`,
    defaultTimeframe: "CURRENT_YEAR",
  },
  REVENUE_DELTA_SIMULATION: {
    planIntent: "what_if_rate_change",
    sqlKey: "REVENUE_DELTA_SIMULATION",
    sql: `SELECT
  SUM(duration_minutes) / 60.0 AS total_hours,
  COALESCE(SUM(amount_cents), 0) AS current_total_cents
FROM lessons
WHERE completed = true
AND lesson_date BETWEEN :start AND :end;`,
    defaultTimeframe: "CURRENT_YEAR",
  },
  REVENUE_TARGET_PROJECTION: {
    planIntent: "students_needed_for_target_income",
    sqlKey: "REVENUE_TARGET_PROJECTION",
    sql: `SELECT
  COUNT(DISTINCT student_id) AS active_students,
  COALESCE(SUM(duration_minutes), 0) AS total_minutes
FROM lessons
WHERE completed = true
AND lesson_date BETWEEN :start AND :end;`,
    defaultTimeframe: "CURRENT_YEAR",
  },
};

export function getDeterministicIntentSpec(intent: DeterministicIntent): DeterministicIntentSpec {
  return DETERMINISTIC_INTENT_REGISTRY[intent];
}
