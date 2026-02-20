/**
 * Maps intent -> metric key and required params. If required info is missing,
 * ask clarifying question; do NOT default to total earnings.
 */

import type { InsightIntent } from "../schema";
import type { MetricKey, IntentMetricSpec } from "./metricTypes";

const REGISTRY: Partial<Record<InsightIntent, IntentMetricSpec>> = {
  earnings_in_period: {
    metric: "earnings_in_period",
    required_params: ["start_date", "end_date"],
    default_date_range: "last_30_days",
  },
  earnings_ytd_for_student: {
    metric: "earnings_ytd_for_student",
    required_params: ["start_date", "end_date", "student"],
    default_date_range: "ytd",
  },
  student_highest_hourly_rate: {
    metric: "student_highest_hourly_rate",
    required_params: ["start_date", "end_date"],
    default_date_range: "ytd",
  },
  student_lowest_hourly_rate: {
    metric: "student_lowest_hourly_rate",
    required_params: ["start_date", "end_date"],
    default_date_range: "ytd",
  },
  average_hourly_rate_in_period: {
    metric: "average_hourly_rate_in_period",
    required_params: ["start_date", "end_date"],
    default_date_range: "ytd",
  },
  students_below_average_rate: {
    metric: "students_below_average_rate",
    required_params: ["start_date", "end_date"],
    default_date_range: "ytd",
  },
  day_of_week_earnings_max: {
    metric: "day_of_week_earnings_max",
    required_params: ["start_date", "end_date"],
    default_date_range: "ytd",
  },
  student_missed_most_lessons_in_year: {
    metric: "student_missed_most_lessons_in_year",
    required_params: ["start_date", "end_date", "year"],
    default_date_range: "last_year",
  },
  student_attendance_summary: {
    metric: "student_attendance_summary",
    required_params: ["start_date", "end_date", "student"],
    default_date_range: "ytd",
  },
  revenue_per_student_in_period: {
    metric: "revenue_per_student_in_period",
    required_params: ["start_date", "end_date"],
    default_date_range: "ytd",
  },
  percent_change_yoy: {
    metric: "percent_change_yoy",
    required_params: ["year_a", "year_b"],
    default_date_range: "last_year",
  },
  forecast_monthly: { metric: "forecast_monthly", required_params: [] },
  forecast_yearly: { metric: "forecast_yearly", required_params: [] },
};

export function getMetricForIntent(intent: InsightIntent): MetricKey | null {
  const spec = REGISTRY[intent];
  return spec ? spec.metric : null;
}

export function getRequiredParams(intent: InsightIntent): string[] {
  const spec = REGISTRY[intent];
  return spec ? spec.required_params : [];
}

export function getDefaultDateRange(intent: InsightIntent): "ytd" | "last_30_days" | "last_year" | "this_month" | undefined {
  const spec = REGISTRY[intent];
  return spec ? spec.default_date_range : undefined;
}
