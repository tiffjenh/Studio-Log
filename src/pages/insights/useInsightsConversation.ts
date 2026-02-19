/**
 * useInsightsConversation — multi-turn chat state for Insights.
 * Stores messages (user/assistant), sends questions through runForecast, supports clear (New chat).
 */

import { useState, useCallback } from "react";
import { runForecast } from "@/lib/forecasts/runForecast";
import type { ForecastResponse } from "@/lib/forecasts/types";
import type { EarningsRow, StudentSummary } from "@/lib/forecasts/types";
import { detectQueryLanguage, translateForInsights } from "@/utils/insightsLanguage";
import type { SupportedLocale } from "@/lib/forecasts/types";

const MAX_TURNS_FOR_CONTEXT = 10;

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  meta?: { response?: ForecastResponse };
};

export type UseInsightsConversationArgs = {
  earnings: EarningsRow[];
  students: StudentSummary[];
  locale: SupportedLocale;
  timezone: string;
};

export function useInsightsConversation(args: UseInsightsConversationArgs) {
  const { earnings, students, locale, timezone } = args;
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(
    async (queryRaw: string) => {
      const query = queryRaw.trim();
      const q = query || "Show my earnings summary";
      setIsLoading(true);
      setError(null);

      setMessages((prev) => [...prev, { role: "user", content: q }]);

      try {
        const lastTurns = messages.slice(-MAX_TURNS_FOR_CONTEXT).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const lastMetrics = messages.filter((m) => m.role === "assistant" && m.meta?.response?.metrics).slice(-1)[0]?.meta?.response?.metrics;
        const res = await runForecast({
          query: q,
          locale,
          timezone,
          rangeContext: { mode: "forecasts" },
          earnings,
          students,
          conversationContext:
            lastTurns.length > 0 || lastMetrics
              ? { lastTurns, lastComputedMetrics: lastMetrics ?? undefined }
              : undefined,
        });

        const responseLang = detectQueryLanguage(q);
        let summary = res.summary;
        let details = res.details ?? "";
        let answer = res.answer;

        if (responseLang === "es" || responseLang === "zh") {
          const [summaryTrans, detailsTrans] = await Promise.all([
            translateForInsights(res.summary, responseLang),
            res.details ? translateForInsights(res.details, responseLang) : Promise.resolve(""),
          ]);
          summary = summaryTrans;
          details = detailsTrans;
          if (res.answer?.body != null || res.answer?.title != null) {
            const bodyTrans = res.answer.body ? await translateForInsights(res.answer.body, responseLang) : res.answer.body;
            const titleTrans = res.answer.title ? await translateForInsights(res.answer.title, responseLang) : res.answer.title;
            answer = { title: titleTrans ?? res.answer.title, body: bodyTrans ?? res.answer.body };
          }
        }

        // Use structured output when present: answer only + up to 2 supporting bullets; optional clarifying question.
        const structured = res.structuredAnswer;
        const parts: string[] = structured
          ? [structured.answer, ...(structured.supporting?.length ? structured.supporting.map((s) => `• ${s}`) : [])]
          : [answer?.title && `**${answer.title}**`, summary, details && details.trim(), res.assumptions?.length ? `Assumptions: ${res.assumptions.join(" ")}` : ""];
        if (structured?.needs_clarification && structured.clarifying_question) {
          parts.push(`Clarifying: ${structured.clarifying_question}`);
        }
        const assistantContent = parts.filter(Boolean).join("\n\n");

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantContent,
            meta: { response: { ...res, summary, details, answer } },
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
    [earnings, students, locale, timezone, messages]
  );

  return { messages, sendMessage, clear, isLoading, error };
}
