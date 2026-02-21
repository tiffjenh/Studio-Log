import type { Lesson, Student } from "@/types";
import type { ComputedResult, QueryPlan } from "./schema";
import { runTruthQuery } from "./truthQueries";

export type ComputeContext = {
  user_id?: string;
  lessons?: Lesson[];
  students?: Student[];
};

function confidenceFromOutputs(plan: QueryPlan, outputs: Record<string, unknown>): "high" | "medium" | "low" {
  if (outputs.error) return "low";
  if (plan.needs_clarification) return "low";
  const hasSignal =
    outputs.row != null ||
    outputs.total_dollars != null ||
    outputs.total_hours != null ||
    outputs.rows != null ||
    outputs.student_name != null ||
    outputs.missed_count != null ||
    outputs.completed_count != null ||
    outputs.student_count != null ||
    outputs.hourly_dollars != null ||
    outputs.percent_change != null ||
    outputs.projected_monthly_dollars != null ||
    outputs.projected_yearly_dollars != null ||
    outputs.dow_label != null ||
    outputs.lesson_count != null ||
    outputs.avg_lessons_per_week != null ||
    outputs.avg_dollars_per_lesson != null ||
    outputs.avg_weekly_dollars != null ||
    outputs.stability_label != null ||
    outputs.weekly_series != null ||
    outputs.projected_total_dollars != null ||
    outputs.delta_to_goal_dollars != null ||
    outputs.projected_weekly_dollars != null ||
    outputs.expected_lost_dollars != null ||
    outputs.students_needed != null ||
    outputs.suggested_set_aside_low_dollars != null;
  if (!hasSignal) return "low";
  if (plan.student_filter?.confidence != null && plan.student_filter.confidence < 0.8) return "low";
  return "high";
}

export async function computeFromPlan(
  plan: QueryPlan,
  ctx: ComputeContext
): Promise<ComputedResult> {
  if (plan.needs_clarification || plan.intent === "clarification") {
    return {
      intent: "clarification",
      query_key: "clarification",
      outputs: {
        needs_clarification: true,
        clarifying_question: plan.clarifying_question ?? "Could you clarify your question?",
      },
      confidence: "low",
    };
  }

  const params: Record<string, unknown> = {
    ...plan.slots,
    start_date: plan.time_range?.start,
    end_date: plan.time_range?.end,
    student_name: plan.student_filter?.student_name,
  };

  const outputs = await runTruthQuery(plan.sql_truth_query_key, ctx, params);
  const confidence = confidenceFromOutputs(plan, outputs);

  return {
    intent: plan.intent,
    query_key: plan.sql_truth_query_key,
    outputs,
    confidence,
    warnings: outputs.error ? [String(outputs.error)] : undefined,
  };
}
