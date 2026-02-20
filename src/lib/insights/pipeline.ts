import type { EarningsRow, StudentSummary } from "@/lib/forecasts/types";
import type { Lesson, Student } from "@/types";
import { parseToQueryPlan } from "./parse";
import { computeFromPlan } from "./compute";
import { runInsightsSupabaseSanityCheck } from "./truthQueries";
import { resultToAnswer } from "./respond";
import { runInsightsVerifier } from "./verifier";
import { type ComputedResult, type InsightsTrace, type QueryPlan } from "./schema";
import type { InsightsPriorContext } from "./parse";

export type InsightsMetadata = {
  /** Number of completed lessons included in the computation. */
  lesson_count: number;
  /** Human-readable date range label (e.g. "January 2026", "2025 YTD"). */
  date_range_label: string;
  /** Always true — earnings use completed lessons only (amount_cents WHERE completed=true). */
  completed_only: true;
  /** Which router was used for intent classification. */
  router_used: "llm" | "regex";
  explainability?: {
    metricId: string;
    dateRange: { start: string | null; end: string | null; label: string };
    filters: { completedOnly: true; studentIds?: string[] };
    counts: { lessonsConsidered: number; completedLessons: number };
    aggregation: { type: string; formula: string };
  };
};

export type AskInsightsContext = {
  user_id?: string;
  lessons?: Lesson[];
  roster?: Student[];
  earnings: EarningsRow[];
  students?: StudentSummary[];
  timezone?: string;
  locale?: string;
  priorContext?: InsightsPriorContext;
};

export type AskInsightsResult = {
  finalAnswerText: string;
  computedResult: ComputedResult | null;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
  metadata: InsightsMetadata;
  /** Full trace (queryPlan, verifier, etc.) for dev/debug. */
  trace?: InsightsTrace;
  /** If true, pipeline used deterministic path; otherwise fell back to runForecast for narrative. */
  usedPipeline: boolean;
};

function isDebugEnabled(): boolean {
  if (import.meta.env.VITE_DEBUG_INSIGHTS === "1") return true;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    Boolean((window as unknown as { DEBUG_INSIGHTS?: boolean }).DEBUG_INSIGHTS) ||
    localStorage.getItem("insights_debug") === "1" ||
    params.get("debug") === "1"
  );
}

function mapRouterIntentToPlanIntent(raw: string): QueryPlan["intent"] {
  const x = raw.toLowerCase();
  if (x === "highest_hourly_student" || x === "most_per_hour") return "student_highest_hourly_rate";
  if (x === "lowest_hourly_student" || x === "lowest_student_by_hourly_rate") return "student_lowest_hourly_rate";
  if (x === "lowest_student_by_revenue") return "revenue_per_student_in_period";
  if (x === "students_below_avg_rate") return "students_below_average_rate";
  if (x === "earnings_by_range" || x === "earnings_total" || x === "earnings_in_month" || x === "earnings_by_student") return "earnings_in_period";
  if (x === "student_ytd" || x === "student_earnings_for_year") return "earnings_ytd_for_student";
  if (x === "revenue_per_student_breakdown" || x === "top_student_by_earnings") return "revenue_per_student_in_period";
  if (x === "revenue_per_lesson") return "revenue_per_lesson_in_period";
  if (x === "avg_monthly_earnings" || x === "best_month" || x === "worst_month") return "earnings_in_period";
  if (x === "revenue_per_hour" || x === "avg_hourly_rate") return "average_hourly_rate_in_period";
  if (x === "forecast") return "forecast_monthly";
  if (x === "percent_change_yoy") return "percent_change_yoy";
  if (x === "best_day_of_week" || x === "day_of_week_earnings") return "day_of_week_earnings_max";
  if (x === "cash_flow" || x === "cashflow_trend") return "cash_flow_trend";
  if (x === "income_stability") return "income_stability";
  if (x === "avg_weekly_revenue") return "avg_weekly_revenue";
  if (x === "lessons_count") return "lessons_count_in_period";
  if (x === "total_hours" || x === "avg_lessons_per_week" || x === "tax_estimate" || x === "on_track" || x.startsWith("what_if_")) return "general_fallback";
  return "general_fallback";
}

async function classifyFallbackWithLlm(query: string): Promise<QueryPlan["intent"] | null> {
  try {
    const res = await fetch("/api/insights-router", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query, today: new Date().toISOString().slice(0, 10) }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.intent !== "string") return null;
    return mapRouterIntentToPlanIntent(data.intent);
  } catch {
    return null;
  }
}

function extractMetadata(
  computed: ComputedResult | null,
  earnings: EarningsRow[],
  plan: QueryPlan,
  routerUsed: "llm" | "regex"
): InsightsMetadata {
  const out = computed?.outputs as Record<string, unknown> | undefined;

  // Lesson count: prefer explicit truth outputs to avoid contradictory UI metadata.
  let lessonCount = 0;
  if (typeof out?.lessons_count === "number") {
    lessonCount = out.lessons_count;
  } else if (typeof out?.lesson_count === "number") {
    lessonCount = out.lesson_count;
  } else if (typeof out?.entries_count === "number") {
    lessonCount = out.entries_count;
  } else if (typeof out?.below_count === "number") {
    lessonCount = earnings.length;
  } else {
    // Count rows in the time range
    const start = (out?.start_date as string | undefined) ?? plan.time_range?.start;
    const end = (out?.end_date as string | undefined) ?? plan.time_range?.end;
    lessonCount = start && end
      ? earnings.filter((r) => r.date >= start! && r.date <= end!).length
      : earnings.length;
  }

  // Date range label: prefer from outputs, else derive from plan
  let label = (out?.label as string | undefined) ?? (out?.date_range_label as string | undefined) ?? "";
  if (!label && plan.time_range) {
    label = plan.time_range.label ?? plan.time_range.start?.slice(0, 7) ?? "";
  }
  if (!label) {
    const y = new Date().getFullYear();
    label = `${y} YTD`;
  }

  const aggregationByIntent: Record<QueryPlan["intent"], { type: string; formula: string }> = {
    student_highest_hourly_rate: { type: "argmax", formula: "max(student_hourly_rate_dollars)" },
    student_lowest_hourly_rate: { type: "argmin", formula: "min(student_hourly_rate_dollars)" },
    students_below_average_rate: { type: "filter", formula: "student_hourly_rate_dollars < avg_hourly_rate_dollars" },
    earnings_in_period: { type: "sum", formula: "sum(amount_dollars)" },
    lessons_count_in_period: { type: "count", formula: "count(completed_lessons)" },
    revenue_per_lesson_in_period: { type: "ratio", formula: "sum(amount_dollars) / count(completed_lessons)" },
    earnings_ytd_for_student: { type: "sum", formula: "sum(amount_dollars where student=target)" },
    student_missed_most_lessons_in_year: { type: "argmax", formula: "max(missed_lessons_count)" },
    student_attendance_summary: { type: "ratio", formula: "attended_lessons / scheduled_lessons" },
    revenue_per_student_in_period: { type: "group_by", formula: "sum(amount_dollars) by student" },
    avg_weekly_revenue: { type: "ratio", formula: "sum(amount_dollars) / week_count" },
    cash_flow_trend: { type: "timeseries", formula: "weekly sum(amount_dollars) + direction" },
    income_stability: { type: "dispersion", formula: "coefficient_of_variation(weekly revenue)" },
    forecast_monthly: { type: "forecast", formula: "projected_monthly_dollars" },
    forecast_yearly: { type: "forecast", formula: "projected_yearly_dollars" },
    percent_change_yoy: { type: "percent_change", formula: "(current - previous) / previous" },
    average_hourly_rate_in_period: { type: "ratio", formula: "sum(amount_dollars) / sum(hours)" },
    day_of_week_earnings_max: { type: "argmax", formula: "max(sum(amount_dollars) by weekday)" },
    general_fallback: { type: "fallback", formula: "deterministic fallback response" },
    clarification: { type: "clarification", formula: "missing required parameters" },
  };
  const agg = aggregationByIntent[plan.intent] ?? { type: "unknown", formula: "unknown" };

  return {
    lesson_count: lessonCount,
    date_range_label: label,
    completed_only: true,
    router_used: routerUsed,
    explainability: {
      metricId: plan.sql_truth_query_key,
      dateRange: {
        start: plan.time_range?.start ?? null,
        end: plan.time_range?.end ?? null,
        label,
      },
      filters: {
        completedOnly: true,
        studentIds: plan.student_filter?.student_id ? [plan.student_filter.student_id] : undefined,
      },
      counts: {
        lessonsConsidered: lessonCount,
        completedLessons: lessonCount,
      },
      aggregation: agg,
    },
  };
}
export async function askInsights(questionText: string, context: AskInsightsContext): Promise<AskInsightsResult> {
  const query = (questionText || "Show my earnings summary").trim();
  const { earnings, lessons, roster, priorContext } = context;
  const debug = isDebugEnabled();
  let plan: QueryPlan = parseToQueryPlan(query, priorContext);
  let routerUsed: "llm" | "regex" = "regex";
  if (debug && context.user_id) {
    await runInsightsSupabaseSanityCheck(context.user_id);
  }

  if (
    plan.intent === "clarification" &&
    plan.required_missing_params?.includes("intent")
  ) {
    const llmIntent = await classifyFallbackWithLlm(query);
    if (llmIntent && llmIntent !== "general_fallback") {
      routerUsed = "llm";
      plan = {
        ...plan,
        intent: llmIntent,
        needs_clarification: false,
        clarifying_question: null,
        required_missing_params: [],
        sql_truth_query_key:
          llmIntent === "student_highest_hourly_rate" ? "student_highest_hourly_rate" :
            llmIntent === "student_lowest_hourly_rate" ? "student_lowest_hourly_rate" :
              llmIntent === "students_below_average_rate" ? "students_below_average_rate" :
                llmIntent === "earnings_ytd_for_student" ? "earnings_ytd_for_student" :
                  llmIntent === "revenue_per_student_in_period" ? "revenue_per_student_in_period" :
                  llmIntent === "lessons_count_in_period" ? "lessons_count_in_period" :
                    llmIntent === "revenue_per_lesson_in_period" ? "revenue_per_lesson_in_period" :
                    llmIntent === "average_hourly_rate_in_period" ? "average_hourly_rate_in_period" :
                      llmIntent === "forecast_monthly" ? "forecast_monthly" :
                        llmIntent === "percent_change_yoy" ? "percent_change_yoy" :
                          llmIntent === "day_of_week_earnings_max" ? "day_of_week_earnings_max" :
                            "earnings_in_period",
      };
    }
  }

  const trace: InsightsTrace = {
    query,
    normalized_query: plan.normalized_query,
    queryPlan: plan,
    sqlQueryKey: plan.sql_truth_query_key,
    sqlParams: {
      start_date: plan.time_range?.start,
      end_date: plan.time_range?.end,
      student_name: plan.student_filter?.student_name,
      ...plan.slots,
    },
    sqlResultSummary: null,
    computedResult: null,
    verifierPassed: false,
    verifierErrors: [],
    zeroCause: null,
    finalAnswerText: "",
  };

  // Clarification short-circuit
  if (plan.needs_clarification) {
    const clarifyingQuestion = plan.clarifying_question ?? "What would you like to know?";
    trace.finalAnswerText = clarifyingQuestion;
    const meta = extractMetadata(null, earnings, plan, routerUsed);
    if (debug) console.log("[Insights] clarification trace", trace);
    return {
      finalAnswerText: clarifyingQuestion,
      computedResult: null,
      needsClarification: true,
      clarifyingQuestion,
      metadata: meta,
      trace,
      usedPipeline: true,
    };
  }

  const computed = await computeFromPlan(plan, {
    user_id: context.user_id,
    lessons,
    students: roster,
  });
  trace.computedResult = computed;
  trace.sqlResultSummary = computed.outputs;
  trace.zeroCause = (computed.outputs as Record<string, unknown>).zero_cause as string | null | undefined ?? null;

  const verifier = runInsightsVerifier(plan, computed);
  trace.verifierPassed = verifier.passed;
  trace.verifierErrors = verifier.errors;

  let finalAnswerText = resultToAnswer(computed);
  const out = computed.outputs as Record<string, unknown>;
  const hasValidMetric =
    !out.error &&
    (typeof out.total_dollars === "number" ||
      typeof out.hourly_dollars === "number" ||
      typeof out.student_name === "string" ||
      typeof out.dow_label === "string" ||
      Array.isArray(out.rows) ||
      out.percent_change != null ||
      out.projected_monthly_dollars != null ||
      out.projected_yearly_dollars != null ||
      out.attended_lessons != null ||
      out.avg_weekly_dollars != null ||
      Array.isArray(out.weekly_series) ||
      out.stability_label != null);
  if (!hasValidMetric && (!verifier.passed || verifier.confidence === "low")) {
    finalAnswerText =
      plan.clarifying_question ??
      "I’m not sure I have enough confidence to answer that. Did you mean earnings, attendance, rate, or forecast?";
  }
  const finalNeedsClarification =
    !hasValidMetric && (!verifier.passed || verifier.confidence === "low");
  trace.finalAnswerText = finalAnswerText;

  if (debug && verifier.errors.length > 0) {
    console.warn("[Insights] verifier errors", verifier.errors);
  }
  if (debug) {
    console.log("[Insights] debug", {
      raw_query: query,
      normalized_query: plan.normalized_query,
      detected_intent: plan.intent,
      needs_clarification: plan.needs_clarification,
      missing_params: plan.required_missing_params ?? [],
      entities: { student_filter: plan.student_filter, time_range: plan.time_range },
      sql_truth_query_key: plan.sql_truth_query_key,
      sql_params: trace.sqlParams,
      zero_cause: trace.zeroCause,
      sql_result_summary: trace.sqlResultSummary,
      final_response: finalAnswerText,
    });
  }

  const meta = extractMetadata(computed, earnings, plan, routerUsed);

  return {
    finalAnswerText,
    computedResult: computed,
    needsClarification: finalNeedsClarification,
    clarifyingQuestion: finalNeedsClarification ? finalAnswerText : null,
    metadata: meta,
    trace,
    usedPipeline: true,
  };
}
