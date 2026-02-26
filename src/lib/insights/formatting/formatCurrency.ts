/**
 * Insights-only currency formatting: always 2 decimal places (e.g. $1,265.00).
 * Do not use elsewhere (e.g. Earnings page keeps its own formatting).
 */

export function formatCurrency2(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a value already in dollars (e.g. from outputs.total_dollars) with 2 decimals. */
export function formatDollars2(dollars: number): string {
  return "$" + Number(dollars).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
