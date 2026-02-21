import type { ComputedResult } from "./schema";
import {
  formatEarningsInPeriod,
  formatLessonsCountInPeriod,
  formatHoursTotalInPeriod,
  formatAvgLessonsPerWeekInPeriod,
  formatRevenuePerLessonInPeriod,
  formatEarningsYtdStudent,
  formatHighestLowestHourly,
  formatAverageHourly,
  formatBelowAverage,
  formatDayOfWeekMax,
  formatMissedMost,
  formatCompletedMost,
  formatAttendanceSummary,
  formatUniqueStudentCount,
  formatRevenuePerStudent,
  formatAvgWeeklyRevenue,
  formatCashFlowTrend,
  formatIncomeStability,
  formatPercentChangeYoy,
  formatForecast,
  formatWhatIfRateChange,
  formatWhatIfAddStudents,
  formatWhatIfTakeTimeOff,
  formatWhatIfLoseTopStudents,
  formatStudentsNeededForTargetIncome,
  formatOnTrackGoal,
  formatTaxGuidance,
} from "./formatAnswer";

export function resultToAnswer(computed: ComputedResult): string {
  const { intent, outputs } = computed;
  const out = outputs as Record<string, unknown>;

  if (intent === "clarification") {
    return (out.clarifying_question as string | undefined) ?? "Could you clarify your question?";
  }
  if (out.error) {
    return "I'm not confident in that result. Could you clarify what you mean?";
  }

  switch (intent) {
    case "earnings_in_period":
      return formatEarningsInPeriod(out);
    case "lessons_count_in_period":
      return formatLessonsCountInPeriod(out);
    case "hours_total_in_period":
      return formatHoursTotalInPeriod(out);
    case "avg_lessons_per_week_in_period":
      return formatAvgLessonsPerWeekInPeriod(out);
    case "revenue_per_lesson_in_period":
      return formatRevenuePerLessonInPeriod(out);
    case "earnings_ytd_for_student":
      return formatEarningsYtdStudent(out);
    case "student_highest_hourly_rate":
    case "student_lowest_hourly_rate":
      return formatHighestLowestHourly(out);
    case "students_below_average_rate":
      return formatBelowAverage(out);
    case "day_of_week_earnings_max":
      return formatDayOfWeekMax(out);
    case "student_missed_most_lessons_in_year":
      return formatMissedMost(out);
    case "student_completed_most_lessons_in_year":
      return formatCompletedMost(out);
    case "student_attendance_summary":
      return formatAttendanceSummary(out);
    case "unique_student_count_in_period":
      return formatUniqueStudentCount(out);
    case "revenue_per_student_in_period":
      return formatRevenuePerStudent(out);
    case "avg_weekly_revenue":
      return formatAvgWeeklyRevenue(out);
    case "cash_flow_trend":
      return formatCashFlowTrend(out);
    case "income_stability":
      return formatIncomeStability(out);
    case "what_if_rate_change":
      return formatWhatIfRateChange(out);
    case "what_if_add_students":
      return formatWhatIfAddStudents(out);
    case "what_if_take_time_off":
      return formatWhatIfTakeTimeOff(out);
    case "what_if_lose_top_students":
      return formatWhatIfLoseTopStudents(out);
    case "students_needed_for_target_income":
      return formatStudentsNeededForTargetIncome(out);
    case "on_track_goal":
      return formatOnTrackGoal(out);
    case "tax_guidance":
      return formatTaxGuidance(out);
    case "forecast_monthly":
    case "forecast_yearly":
      return formatForecast(out);
    case "average_hourly_rate_in_period":
      return formatAverageHourly(out);
    case "percent_change_yoy":
      return formatPercentChangeYoy(out);
    default:
      return "I'm not sure I understood that. Could you clarify the metric and time range?";
  }
}
