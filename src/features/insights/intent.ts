/**
 * Insights intent schema and interpreter.
 * Rule-first intent detection with optional confidence for clarification.
 */
import type { ForecastIntent } from "@/lib/forecasts/types";
import { detectIntent } from "@/lib/forecasts/runForecast";

export type InsightsIntent =
  | "EARNINGS_SUMMARY"
  | "YOY_COMPARISON"
  | "MONTHLY_BREAKDOWN"
  | "STUDENT_EARNINGS"
  | "HOURLY_RATE_STATS"
  | "LESSON_COUNTS"
  | "FORECAST"
  | "WHAT_IF_RATE_CHANGE"
  | "WHAT_IF_ADD_STUDENTS"
  | "WHAT_IF_LOSE_STUDENTS"
  | "TAX_SET_ASIDE"
  | "CASH_FLOW"
  | "UNKNOWN";

export type IntentPayload = {
  intent: ForecastIntent;
  confidence: number;
  entities: {
    year?: number;
    year2?: number;
    month?: string;
    dateRange?: string;
    studentName?: string;
    studentId?: string;
    metric?: "percent" | "dollars" | "both";
    count?: number;
  };
  /** Map to schema intent for future use */
  schemaIntent: InsightsIntent;
};

const FORECAST_INTENT_TO_SCHEMA: Record<ForecastIntent, InsightsIntent> = {
  forecast: "FORECAST",
  tax_estimate: "TAX_SET_ASIDE",
  cash_flow: "CASH_FLOW",
  insight: "UNKNOWN",
  question_answer: "UNKNOWN",
  what_if: "WHAT_IF_RATE_CHANGE",
  general_qa: "EARNINGS_SUMMARY",
  percent_change: "YOY_COMPARISON",
};

/**
 * Interprets a question and returns structured intent + confidence.
 * Unknown or low-confidence → UNKNOWN so caller can ask for clarification.
 */
export function interpretInsightsQuestion(question: string): IntentPayload {
  const q = question.trim();
  const intent = detectIntent(q);
  const confidence = intent === "insight" ? 0.5 : 0.9;
  const entities: IntentPayload["entities"] = {};

  if (intent === "percent_change") {
    const yearMatch = q.match(/(\d{4})\s+than\s+(\d{4})|(\d{4})\s+vs\s+(\d{4})|(\d{4})\s+que\s+(\d{4})/i);
    if (yearMatch) {
      const y1 = parseInt(yearMatch[1] ?? yearMatch[3] ?? yearMatch[5] ?? "0", 10);
      const y2 = parseInt(yearMatch[2] ?? yearMatch[4] ?? yearMatch[6] ?? "0", 10);
      entities.year = Math.max(y1, y2);
      entities.year2 = Math.min(y1, y2);
    }
    entities.metric = /%|percent(age)?|百分之几/i.test(q) ? "percent" : "dollars";
  }

  let schemaIntent = FORECAST_INTENT_TO_SCHEMA[intent];
  if (intent === "what_if" && /\blose\s+my\s+top|lose\s+top\s+\d|top\s+\d\s+students?/i.test(q)) {
    schemaIntent = "WHAT_IF_LOSE_STUDENTS";
  } else if (intent === "what_if" && /\badd\s+\d+\s+new\s+students?|new\s+students?/i.test(q)) {
    schemaIntent = "WHAT_IF_ADD_STUDENTS";
  }

  return {
    intent,
    confidence,
    entities,
    schemaIntent,
  };
}
