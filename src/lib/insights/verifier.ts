import type { ComputedResult, QueryPlan } from "./schema";

export type VerifierResult = {
  passed: boolean;
  errors: string[];
  confidence: "high" | "medium" | "low";
};

function hasValidResult(out: Record<string, unknown>): boolean {
  if (out.error) return false;
  if (typeof out.total_dollars === "number") return true;
  if (typeof out.total_hours === "number") return true;
  if (typeof out.hourly_dollars === "number") return true;
  if (typeof out.student_name === "string" && (out.missed_count != null || out.completed_count != null || out.total_cents != null)) return true;
  if (typeof out.student_count === "number") return true;
  if (typeof out.dow_label === "string" && typeof out.total_dollars === "number") return true;
  if (Array.isArray(out.rows) && out.rows.length >= 0) return true;
  if (typeof out.percent_change === "number" || (out.percent_change == null && out.year_a != null)) return true;
  if (out.projected_monthly_dollars != null || out.projected_yearly_dollars != null) return true;
  if (out.attended_lessons != null || out.attendance_rate_percent != null) return true;
  if (out.avg_weekly_dollars != null) return true;
  if (out.avg_lessons_per_week != null) return true;
  if (out.projected_total_dollars != null || out.delta_dollars != null || out.delta_to_goal_dollars != null) return true;
  if (out.projected_weekly_dollars != null || out.delta_weekly_dollars != null) return true;
  if (out.expected_lost_dollars != null) return true;
  if (out.students_needed != null || out.projected_income_per_student_year_dollars != null) return true;
  if (out.suggested_set_aside_low_dollars != null || out.suggested_set_aside_high_dollars != null) return true;
  if (Array.isArray(out.weekly_series)) return true;
  if (typeof out.stability_label === "string") return true;
  return false;
}

export function runInsightsVerifier(
  plan: QueryPlan,
  computed: ComputedResult | null
): VerifierResult {
  const errors: string[] = [];
  if (!computed) return { passed: false, errors: ["No computed result."], confidence: "low" };

  const out = computed.outputs as Record<string, unknown>;
  if (out.error) errors.push(String(out.error));
  if (plan.needs_clarification && computed.intent !== "clarification") {
    errors.push("Clarification plan did not return clarification result.");
  }
  if (!plan.needs_clarification && computed.confidence === "low" && !hasValidResult(out)) {
    errors.push("Low confidence and no valid metric result.");
  }
  if (typeof out.total_dollars === "number" && out.total_dollars < 0) {
    errors.push("Negative total dollars.");
  }
  if (typeof out.hourly_dollars === "number" && out.hourly_dollars > 1000) {
    errors.push("Hourly rate out of expected range.");
  }

  const confidence = errors.length > 0 ? "low" : computed.confidence;
  return { passed: errors.length === 0, errors, confidence };
}
