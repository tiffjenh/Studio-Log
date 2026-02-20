import type { QueryPlan } from "./schema";
import type { InsightIntent } from "./schema";
import { parseToQueryPlan, type InsightsPriorContext } from "./parse";

export type RoutedInsightsQuestion = {
  intent_type: InsightIntent;
  params: {
    timeframe?: QueryPlan["time_range"];
    student_filter?: QueryPlan["student_filter"];
    year?: number | null;
    date_range?: { start?: string; end?: string };
    completed_only: boolean;
    metric_type?: string | null;
    slots?: Record<string, unknown>;
  };
  required_missing_params: string[];
  sql_truth_query_key: string;
  query_plan: QueryPlan;
};

export function routeInsightsQuestion(
  question: string,
  options?: { priorContext?: InsightsPriorContext }
): RoutedInsightsQuestion {
  const plan = parseToQueryPlan(question, options?.priorContext);
  return {
    intent_type: plan.intent,
    params: {
      timeframe: plan.time_range,
      student_filter: plan.student_filter,
      year: (plan.slots?.year as number | undefined)
        ?? (plan.time_range?.start ? parseInt(plan.time_range.start.slice(0, 4), 10) : null),
      date_range: plan.time_range ? { start: plan.time_range.start, end: plan.time_range.end } : undefined,
      completed_only: true,
      metric_type: plan.requested_metric ?? null,
      slots: plan.slots,
    },
    required_missing_params: plan.required_missing_params ?? [],
    sql_truth_query_key: plan.sql_truth_query_key ?? "clarification",
    query_plan: plan,
  };
}

