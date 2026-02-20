/**
 * Canonical metric input/output types. All numeric answers MUST come from
 * these metrics (ground truth); no LLM math.
 */

export type MetricKey =
  | "earnings_in_period"
  | "earnings_in_period_scheduled"
  | "earnings_ytd_for_student"
  | "student_highest_hourly_rate"
  | "student_lowest_hourly_rate"
  | "average_hourly_rate_in_period"
  | "students_below_average_rate"
  | "day_of_week_earnings_max"
  | "student_missed_most_lessons_in_year"
  | "student_attendance_summary"
  | "revenue_per_student_in_period"
  | "percent_change_yoy"
  | "forecast_monthly"
  | "forecast_yearly";

export type MetricInput = {
  user_id?: string;
  start_date: string; // YYYY-MM-DD inclusive
  end_date: string;   // YYYY-MM-DD inclusive
  student_id?: string;
  student_name?: string;
  student_ids?: string[]; // multiple students e.g. "Tyler and Emily"
  year?: number;
  year_a?: number;
  year_b?: number;
};

export type MetricResult =
  | { total_cents: number; total_dollars: number }
  | { student_id: string; student_name: string; total_cents: number; total_dollars: number }
  | { student_id: string; student_name: string; hourly_cents: number; hourly_dollars: number }
  | { row: null }
  | { avg_hourly_cents: number; avg_hourly_dollars: number; rows: Array<{ student_id: string; student_name: string; hourly_cents: number; hourly_dollars: number }> }
  | { dow: number; dow_label: string; total_cents: number; total_dollars: number }
  | { student_id: string; student_name: string; missed_count: number }
  | { student_id: string; student_name: string; total_lessons: number; attended_lessons: number; missed_lessons: number; attendance_rate_percent: number | null }
  | { rows: Array<{ student_id: string; student_name: string; total_cents: number; total_dollars: number }> }
  | { year_a: number; year_b: number; total_a_dollars: number; total_b_dollars: number; dollar_change_dollars: number; percent_change: number | null }
  | { projected_monthly_dollars: number | null; projected_yearly_dollars: number | null; avg_weekly_dollars: number | null; trend: string }
  | { error: string };

export type IntentMetricSpec = {
  metric: MetricKey;
  required_params: ("start_date" | "end_date" | "student" | "year" | "year_a" | "year_b")[];
  default_date_range?: "ytd" | "last_30_days" | "last_year" | "this_month";
};
