import { normalizeDateRange } from "@/lib/insights/metrics/dateNormalize";

export type InsightsTimeframe = {
  type: "month" | "year" | "ytd" | "rolling_days" | "range";
  startISO: string;
  endISO: string;
  label: string;
};

/**
 * Resolve a natural-language timeframe into a normalized range.
 * Language-aware keywords are supported via the shared Insights date normalizer.
 */
export function resolveInsightsTimeframe(
  questionText: string,
  nowISO: string
): InsightsTimeframe | null {
  const r = normalizeDateRange(questionText, nowISO);
  if (!r) return null;
  const label = r.label ?? `${r.start}..${r.end}`;
  const type: InsightsTimeframe["type"] =
    label.endsWith("YTD") ? "ytd" :
    label === "last_7_days" || label === "last_30_days" ? "rolling_days" :
    /^\d{4}-\d{2}$/.test(label) ? "month" :
    /^\d{4}$/.test(label) ? "year" :
    "range";
  return { type, startISO: r.start, endISO: r.end, label };
}

