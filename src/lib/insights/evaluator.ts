import type { EarningsRow, StudentSummary } from "@/lib/forecasts/types";
import { askInsights } from "./pipeline";
import { routeInsightsQuestion, type RoutedInsightsQuestion } from "./router";
import { runTruthQuery } from "./truthQueries";
import type { InsightsPriorContext } from "./parse";

export type InsightsGeneratedQuestion = {
  id: string;
  language: "en" | "es" | "zh";
  text: string;
  expected_intent?: string;
  expected_metric?: string;
  notes?: string;
  truth_query_key?: string;
  truth_params?: Record<string, unknown>;
  expects_clarification?: boolean;
  conversation_group?: string | null;
};

export type InsightsEvaluationRow = {
  id: string;
  question: string;
  language: string;
  expected_intent?: string;
  expected_metric?: string;
  detected_intent: string;
  routed_intent: string;
  expected_metric_value: string;
  got_metric_value: string;
  sql_truth_query_key: string;
  truth_result: Record<string, unknown> | null;
  llm_answer: string;
  verdict: "PASS" | "FAIL";
  fail_reasons: string[];
};

function parseDollars(text: string): number[] {
  const matches = text.match(/\$-?\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((m) => parseFloat(m.replace(/[$,]/g, ""))).filter((n) => Number.isFinite(n));
}

function parsePercents(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?\s*%/g) ?? [];
  return matches.map((m) => parseFloat(m.replace("%", "").trim())).filter((n) => Number.isFinite(n));
}

function hasWrongDefault(text: string): boolean {
  return /you have\s+\d+\s+earnings entries|projected monthly earnings/i.test(text.toLowerCase());
}

function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function includesInsensitive(text: string, piece: string): boolean {
  return text.toLowerCase().includes(piece.toLowerCase());
}

function truthMetricValue(truth: Record<string, unknown> | null): string {
  if (!truth) return "null";
  if (truth.error) return String(truth.error);
  if (typeof truth.total_dollars === "number") return String(truth.total_dollars);
  if (typeof truth.hourly_dollars === "number") return String(truth.hourly_dollars);
  if (typeof truth.percent_change === "number") return String(truth.percent_change);
  if (typeof truth.student_name === "string") return truth.student_name;
  if (typeof truth.dow_label === "string") return `${truth.dow_label}:${truth.total_dollars ?? 0}`;
  if (typeof truth.missed_count === "number") return `${truth.student_name ?? ""}:${truth.missed_count}`;
  if (Array.isArray(truth.rows)) return `rows:${truth.rows.length}`;
  return JSON.stringify(truth);
}

function answerMetricValue(answer: string): string {
  const dollars = parseDollars(answer);
  if (dollars.length > 0) return String(dollars[0]);
  const percents = parsePercents(answer);
  if (percents.length > 0) return String(percents[0]);
  return answer.slice(0, 80);
}

function gradeAnswer(
  question: InsightsGeneratedQuestion,
  routed: RoutedInsightsQuestion,
  truth: Record<string, unknown> | null,
  answer: string,
  needsClarification: boolean
): string[] {
  const reasons: string[] = [];
  const q = question.text.toLowerCase();

  const expectedClarify = Boolean(question.expects_clarification || question.expected_intent === "clarification");
  if (expectedClarify && !needsClarification) {
    reasons.push("missing_clarification");
  }
  if (!expectedClarify && needsClarification) {
    reasons.push("unexpected_clarification");
  }
  if (expectedClarify) return reasons;

  if (question.expected_intent && routed.intent_type !== question.expected_intent) {
    reasons.push(`intent_mismatch:${routed.intent_type}`);
  }

  if (!/count|entries|lessons?/i.test(q) && hasWrongDefault(answer)) {
    reasons.push("irrelevant_default_template");
  }

  if (truth) {
    if (typeof truth.total_dollars === "number") {
      const parsed = parseDollars(answer);
      const expected = truth.total_dollars as number;
      const tolerance = Math.max(0.01, Math.abs(expected) * 0.01);
      if (parsed.length === 0 || !parsed.some((n) => approxEqual(n, expected, tolerance))) {
        reasons.push("numeric_mismatch:total_dollars");
      }
    }
    if (typeof truth.hourly_dollars === "number") {
      const parsed = parseDollars(answer);
      const expected = truth.hourly_dollars as number;
      if (parsed.length === 0 || !parsed.some((n) => approxEqual(n, expected, 0.01))) {
        reasons.push("numeric_mismatch:hourly_dollars");
      }
    }
    if (typeof truth.percent_change === "number") {
      const parsedPct = parsePercents(answer);
      const expected = truth.percent_change as number;
      if (parsedPct.length === 0 || !parsedPct.some((n) => approxEqual(n, expected, 0.1))) {
        reasons.push("percent_missing_or_mismatch");
      }
    }
    if (typeof truth.student_name === "string" && !includesInsensitive(answer, truth.student_name)) {
      reasons.push("student_entity_mismatch");
    }
    if (typeof truth.dow_label === "string") {
      if (!includesInsensitive(answer, truth.dow_label)) reasons.push("dow_entity_mismatch");
      const parsed = parseDollars(answer);
      const expected = (truth.total_dollars as number) ?? 0;
      if (parsed.length > 0 && !parsed.some((n) => approxEqual(n, expected, Math.max(0.01, expected * 0.01)))) {
        reasons.push("numeric_mismatch:day_total");
      }
    }
    if (typeof truth.missed_count === "number" && typeof truth.student_name === "string") {
      if (!includesInsensitive(answer, truth.student_name)) reasons.push("student_entity_mismatch");
    }
  }

  return reasons;
}

function buildTruthParams(
  routed: RoutedInsightsQuestion,
  question: InsightsGeneratedQuestion
): Record<string, unknown> {
  if (question.truth_params) return question.truth_params;
  const params: Record<string, unknown> = {};
  if (routed.params.date_range?.start) params.start_date = routed.params.date_range.start;
  if (routed.params.date_range?.end) params.end_date = routed.params.date_range.end;
  if (routed.params.year != null) params.year = routed.params.year;
  if (routed.params.student_filter?.student_name) params.student_name = routed.params.student_filter.student_name;
  if (routed.params.metric_type) params.requested_metric = routed.params.metric_type;
  if (routed.params.slots) Object.assign(params, routed.params.slots);

  // Align truth defaults with computeFromPlan defaults (this_year when no explicit timeframe).
  if (!params.start_date && !params.end_date) {
    const tr = routed.params.timeframe;
    const now = new Date();
    const y = now.getFullYear();
    if (tr?.label === "last_month") {
      const start = new Date(y, now.getMonth() - 1, 1);
      const end = new Date(y, now.getMonth(), 0);
      params.start_date = start.toISOString().slice(0, 10);
      params.end_date = end.toISOString().slice(0, 10);
    } else if (tr?.label === "this_month") {
      const start = new Date(y, now.getMonth(), 1);
      const end = new Date(y, now.getMonth() + 1, 0);
      params.start_date = start.toISOString().slice(0, 10);
      params.end_date = end.toISOString().slice(0, 10);
    } else if (tr?.type === "year" && tr.start && tr.end) {
      params.start_date = tr.start;
      params.end_date = tr.end;
    } else if (tr?.type === "all") {
      // leave undefined = all rows
    } else {
      params.start_date = `${y}-01-01`;
      params.end_date = now.toISOString().slice(0, 10);
    }
  }
  return params;
}

export async function evaluateInsightsQuestion(
  question: InsightsGeneratedQuestion,
  ctx: {
    user_id?: string;
    earnings: EarningsRow[];
    students: StudentSummary[];
    lessons?: import("@/types").Lesson[];
    roster?: import("@/types").Student[];
    timezone: string;
    locale?: string;
  },
  priorContext?: InsightsPriorContext
): Promise<{ row: InsightsEvaluationRow; nextContext: InsightsPriorContext | undefined }> {
  const routed = routeInsightsQuestion(question.text, { priorContext });
  const truthKey = question.truth_query_key ?? routed.sql_truth_query_key;
  const truthParams = buildTruthParams(routed, question);
  const truth = routed.required_missing_params.length > 0
    ? null
    : await runTruthQuery(truthKey, { user_id: ctx.user_id, lessons: ctx.lessons, students: ctx.roster }, truthParams);

  const res = await askInsights(question.text, {
    user_id: ctx.user_id,
    lessons: ctx.lessons,
    roster: ctx.roster,
    earnings: ctx.earnings,
    students: ctx.students,
    timezone: ctx.timezone,
    locale: ctx.locale,
    priorContext,
  });

  const failReasons = gradeAnswer(
    question,
    routed,
    truth,
    res.finalAnswerText,
    res.needsClarification
  );
  if ((res.trace?.verifierErrors?.length ?? 0) > 0) failReasons.push(...(res.trace?.verifierErrors ?? []).map((e) => `verifier:${e}`));

  const row: InsightsEvaluationRow = {
    id: question.id,
    question: question.text,
    language: question.language,
    expected_intent: question.expected_intent,
    expected_metric: question.expected_metric,
    detected_intent: routed.intent_type,
    routed_intent: routed.intent_type,
    expected_metric_value: truthMetricValue(truth),
    got_metric_value: answerMetricValue(res.finalAnswerText),
    sql_truth_query_key: truthKey,
    truth_result: truth,
    llm_answer: res.finalAnswerText,
    verdict: failReasons.length === 0 ? "PASS" : "FAIL",
    fail_reasons: failReasons,
  };

  const nextContext: InsightsPriorContext | undefined = res.trace?.queryPlan
    ? {
      intent: res.trace.queryPlan.intent,
      time_range: res.trace.queryPlan.time_range,
      student_filter: res.trace.queryPlan.student_filter,
      slots: res.trace.queryPlan.slots,
    }
    : undefined;

  return { row, nextContext };
}

