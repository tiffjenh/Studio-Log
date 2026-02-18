import type { EarningsRow } from "./types";

function parseISODate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1));
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeAvgWeekly(rows: EarningsRow[]): number | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((r1, r2) => parseISODate(r1.date).getTime() - parseISODate(r2.date).getTime());
  const start = parseISODate(sorted[0]!.date);
  const end = parseISODate(sorted[sorted.length - 1]!.date);
  const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);

  const days = daysBetween(start, end) + 1;
  const weeks = days / 7;
  if (weeks <= 0) return null;
  return roundTo2(total / weeks);
}

export function computeTrend(rows: EarningsRow[]): "up" | "down" | "stable" | "unknown" {
  if (rows.length < 6) return "unknown";
  const sorted = [...rows].sort((a, b) => parseISODate(a.date).getTime() - parseISODate(b.date).getTime());
  const end = parseISODate(sorted[sorted.length - 1]!.date);
  const endMs = end.getTime();

  const dayMs = 24 * 60 * 60 * 1000;
  const last14Start = new Date(endMs - 13 * dayMs);
  const prev14Start = new Date(endMs - 27 * dayMs);
  const prev14End = new Date(endMs - 14 * dayMs);

  const sumInRange = (start: Date, finish: Date) =>
    rows.reduce((sum, r) => {
      const t = parseISODate(r.date).getTime();
      if (t >= start.getTime() && t <= finish.getTime()) return sum + r.amount;
      return sum;
    }, 0);

  const last14 = sumInRange(last14Start, end);
  const prev14 = sumInRange(prev14Start, prev14End);

  if (prev14 === 0 && last14 === 0) return "stable";
  if (prev14 === 0 && last14 > 0) return "up";

  const change = (last14 - prev14) / Math.abs(prev14);
  if (change > 0.08) return "up";
  if (change < -0.08) return "down";
  return "stable";
}

export function computeForecast(rows: EarningsRow[]) {
  const avgWeekly = computeAvgWeekly(rows);
  const trend = computeTrend(rows);

  if (avgWeekly == null) {
    return {
      avgWeekly: null,
      projectedMonthly: null,
      projectedYearly: null,
      trend,
      confidence: "low" as const,
    };
  }

  const trendMult = trend === "up" ? 1.05 : trend === "down" ? 0.95 : 1.0;

  const projectedMonthly = roundTo2(avgWeekly * 4.345 * trendMult);
  const projectedYearly = roundTo2(avgWeekly * 52 * trendMult);

  return {
    avgWeekly: roundTo2(avgWeekly),
    projectedMonthly,
    projectedYearly,
    trend,
    confidence: rows.length >= 20 ? ("high" as const) : ("medium" as const),
  };
}

export function computeTaxEstimate(projectedYearly: number | null) {
  if (projectedYearly == null) return { estimatedTax: null, monthlySetAside: null };

  const estimatedTax = roundTo2(projectedYearly * 0.2);
  const monthlySetAside = roundTo2(estimatedTax / 12);

  return { estimatedTax, monthlySetAside };
}

export function computeCashflowInsights(rows: EarningsRow[]) {
  if (!rows.length) {
    return { bestWeek: null as null | { start: string; end: string; total: number }, worstWeek: null, volatility: null as number | null };
  }

  const sorted = [...rows].sort((a, b) => parseISODate(a.date).getTime() - parseISODate(b.date).getTime());
  const start = parseISODate(sorted[0]!.date);

  const buckets = new Map<number, { start: Date; end: Date; total: number }>();
  for (const r of rows) {
    const d = parseISODate(r.date);
    const idx = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const bStart = new Date(start.getTime() + idx * 7 * 24 * 60 * 60 * 1000);
    const bEnd = new Date(bStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    const cur = buckets.get(idx) ?? { start: bStart, end: bEnd, total: 0 };
    cur.total += r.amount;
    buckets.set(idx, cur);
  }

  const list = [...buckets.values()];
  list.sort((a, b) => a.start.getTime() - b.start.getTime());

  const best = list.reduce((max, b) => (b.total > max.total ? b : max), list[0]!);
  const worst = list.reduce((min, b) => (b.total < min.total ? b : min), list[0]!);

  const totals = list.map((b) => b.total);
  const mean = totals.reduce((s, x) => s + x, 0) / totals.length;
  const variance = totals.reduce((s, x) => s + (x - mean) ** 2, 0) / totals.length;
  const std = Math.sqrt(variance);
  const volatility = mean > 0 ? roundTo2(std / mean) : null;

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return {
    bestWeek: { start: fmt(best.start), end: fmt(best.end), total: roundTo2(best.total) },
    worstWeek: { start: fmt(worst.start), end: fmt(worst.end), total: roundTo2(worst.total) },
    volatility,
  };
}
