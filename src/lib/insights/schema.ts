import { z } from "zod";

export const timeRangeTypeEnum = z.enum(["custom", "month", "year", "ytd", "rolling_days", "all"]);
export type TimeRangeType = z.infer<typeof timeRangeTypeEnum>;

export const timeRangeSchema = z.object({
  type: timeRangeTypeEnum,
  start: z.string(),
  end: z.string(),
  label: z.string().optional(),
});
export type TimeRange = z.infer<typeof timeRangeSchema>;

export const studentFilterSchema = z.object({
  student_id: z.string().optional(),
  student_name: z.string().optional(),
  matched_name: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type StudentFilter = z.infer<typeof studentFilterSchema>;

export const insightIntentEnum = z.enum([
  "student_highest_hourly_rate",
  "student_lowest_hourly_rate",
  "students_below_average_rate",
  "earnings_in_period",
  "earnings_ytd_for_student",
  "student_missed_most_lessons_in_year",
  "student_attendance_summary",
  "revenue_per_student_in_period",
  "forecast_monthly",
  "forecast_yearly",
  "percent_change_yoy",
  "average_hourly_rate_in_period",
  "general_fallback",
  "clarification",
]);
export type InsightIntent = z.infer<typeof insightIntentEnum>;

export const queryPlanSchema = z.object({
  intent: insightIntentEnum,
  normalized_query: z.string(),
  time_range: timeRangeSchema.optional(),
  student_filter: studentFilterSchema.optional(),
  requested_metric: z.enum(["percent", "dollars", "who", "count", "rate"]).optional(),
  needs_clarification: z.boolean(),
  clarifying_question: z.string().nullable().optional(),
  required_missing_params: z.array(z.string()).optional(),
  sql_truth_query_key: z.string(),
  slots: z.record(z.string(), z.unknown()).optional(),
});
export type QueryPlan = z.infer<typeof queryPlanSchema>;

export const computedResultSchema = z.object({
  intent: insightIntentEnum,
  query_key: z.string(),
  outputs: z.record(z.string(), z.unknown()),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string()).optional(),
});
export type ComputedResult = z.infer<typeof computedResultSchema>;

export type InsightsTrace = {
  query: string;
  normalized_query: string;
  queryPlan: QueryPlan;
  sqlQueryKey: string;
  sqlParams: Record<string, unknown>;
  sqlResultSummary: Record<string, unknown> | null;
  computedResult: ComputedResult | null;
  verifierPassed: boolean;
  verifierErrors: string[];
  finalAnswerText: string;
};
