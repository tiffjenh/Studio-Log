/**
 * Human-readable date range labels for Insights UI.
 * Maps internal enums (last_30_days, etc.) to display-safe text.
 */

/** Map internal time range label to human-readable string. Never show underscores. */
export function humanizeTimeRangeLabel(label: string): string {
  if (!label || typeof label !== "string") return "";
  const normalized = label.trim().toLowerCase().replace(/_/g, " ");
  const map: Record<string, string> = {
    last_30_days: "last 30 days",
    last_7_days: "last 7 days",
    this_month: "this month",
    last_month: "last month",
    this_year: "year to date",
    ytd: "year to date",
    year_to_date: "year to date",
    last_year: "last year",
    all_time: "all time",
  };
  const exact = map[label] ?? map[normalized];
  if (exact) return exact;
  // Fallback: title-case with spaces, no underscores
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type HumanizeDateRangeInput = {
  start_date?: string | null;
  end_date?: string | null;
  /** Fallback when dates are missing (e.g. humanized "last 30 days"). */
  fallbackLabel?: string;
};

/**
 * Produce a display string for the date range, e.g. "in January 2026", "in the last 30 days".
 * Used in narrative sentences and footers.
 */
export function humanizeDateRange(input: HumanizeDateRangeInput): string {
  const { start_date, end_date, fallbackLabel } = input;
  const start = start_date?.trim();
  const end = end_date?.trim();
  const fallback = fallbackLabel?.trim() || "";

  if (start && end) {
    // Single month (e.g. 2026-01-01 to 2026-01-31) → "in January 2026"
    const [sy, sm] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    if (sy === ey && sm === em && ed != null && ed >= 28) {
      const monthName = new Date(sy, (sm ?? 1) - 1).toLocaleDateString("en-US", { month: "long" });
      return `in ${monthName} ${sy}`;
    }
    // Same year range → "Jan 26–Feb 25, 2026" or "in the last 30 days"
    if (sy === ey) {
      const startShort = new Date(start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endShort = new Date(end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const rangeStr = `${startShort}–${endShort}`;
      if (fallback && (fallback.toLowerCase().includes("last") || fallback.toLowerCase().includes("30") || fallback.toLowerCase().includes("7"))) {
        return `in the ${fallback} (${rangeStr})`;
      }
      return `in ${rangeStr}`;
    }
    // Cross-year
    const startFmt = new Date(start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const endFmt = new Date(end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `from ${startFmt} to ${endFmt}`;
  }

  if (start && start.length >= 7) {
    const [y, m] = start.split("-").map(Number);
    const monthName = new Date(y, (m ?? 1) - 1).toLocaleDateString("en-US", { month: "long" });
    return `in ${monthName} ${y}`;
  }

  return fallback ? `in the ${fallback}` : "";
}
