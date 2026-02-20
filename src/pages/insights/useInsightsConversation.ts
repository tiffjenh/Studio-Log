/**
 * useInsightsConversation — multi-turn chat state for Insights.
 * Uses askInsights (deterministic parse → compute → verify → respond); falls back to runForecast for what-if narrative.
 */

import { useState, useCallback } from "react";
import { askInsights } from "@/lib/insights";
import type { ForecastResponse } from "@/lib/forecasts/types";
import type { EarningsRow, StudentSummary } from "@/lib/forecasts/types";
import { detectQueryLanguage, translateForInsights } from "@/utils/insightsLanguage";
import type { SupportedLocale } from "@/lib/forecasts/types";
import type { AskInsightsResult, InsightsMetadata } from "@/lib/insights";
import type { InsightIntent } from "@/lib/insights/schema";
import type { ForecastIntent } from "@/lib/forecasts/types";
import type { Lesson, Student } from "@/types";
import type { PendingInsightsClarification } from "@/lib/insights/clarification";
import { resolveInsightsClarification } from "@/lib/insights/clarification";


function mapInsightIntentToForecast(intent: InsightIntent): ForecastIntent {
  if (intent === "percent_change_yoy") return "percent_change";
  if (intent === "forecast_monthly" || intent === "forecast_yearly") return "forecast";
  if (intent === "clarification" || intent === "general_fallback") return "insight";
  return "general_qa";
}

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  meta?: {
    response?: ForecastResponse;
    insightsResult?: AskInsightsResult;
    metadata?: InsightsMetadata;
  };
};

export type UseInsightsConversationArgs = {
  userId?: string;
  lessons?: Lesson[];
  roster?: Student[];
  earnings: EarningsRow[];
  students: StudentSummary[];
  locale: SupportedLocale;
  timezone: string;
};

export function useInsightsConversation(args: UseInsightsConversationArgs) {
  const { userId, lessons, roster, earnings, students, locale, timezone } = args;
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingClarification, setPendingClarification] = useState<PendingInsightsClarification | null>(null);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    setPendingClarification(null);
  }, []);

  const sendMessage = useCallback(
    async (queryRaw: string) => {
      const query = queryRaw.trim();
      const qUser = query || "Show my earnings summary";
      setIsLoading(true);
      setError(null);

      setMessages((prev) => [...prev, { role: "user", content: qUser }]);

      try {
        const debugInsights = import.meta.env.DEV || (typeof window !== "undefined" && (window as unknown as { DEBUG_INSIGHTS?: boolean }).DEBUG_INSIGHTS);
        const priorPlan = [...messages].reverse().find((m) => m.role === "assistant")?.meta?.insightsResult?.trace?.queryPlan;
        const priorContext = priorPlan
          ? {
            intent: priorPlan.intent,
            time_range: priorPlan.time_range,
            student_filter: priorPlan.student_filter,
            slots: priorPlan.slots,
          }
          : undefined;

        const effectiveQuery = pendingClarification ? resolveInsightsClarification(pendingClarification, qUser) : qUser;
        const insightsResult = await askInsights(effectiveQuery, {
          user_id: userId,
          lessons,
          roster,
          earnings,
          students,
          timezone,
          locale,
          priorContext,
        });
        if (insightsResult.needsClarification) {
          const missing = insightsResult.trace?.queryPlan?.required_missing_params ?? [];
          // Store the query that actually needs clarifying, so we can resume without losing intent.
          setPendingClarification({ originalQuestion: effectiveQuery, requiredMissingParams: missing });
        } else {
          setPendingClarification(null);
        }
        if (debugInsights && insightsResult.trace) {
          console.log("[Insights] trace", insightsResult.trace);
        }

        let displayText = insightsResult.finalAnswerText;
        if (insightsResult.needsClarification && insightsResult.clarifyingQuestion) {
          displayText = insightsResult.clarifyingQuestion;
        }

        const responseLang = detectQueryLanguage(qUser);
        if (responseLang === "es" || responseLang === "zh") {
          displayText = await translateForInsights(displayText, responseLang);
        }

        // Build legacy res for meta so UI that reads meta still works
        const planIntent = insightsResult.trace?.queryPlan?.intent ?? "clarification";
        const out = insightsResult.computedResult?.outputs as Record<string, unknown> | undefined;
        const res: ForecastResponse = {
          intent: mapInsightIntentToForecast(planIntent),
          summary: insightsResult.finalAnswerText,
          details: "",
          metrics: {
            projected_monthly: (out?.projected_monthly_dollars as number) ?? null,
            projected_yearly: (out?.projected_yearly_dollars as number) ?? null,
            estimated_tax: (out?.estimated_tax_yearly_dollars as number) ?? null,
            avg_weekly: (out?.avg_weekly_dollars as number) ?? null,
            trend: "unknown",
          },
          confidence: "high",
          assumptions: [],
          calculations: [],
          structuredAnswer: {
            answer: insightsResult.finalAnswerText,
            type: "other",
            supporting: [],
            needs_clarification: insightsResult.needsClarification,
            clarifying_question: insightsResult.clarifyingQuestion,
          },
        };

        const assistantContent = displayText;

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantContent,
            meta: { response: res, insightsResult, metadata: insightsResult.metadata },
          },
        ]);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : "Something went wrong";
        setError(errMsg);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${errMsg}`, meta: undefined },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [userId, lessons, roster, earnings, students, locale, timezone, messages]
  );

  return { messages, sendMessage, clear, isLoading, error };
}
