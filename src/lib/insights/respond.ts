import type { ComputedResult } from "./schema";

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function resultToAnswer(computed: ComputedResult): string {
  const { intent, outputs } = computed;
  const out = outputs as Record<string, unknown>;

  if (intent === "clarification") {
    return (out.clarifying_question as string | undefined) ?? "Could you clarify your question?";
  }
  if (out.error) {
    return "I’m not confident in that result. Could you clarify what you mean?";
  }

  switch (intent) {
    case "earnings_in_period":
      return `Total earnings for that period: ${fmt((out.total_dollars as number) ?? 0)}.`;
    case "earnings_ytd_for_student": {
      return `YTD earnings from ${out.student_name ?? "that student"}: ${fmt((out.total_dollars as number) ?? 0)}.`;
    }
    case "student_highest_hourly_rate":
      return `Highest hourly rate: ${out.student_name} at ${fmt((out.hourly_dollars as number) ?? 0)}/hour.`;
    case "student_lowest_hourly_rate":
      return `Lowest hourly rate: ${out.student_name} at ${fmt((out.hourly_dollars as number) ?? 0)}/hour.`;
    case "students_below_average_rate": {
      const rows = (out.rows as Array<{ student_name: string; hourly_dollars: number }>) ?? [];
      if (!rows.length) return `No students are below your average rate (${fmt((out.avg_hourly_dollars as number) ?? 0)}/hour).`;
      return `Below average (${fmt((out.avg_hourly_dollars as number) ?? 0)}/hour): ${rows.map((r) => `${r.student_name} (${fmt(r.hourly_dollars)}/hour)`).join(", ")}.`;
    }
    case "student_missed_most_lessons_in_year":
      return `Most missed lessons: ${out.student_name} with ${out.missed_count ?? 0} missed lessons.`;
    case "student_attendance_summary":
      return `${out.student_name}: ${out.attended_lessons ?? 0} attended, ${out.missed_lessons ?? 0} missed (${out.attendance_rate_percent ?? 0}% attendance).`;
    case "revenue_per_student_in_period": {
      const rows = (out.rows as Array<{ student_name: string; total_dollars: number }>) ?? [];
      if (!rows.length) return "No completed lessons found for that period.";
      return `Top students by revenue: ${rows.slice(0, 3).map((r) => `${r.student_name} (${fmt(r.total_dollars)})`).join(", ")}.`;
    }
    case "forecast_monthly":
      return `Projected monthly earnings: ${fmt((out.projected_monthly_dollars as number) ?? 0)}.`;
    case "forecast_yearly":
      return `Projected yearly earnings: ${fmt((out.projected_yearly_dollars as number) ?? 0)}.`;
    case "average_hourly_rate_in_period":
      return `Average hourly rate for that period: ${fmt((out.hourly_dollars as number) ?? 0)}/hour.`;
    case "percent_change_yoy": {
      const pct = out.percent_change as number | null;
      if (pct == null) return "Percent change is undefined because the earlier year has zero earnings.";
      return `${out.year_b} vs ${out.year_a}: ${pct.toFixed(1)}% (${fmt((out.dollar_change_dollars as number) ?? 0)} difference).`;
    }
    default:
      return "I’m not sure I understood that. Could you clarify the metric and time range?";
  }
}
