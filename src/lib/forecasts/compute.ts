import type { EarningsRow, ParsedQuery, StudentSummary } from "./types";

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

/** Format dollar amount with thousands separators (e.g. $1,000 or $10,000). */
function fmtDollars(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

// ─── Intent + parameter extraction (regex/keyword) ─────────────────────────

function extractDollarAmounts(s: string): number[] {
  const out: number[] = [];
  let m: RegExpExecArray | null;
  const normalized = s.replace(/\$/g, "").replace(/,/g, "");
  const simple = /(\d+(?:\.\d{2})?)\s*(k|K)?/g;
  while ((m = simple.exec(normalized)) !== null) {
    let v = parseFloat(m[1]!);
    if (m[2] === "k" || m[2] === "K") v *= 1000;
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function parseQueryParams(query: string): ParsedQuery {
  const q = query.toLowerCase().trim();
  const parsed: ParsedQuery = {
    avg_hours_per_student_per_week: 1,
  };

  // Timeframe
  if (/\bthis\s+year\b|year\s+to\s+date|ytd\b|este\s+año|今年|今年度/i.test(q)) {
    parsed.timeframe = "this_year";
  } else if (/\bthis\s+month\b|este\s+mes|本月/i.test(q)) {
    parsed.timeframe = "this_month";
  } else if (/\blast\s+month\b|mes\s+pasado|上月/i.test(q)) {
    parsed.timeframe = "last_month";
  } else if (/\blast\s+year\b|año\s+pasado|去年/i.test(q)) {
    parsed.timeframe = "last_year";
  } else if (/\ball\s+time|todo|全部/i.test(q)) {
    parsed.timeframe = "all";
  }

  // Dollar amounts: look for "100000" / "$100,000" / "100k" and "70/hour" / "$70/hr"
  const amounts = extractDollarAmounts(query);
  const targetIncomePattern =
    /\b(make|earn|reach|get\s+to|hit|goal|target|income|ingresos|收入|require|necesito|alcanzar|llegar\s+a|要赚|需要|才能赚)\s*(?:of\s*)?\$?[\d,]+\s*(k|K)?|\$?[\d,]+\s*(k|K)?\s*(?:this\s+year|per\s+year|yearly|require|para\s+llegar)/i;
  if (
    (targetIncomePattern.test(q) || /\bwhat\s+does\s+\$?[\d,]+\s*(k|K)?\s+require/i.test(q) || /(?:cuántos|cuantas)\s+estudiantes?\s+necesito|多少学生.*才能|需要多少学生/i.test(q)) &&
    amounts.length >= 1
  ) {
    parsed.target_income = amounts[0]!;
  }
  if (/\b(\$?\d+\s*\/?\s*(?:per\s+)?(?:hour|hr|hora|小时)|hourly\s+rate|rate\s+per\s+hour|tarifa\s+por\s+hora|时薪)/i.test(q)) {
    const hrMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:\/|per)\s*(?:hour|hr|hora|小时)/i) ?? query.match(/(?:hourly|rate)\s*[:\s]*\$?\s*(\d+(?:\.\d+)?)/i);
    if (hrMatch) parsed.hourly_rate = parseFloat(hrMatch[1]!);
    else if (amounts.length >= 2) parsed.hourly_rate = amounts[1]!;
  }
  if (parsed.target_income == null && amounts.length >= 1 && (q.includes("student") || q.includes("estudiante") || q.includes("学生"))) {
    parsed.target_income = amounts[0]!;
  }
  if (parsed.hourly_rate == null && amounts.length >= 1 && (q.includes("hour") || q.includes("hora") || q.includes("小时"))) {
    parsed.hourly_rate = amounts[0]!;
  }

  // Hours per student per week
  const hpwMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\s*per\s*(?:student|week)/i) ?? query.match(/(?:per\s+student|per\s+week)[^\d]*(\d+(?:\.\d+)?)/i);
  if (hpwMatch) parsed.avg_hours_per_student_per_week = parseFloat(hpwMatch[1]!);

  // Rate increase: $10/hour or 5% (EN: raise by $10; ES: aumentar 10, subir 10; ZH: 涨价10, 涨10美元)
  const rateIncDol =
    query.match(/(?:raise|increase|raise\s+rates?\s+by)\s+\$?\s*(\d+(?:\.\d+)?)/i) ??
    query.match(/(?:aumentar|subir|subo)\s+(?:las?\s+tarifas?\s+)?(?:en\s+)?\$?\s*(\d+(?:\.\d+)?)/i) ??
    query.match(/(?:涨价|涨|加价)\s*(\d+(?:\.\d+)?)\s*(?:美元|块|元)?/i) ??
    query.match(/\$(\d+)\s*(?:per\s+)?hour/i);
  if (rateIncDol) parsed.rate_increase_dollars = parseFloat(rateIncDol[1]!);
  const rateIncPct = query.match(/(\d+(?:\.\d+)?)\s*%\s*(?:rate|increase)/i) ?? query.match(/increase\s+(?:rates?\s+)?(?:by\s+)?(\d+)\s*%/i);
  if (rateIncPct) parsed.rate_increase_percent = parseFloat(rateIncPct[1]!);

  // New rate: $70/hour instead of $60
  const newRateMatch = query.match(/(?:charged?|at|rate\s+of)\s+\$?\s*(\d+)\s*(?:\/|\s*per)\s*(?:hour|hr)/i) ?? query.match(/\$(\d+)\s*\/?\s*hr?/);
  if (newRateMatch) parsed.new_rate = parseFloat(newRateMatch[1]!);

  // Add N new students (EN: add 3 new students; ES: añadir 3 estudiantes; ZH: 增加3个学生)
  const addStudentsMatch =
    query.match(/(?:add(?:ed)?|adding)\s+(\d+)\s+(?:new\s+)?(?:weekly\s+)?students?/i) ??
    query.match(/(\d+)\s+new\s+students?/i) ??
    query.match(/(?:añadir|agregar)\s+(\d+)\s+(?:nuevos?\s+)?estudiantes?/i) ??
    query.match(/(?:增加|加)\s*(\d+)\s*(?:个)?学生/i);
  if (addStudentsMatch) parsed.new_students_added = parseInt(addStudentsMatch[1]!, 10);

  // Take N weeks off (EN; ES: tomar X semanas libre; ZH: 休X周)
  const weeksOffMatch =
    query.match(/(?:take|taking)\s+(\d+)\s+weeks?\s+off/i) ??
    query.match(/(\d+)\s+weeks?\s+off/i) ??
    query.match(/(?:tomar|tomando)\s+(\d+)\s+semanas?\s+(?:libre|libres)/i) ??
    query.match(/(?:休|休息)\s*(\d+)\s*周/i);
  if (weeksOffMatch) parsed.weeks_off = parseInt(weeksOffMatch[1]!, 10);

  return parsed;
}

const now = () => new Date();

export function getTimeframeBounds(
  timeframe: ParsedQuery["timeframe"],
  earnings: EarningsRow[]
): { startDate: string; endDate: string; label: string } | null {
  const n = now();
  const y = n.getFullYear();
  const m = n.getMonth();

  if (timeframe === "this_year") {
    return { startDate: `${y}-01-01`, endDate: n.toISOString().slice(0, 10), label: `Jan 1 – today ${y}` };
  }
  if (timeframe === "this_month") {
    const start = new Date(y, m, 1);
    return { startDate: start.toISOString().slice(0, 10), endDate: n.toISOString().slice(0, 10), label: `${start.toLocaleDateString("en-US", { month: "long" })} ${y}` };
  }
  if (timeframe === "last_month") {
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), label: `${start.toLocaleDateString("en-US", { month: "long" })} ${y}` };
  }
  if (timeframe === "last_year") {
    return { startDate: `${y - 1}-01-01`, endDate: `${y - 1}-12-31`, label: String(y - 1) };
  }
  if (timeframe === "all" && earnings.length > 0) {
    const sorted = [...earnings].sort((a, b) => a.date.localeCompare(b.date));
    return { startDate: sorted[0]!.date, endDate: sorted[sorted.length - 1]!.date, label: "All time" };
  }
  return null;
}

function sumInRange(rows: EarningsRow[], startDate: string, endDate: string): number {
  return rows.reduce((s, r) => {
    if (r.date >= startDate && r.date <= endDate) return s + (Number.isFinite(r.amount) ? r.amount : 0);
    return s;
  }, 0);
}

/** Total earnings in a calendar year (completed lessons only). */
function sumForYear(rows: EarningsRow[], year: number): number {
  return sumInRange(rows, `${year}-01-01`, `${year}-12-31`);
}

/**
 * Percent change between two years (e.g. 2025 vs 2024).
 * Returns answer string and optional dollar delta. If prior year is 0, percent is undefined.
 */
export function computePercentChange(
  earnings: EarningsRow[],
  laterYear: number,
  earlierYear: number
): { totalEarlier: number; totalLater: number; percentChange: number | null; answer: string; dollarDelta?: string } {
  const totalEarlier = roundTo2(sumForYear(earnings, earlierYear));
  const totalLater = roundTo2(sumForYear(earnings, laterYear));
  let percentChange: number | null = null;
  if (totalEarlier > 0) {
    percentChange = roundTo2(((totalLater - totalEarlier) / totalEarlier) * 100);
  }
  const dollarDelta = totalLater - totalEarlier;
  const dollarDeltaStr = dollarDelta >= 0 ? `+${fmtDollars(dollarDelta)}` : fmtDollars(dollarDelta);

  if (totalEarlier === 0) {
    return {
      totalEarlier: 0,
      totalLater,
      percentChange: null,
      answer: `No earnings recorded in ${earlierYear}, so percent change isn't defined. You earned ${fmtDollars(totalLater)} in ${laterYear}.`,
      dollarDelta: fmtDollars(totalLater),
    };
  }
  const pct = percentChange!;
  const direction = pct >= 0 ? "more" : "less";
  const answer = `You made ${Math.abs(pct).toFixed(1)}% ${direction} in ${laterYear} than ${earlierYear}.`;
  return {
    totalEarlier,
    totalLater,
    percentChange: pct,
    answer,
    dollarDelta: dollarDeltaStr,
  };
}

export function computeWhatIf(
  parsed: ParsedQuery,
  earnings: EarningsRow[],
  bounds: { startDate: string; endDate: string; label: string }
): { directAnswer: string; calculations: string[]; assumptions: string[]; confidence: "high" | "medium" | "low" } {
  const assumptions: string[] = [];
  const calculations: string[] = [];

  const currentIncome = sumInRange(earnings, bounds.startDate, bounds.endDate);
  calculations.push(`Current income in period (${bounds.label}): ${fmtDollars(roundTo2(currentIncome))}`);

  const target = parsed.target_income ?? 0;
  const rate = parsed.hourly_rate ?? 0;
  const hoursPerStudentPerWeek = parsed.avg_hours_per_student_per_week ?? 1;
  if (hoursPerStudentPerWeek !== 1) assumptions.push(`Using ${hoursPerStudentPerWeek} hours per student per week (from your question or default).`);
  else assumptions.push("Assuming 1 hour per student per week (you can specify otherwise).");

  const n = now();
  const endOfYear = new Date(n.getFullYear(), 11, 31);
  const weeksRemaining = Math.max(0, Math.ceil((endOfYear.getTime() - n.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  calculations.push(`Weeks remaining in year: ${weeksRemaining}`);

  const remainingIncome = Math.max(0, target - currentIncome);
  calculations.push(`Remaining income to reach ${fmtDollars(target)}: ${fmtDollars(roundTo2(remainingIncome))}`);

  if (rate <= 0) {
    return {
      directAnswer: "I need an hourly rate to compute how many students you’d need. Please specify, e.g. “at $70/hour”.",
      calculations,
      assumptions,
      confidence: "low",
    };
  }

  const hoursNeeded = remainingIncome / rate;
  calculations.push(`Hours needed at ${fmtDollars(rate)}/hour: ${roundTo2(hoursNeeded)}`);

  const studentsNeeded = hoursPerStudentPerWeek * weeksRemaining <= 0 ? 0 : Math.ceil(hoursNeeded / (weeksRemaining * hoursPerStudentPerWeek));
  calculations.push(`Formula: students_needed = ceil(hours_needed / (weeks_remaining × hours_per_student_per_week)) = ceil(${hoursNeeded} / (${weeksRemaining} × ${hoursPerStudentPerWeek})) = ${studentsNeeded}`);

  const directAnswer =
    studentsNeeded <= 0
      ? `You’re already on track. Current income in period: ${fmtDollars(roundTo2(currentIncome))}.`
      : `You’d need about ${studentsNeeded} new student(s) (at ${fmtDollars(rate)}/hr, ${hoursPerStudentPerWeek} hr/student/week, ${weeksRemaining} weeks left) to reach ${fmtDollars(roundTo2(target))}.`;

  return {
    directAnswer,
    calculations,
    assumptions,
    confidence: rate > 0 && target > 0 ? "high" : "medium",
  };
}

/** Scenario what-if: rate increase, add students, take weeks off, lose lowest student. */
export function computeScenarioWhatIf(
  query: string,
  earnings: EarningsRow[],
  parsed: ParsedQuery,
  options: { avgWeekly: number | null; projectedYearly: number | null; students?: StudentSummary[] }
): { directAnswer: string; calculations: string[]; assumptions: string[]; confidence: "high" | "medium" | "low" } {
  const calculations: string[] = [];
  const { avgWeekly, projectedYearly } = options;

  // If I take N weeks off
  if (parsed.weeks_off != null && parsed.weeks_off > 0 && avgWeekly != null) {
    const lost = roundTo2(parsed.weeks_off * avgWeekly);
    const newYearly = projectedYearly != null ? roundTo2(projectedYearly - lost) : null;
    calculations.push(`Current avg weekly: ${fmtDollars(avgWeekly)}`);
    calculations.push(`Lost income (${parsed.weeks_off} weeks × ${fmtDollars(avgWeekly)}): ${fmtDollars(lost)}`);
    return {
      directAnswer:
        newYearly != null
          ? `Taking ${parsed.weeks_off} weeks off would cost about ${fmtDollars(lost)} in income. Projected yearly would be ~${fmtDollars(newYearly)}.`
          : `Taking ${parsed.weeks_off} weeks off would cost about ${fmtDollars(lost)} in income.`,
      calculations,
      assumptions: ["Using your recent average weekly earnings."],
      confidence: "high",
    };
  }

  // If I add N new students (at avg rate, 1 hr/week each)
  if (parsed.new_students_added != null && parsed.new_students_added > 0) {
    const total = earnings.reduce((s, r) => s + r.amount, 0);
    const hasDuration = earnings.some((r) => r.durationMinutes != null && r.durationMinutes > 0);
    const totalHours = hasDuration ? earnings.reduce((s, r) => s + (r.durationMinutes ?? 0) / 60, 0) : earnings.length;
    const avgRate = totalHours > 0 ? total / totalHours : 0;
    const hrsPerStudent = parsed.avg_hours_per_student_per_week ?? 1;
    const addedPerYear = roundTo2(parsed.new_students_added * avgRate * hrsPerStudent * 52);
    const currentYearly = projectedYearly ?? roundTo2(avgWeekly != null ? avgWeekly * 52 : 0);
    const newYearly = roundTo2(currentYearly + addedPerYear);
    calculations.push(`Avg rate: ${fmtDollars(roundTo2(avgRate))}/hr; ${parsed.new_students_added} students × ${hrsPerStudent} hr/week × 52 = ${fmtDollars(addedPerYear)}/year`);
    return {
      directAnswer: `Adding ${parsed.new_students_added} new weekly student(s) would add about ${fmtDollars(addedPerYear)}/year. Projected yearly would be ~${fmtDollars(newYearly)}.`,
      calculations,
      assumptions: [`Using ${hrsPerStudent} hour(s) per student per week.`],
      confidence: avgRate > 0 ? "high" : "medium",
    };
  }

  // If I lose my lowest-paying student
  if (/\blost?\s+my\s+lowest|lost?\s+lowest|if\s+i\s+lost|si\s+pierdo\s+el\s+estudiante|失去.*最低/i.test(query.toLowerCase()) && earnings.length > 0) {
    const byCustomer = new Map<string, number>();
    for (const r of earnings) {
      const key = (r.customer ?? "Unknown").trim() || "Unknown";
      byCustomer.set(key, (byCustomer.get(key) ?? 0) + r.amount);
    }
    const sorted = [...byCustomer.entries()].sort((a, b) => a[1]! - b[1]!);
    if (sorted.length === 1 && (sorted[0]![0] === "Unknown" || !sorted[0]![0])) {
      return {
        directAnswer: "Earnings aren't broken down by student. I can't estimate losing one student.",
        calculations: [],
        assumptions: [],
        confidence: "low",
      };
    }
    const [lowestName, lowestRev] = sorted[0]!;
    const total = earnings.reduce((s, r) => s + r.amount, 0);
    const yearly = projectedYearly ?? roundTo2(total);
    const yearlyWithout = total > 0 ? roundTo2((yearly / total) * (total - lowestRev)) : 0;
    calculations.push(`${lowestName} contributed ${fmtDollars(roundTo2(lowestRev))}`);
    calculations.push(`Projected yearly without: ~${fmtDollars(yearlyWithout)}`);
    return {
      directAnswer: `If ${lowestName} left, you'd lose about ${fmtDollars(roundTo2(lowestRev))} in recorded revenue. Projected yearly would be ~${fmtDollars(yearlyWithout)}.`,
      calculations,
      assumptions: [],
      confidence: "high",
    };
  }

  // How many students at $X/hour to replace my current income?
  const replaceMatch = query.match(/(?:how\s+many\s+)?students?\s+at\s+\$?\s*(\d+)\s*\/?\s*(?:hour|hr)/i) ?? query.match(/\$(\d+)\s*\/?\s*hr?\s+to\s+replace/i);
  if (replaceMatch && /\breplace\s+(?:my\s+)?(?:current\s+)?income|replace\s+income|替代.*收入/i.test(query.toLowerCase())) {
    const rate = parseFloat(replaceMatch[1]!);
    const hrsPerWeek = parsed.avg_hours_per_student_per_week ?? 1;
    const currentYearly = projectedYearly ?? (avgWeekly != null ? roundTo2(avgWeekly * 52) : 0);
    if (rate > 0 && currentYearly > 0) {
      const n = Math.ceil(currentYearly / (rate * hrsPerWeek * 52));
    calculations.push(`Current projected yearly: ${fmtDollars(currentYearly)}`);
    calculations.push(`At ${fmtDollars(rate)}/hr, ${hrsPerWeek} hr/student/week: ${currentYearly} / (${rate} × ${hrsPerWeek} × 52) ≈ ${n} students`);
    return {
      directAnswer: `You'd need about ${n} student(s) at ${fmtDollars(rate)}/hour (${hrsPerWeek} hr/week each) to replace your current income (~${fmtDollars(currentYearly)}/year).`,
        calculations,
        assumptions: [`Using ${hrsPerWeek} hour(s) per student per week.`],
        confidence: "high",
      };
    }
  }

  // Rate increase: $X/hour or Y% or "charge $70 instead of $60"
  const total = earnings.reduce((s, r) => s + r.amount, 0);
  const hasDuration = earnings.some((r) => r.durationMinutes != null && r.durationMinutes > 0);
  const totalHours = hasDuration ? earnings.reduce((s, r) => s + (r.durationMinutes ?? 0) / 60, 0) : earnings.length;
  const currentAvgRate = totalHours > 0 ? total / totalHours : 0;
  let newRate: number | null = null;
  if (parsed.rate_increase_dollars != null && parsed.rate_increase_dollars > 0) {
    newRate = currentAvgRate + parsed.rate_increase_dollars;
    calculations.push(`Current avg rate: ${fmtDollars(roundTo2(currentAvgRate))}/hr; add ${fmtDollars(parsed.rate_increase_dollars)} → ${fmtDollars(roundTo2(newRate))}/hr`);
  } else if (parsed.rate_increase_percent != null && parsed.rate_increase_percent > 0) {
    newRate = currentAvgRate * (1 + parsed.rate_increase_percent / 100);
    calculations.push(`Current avg: ${fmtDollars(roundTo2(currentAvgRate))}/hr; +${parsed.rate_increase_percent}% → ${fmtDollars(roundTo2(newRate))}/hr`);
  } else if (parsed.new_rate != null && parsed.new_rate > 0) {
    newRate = parsed.new_rate;
    calculations.push(`Hypothetical rate: ${fmtDollars(newRate)}/hr (current avg: ${fmtDollars(roundTo2(currentAvgRate))}/hr)`);
  }
  if (newRate != null && newRate > 0 && (totalHours > 0 || (avgWeekly != null && currentAvgRate > 0))) {
    const currentYearly = projectedYearly ?? roundTo2(avgWeekly != null ? avgWeekly * 52 : total);
    const hoursPerYearFromWeeks = avgWeekly != null && currentAvgRate > 0 ? (avgWeekly / currentAvgRate) * 52 : totalHours * (52 / Math.max(1, earnings.length / 4));
    const newYearly = roundTo2(hoursPerYearFromWeeks * newRate);
    const diff = roundTo2(newYearly - currentYearly);
    return {
      directAnswer: `At ${fmtDollars(roundTo2(newRate))}/hour (instead of ~${fmtDollars(roundTo2(currentAvgRate))}/hr), you'd make about ${fmtDollars(diff)} more per year (projected ~${fmtDollars(newYearly)}/year).`,
      calculations,
      assumptions: ["Using your recent teaching hours to project yearly."],
      confidence: "high",
    };
  }

  return {
    directAnswer: "I didn't understand that scenario. Try: \"If I raise rates by $10/hour\" or \"How many students to reach $100,000?\"",
    calculations: [],
    assumptions: [],
    confidence: "low",
  };
}

type BaseMetrics = {
  projected_yearly: number | null;
  projected_monthly: number | null;
  avg_weekly: number | null;
  trend: string;
};

/** General analytics Q&A from earnings (and optional students for rate/pricing insights). */
export function computeGeneralAnalytics(
  query: string,
  earnings: EarningsRow[],
  baseMetrics?: BaseMetrics | null,
  students?: StudentSummary[]
): { directAnswer: string; calculations: string[]; assumptions: string[]; confidence: "high" | "medium" | "low"; chartData?: { label: string; value: number }[] } {
  const q = query.toLowerCase();
  const calculations: string[] = [];
  const projectedYearly = baseMetrics?.projected_yearly ?? null;

  // On track to hit $X this year?
  if (/\bon\s+track|hit\s+\$|reach\s+\$|目标|达标|estoy\s+en\s+camino/i.test(q) && extractDollarAmounts(query).length > 0) {
    const target = extractDollarAmounts(query)[0]!;
    if (projectedYearly != null) {
      const onTrack = projectedYearly >= target;
      const diff = target - projectedYearly;
      return {
        directAnswer: onTrack
          ? `Yes. You're on track — projected yearly is ${fmtDollars(roundTo2(projectedYearly))}, above your ${fmtDollars(roundTo2(target))} goal.`
          : `Not quite. Projected yearly is ${fmtDollars(roundTo2(projectedYearly))}. You'd need about ${fmtDollars(roundTo2(Math.max(0, diff)))} more to reach ${fmtDollars(roundTo2(target))}.`,
        calculations: [`Projected yearly: ${fmtDollars(roundTo2(projectedYearly))}; Target: ${fmtDollars(roundTo2(target))}`],
        assumptions: [],
        confidence: "high",
      };
    }
    return {
      directAnswer: "Not enough data to project yearly earnings yet. Add more completed lessons.",
      calculations: [],
      assumptions: [],
      confidence: "low",
    };
  }

  // Best month
  if (/\bbest\s+month|best\s+month\b|month\s+with\s+most|highest\s+month|mejor\s+mes|最好的月份/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet. Add entries to see your best month.", calculations: [], assumptions: [], confidence: "low" };
    }
    const byMonth = new Map<string, number>();
    for (const r of earnings) {
      const monthKey = r.date.slice(0, 7);
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + r.amount);
    }
    const sorted = [...byMonth.entries()].sort((a, b) => b[1]! - a[1]!);
    const [monthKey, total] = sorted[0]!;
    const [y, m] = monthKey.split("-").map(Number);
    const monthName = new Date(2000, (m ?? 1) - 1, 1).toLocaleDateString("en-US", { month: "long" });
    const label = `${monthName} ${y}`;
    const chartData = sorted.slice(0, 6).map(([k, v]) => {
      const [yr, mo] = k.split("-").map(Number);
      return { label: new Date(2000, (mo ?? 1) - 1, 1).toLocaleDateString("en-US", { month: "short" }) + " " + yr, value: roundTo2(v!) };
    });
    return {
      directAnswer: `Your best month was ${label} with ${fmtDollars(roundTo2(total))} in earnings.`,
      calculations: [`By month: ${sorted.slice(0, 5).map(([k, v]) => `${k}: ${fmtDollars(roundTo2(v!))}`).join("; ")}`],
      assumptions: [],
      confidence: "high",
      chartData,
    };
  }

  // Worst month
  if (/\bworst\s+month|lowest\s+month|month\s+with\s+least|peor\s+mes|最差.*月|最慢/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const byMonth = new Map<string, number>();
    for (const r of earnings) {
      const monthKey = r.date.slice(0, 7);
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + r.amount);
    }
    const sorted = [...byMonth.entries()].sort((a, b) => a[1]! - b[1]!);
    const [monthKey, total] = sorted[0]!;
    const [y, m] = monthKey.split("-").map(Number);
    const monthName = new Date(2000, (m ?? 1) - 1, 1).toLocaleDateString("en-US", { month: "long" });
    const label = `${monthName} ${y}`;
    return {
      directAnswer: `Your worst month was ${label} with ${fmtDollars(roundTo2(total))} in earnings.`,
      calculations: [`By month (lowest first): ${sorted.slice(0, 5).map(([k, v]) => `${k}: ${fmtDollars(roundTo2(v!))}`).join("; ")}`],
      assumptions: [],
      confidence: "high",
    };
  }

  // Which student pays the most (using customer if present)
  if (/\bstudent\s+(?:who\s+)?pays\s+the\s+most|who\s+pays\s+the\s+most|top\s+student|estudiante\s+que\s+más|学生.*最多/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const byCustomer = new Map<string, number>();
    for (const r of earnings) {
      const key = (r.customer ?? "Unknown").trim() || "Unknown";
      byCustomer.set(key, (byCustomer.get(key) ?? 0) + r.amount);
    }
    const sorted = [...byCustomer.entries()].sort((a, b) => b[1]! - a[1]!);
    const [name, total] = sorted[0]!;
    if (sorted.length === 1 && (name === "Unknown" || !name)) {
      return { directAnswer: "Earnings aren’t broken down by student in this data. Add student/customer info to see who pays the most.", calculations: [], assumptions: [], confidence: "low" };
    }
    return {
      directAnswer: `${name} pays the most: ${fmtDollars(roundTo2(total!))} total.`,
      calculations: sorted.slice(0, 5).map(([n, v]) => `${n}: ${fmtDollars(roundTo2(v!))}`),
      assumptions: [],
      confidence: "high",
    };
  }

  // Which student earned the least (by customer)
  if (/\bearned\s+me\s+the\s+least|who\s+(?:has\s+)?earned\s+the\s+least|student\s+earned\s+least|最少|谁.*最少/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const byCustomer = new Map<string, number>();
    for (const r of earnings) {
      const key = (r.customer ?? "Unknown").trim() || "Unknown";
      byCustomer.set(key, (byCustomer.get(key) ?? 0) + r.amount);
    }
    const sorted = [...byCustomer.entries()].sort((a, b) => a[1]! - b[1]!);
    const [name, total] = sorted[0]!;
    if (sorted.length === 1 && (name === "Unknown" || !name)) {
      return { directAnswer: "Earnings aren't broken down by student. Add student info to see who earned you the least.", calculations: [], assumptions: [], confidence: "low" };
    }
    return {
      directAnswer: `${name} has earned you the least: ${fmtDollars(roundTo2(total!))} total.`,
      calculations: sorted.slice(0, 5).map(([n, v]) => `${n}: ${fmtDollars(roundTo2(v!))}`),
      assumptions: [],
      confidence: "high",
    };
  }

  // Lowest / highest hourly rate (requires students)
  if (students && students.length > 0 && (/\blowest\s+rate|lowest\s+hourly|which\s+student\s+.*\s+lowest|谁.*最低|tarifa\s+más\s+baja/i.test(q) || /\bhighest\s+rate|most\s+per\s+hour|which\s+student\s+.*\s+most\s+per|谁.*最高|paga\s+más\s+por\s+hora/i.test(q))) {
    const byRate = [...students].map((s) => ({ name: s.name, rate: s.rateCents / 100 }));
    byRate.sort((a, b) => a.rate - b.rate);
    const isLowest = /\blowest|最低|más\s+baja/i.test(q);
    const pick = isLowest ? byRate[0]! : byRate[byRate.length - 1]!;
    return {
      directAnswer: isLowest
        ? `${pick.name} has the lowest rate: ${fmtDollars(roundTo2(pick.rate))}/hour.`
        : `${pick.name} pays the most per hour: ${fmtDollars(roundTo2(pick.rate))}/hour.`,
      calculations: byRate.slice(0, 6).map((x) => `${x.name}: ${fmtDollars(roundTo2(x.rate))}/hr`),
      assumptions: [],
      confidence: "high",
    };
  }

  // Below average rate (students)
  if (students && students.length > 0 && /\bbelow\s+average\s+rate|rates?\s+below\s+average|低于平均|por\s+debajo\s+del\s+promedio/i.test(q)) {
    const rates = students.map((s) => s.rateCents / 100);
    const avg = rates.reduce((s, x) => s + x, 0) / rates.length;
    const below = students.filter((s) => s.rateCents / 100 < avg);
    if (below.length === 0) {
      return {
        directAnswer: `Everyone is at or above your average rate of ${fmtDollars(roundTo2(avg))}/hour.`,
        calculations: [`Average: ${fmtDollars(roundTo2(avg))}/hr`],
        assumptions: [],
        confidence: "high",
      };
    }
    const names = below.map((s) => `${s.name} (${fmtDollars(roundTo2(s.rateCents / 100))}/hr)`).join("; ");
    return {
      directAnswer: `${below.length} student(s) are below your average rate (${fmtDollars(roundTo2(avg))}/hr): ${names}.`,
      calculations: [`Average: ${fmtDollars(roundTo2(avg))}/hr`, ...below.map((s) => `${s.name}: ${fmtDollars(roundTo2(s.rateCents / 100))}/hr`)],
      assumptions: [],
      confidence: "high",
    };
  }

  // Average hourly rate (needs duration or assume 1 hour per entry)
  if (/\baverage\s+hourly\s+rate|avg\s+hourly|hourly\s+rate\s+average|tarifa\s+promedio|平均.*时薪/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const hasDuration = earnings.some((r) => r.durationMinutes != null && r.durationMinutes > 0);
    let totalEarned = 0;
    let totalHours = 0;
    if (hasDuration) {
      for (const r of earnings) {
        totalEarned += r.amount;
        totalHours += (r.durationMinutes ?? 0) / 60;
      }
      const avg = totalHours > 0 ? roundTo2(totalEarned / totalHours) : 0;
      return {
        directAnswer: `Your average hourly rate is ${fmtDollars(avg)}/hour (from ${earnings.length} entries, ${roundTo2(totalHours)} hours).`,
        calculations: [`Total earned: ${fmtDollars(roundTo2(totalEarned))}; Total hours: ${roundTo2(totalHours)}; Average = ${fmtDollars(roundTo2(totalEarned))} / ${roundTo2(totalHours)} = ${fmtDollars(avg)}/hr`],
        assumptions: [],
        confidence: "high",
      };
    }
    const assumptions: string[] = [];
    assumptions.push("Duration per lesson not in data; assuming 1 hour per earnings entry.");
    totalEarned = earnings.reduce((s, r) => s + r.amount, 0);
    totalHours = earnings.length;
    const avg = totalHours > 0 ? roundTo2(totalEarned / totalHours) : 0;
    return {
      directAnswer: `About ${fmtDollars(avg)}/hour (assuming 1 hour per lesson).`,
      calculations: [`Total: ${fmtDollars(roundTo2(totalEarned))} over ${earnings.length} lessons (1 hr each) = ${fmtDollars(avg)}/hr`],
      assumptions,
      confidence: "medium",
    };
  }

  // Cash vs Venmo (method)
  if (/\bcash\s+vs\s+venmo|venmo\s+vs\s+cash|how\s+much\s+(?:cash|venmo)|payment\s+method|método\s+de\s+pago|现金|venmo/i.test(q)) {
    const byMethod = new Map<string, number>();
    for (const r of earnings) {
      const method = (r.method ?? "other").toLowerCase();
      byMethod.set(method, (byMethod.get(method) ?? 0) + r.amount);
    }
    if (byMethod.size === 0 || (byMethod.size === 1 && byMethod.has("other"))) {
      return { directAnswer: "Payment method isn’t recorded in this data. Add method (cash, Venmo, etc.) to see a breakdown.", calculations: [], assumptions: [], confidence: "low" };
    }
    const entries = [...byMethod.entries()].sort((a, b) => b[1]! - a[1]!);
    const lines = entries.map(([method, amt]) => `${method}: ${fmtDollars(roundTo2(amt!))}`);
    const chartData = entries.map(([label, value]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), value: roundTo2(value!) }));
    return {
      directAnswer: `By payment method: ${lines.join("; ")}.`,
      calculations: lines,
      assumptions: [],
      confidence: "high",
      chartData,
    };
  }

  // Lessons last month
  if (/\blessons?\s+(?:last\s+month|this\s+month)|how\s+many\s+lessons|cuántas\s+clases|多少.*课/i.test(q)) {
    const n = now();
    const lastMonthStart = new Date(n.getFullYear(), n.getMonth() - 1, 1);
    const lastMonthEnd = new Date(n.getFullYear(), n.getMonth(), 0);
    const start = lastMonthStart.toISOString().slice(0, 10);
    const end = lastMonthEnd.toISOString().slice(0, 10);
    const count = earnings.filter((r) => r.date >= start && r.date <= end).length;
    return {
      directAnswer: `You had ${count} lesson(s) last month.`,
      calculations: [`Earnings entries in ${start} – ${end}: ${count}`],
      assumptions: ["Each earnings entry counts as one lesson."],
      confidence: "high",
    };
  }

  // Avg lessons per week
  if (/\baverage\s+lessons?\s+per\s+week|avg\s+lessons?\s+per\s+week|lessons?\s+per\s+week|平均.*周.*课/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const sorted = [...earnings].sort((a, b) => a.date.localeCompare(b.date));
    const start = parseISODate(sorted[0]!.date);
    const end = parseISODate(sorted[sorted.length - 1]!.date);
    const weeks = Math.max(0.1, daysBetween(start, end) / 7);
    const avg = roundTo2(earnings.length / weeks);
    return {
      directAnswer: `You're averaging about ${avg} lesson(s) per week.`,
      calculations: [`${earnings.length} lessons over ${roundTo2(weeks)} weeks = ${avg}/week`],
      assumptions: [],
      confidence: "high",
    };
  }

  // Revenue per lesson / per student / per hour
  if (/\brevenue\s+per\s+lesson|avg\s+revenue\s+per\s+lesson|每节课.*收入/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const total = earnings.reduce((s, r) => s + r.amount, 0);
    const perLesson = roundTo2(total / earnings.length);
    return {
      directAnswer: `Your average revenue per lesson is ${fmtDollars(perLesson)}.`,
      calculations: [`Total ${fmtDollars(roundTo2(total))} / ${earnings.length} lessons = ${fmtDollars(perLesson)}`],
      assumptions: [],
      confidence: "high",
    };
  }
  if (/\brevenue\s+per\s+student|avg\s+revenue\s+per\s+student|每个学生.*收入/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const byCustomer = new Map<string, number>();
    for (const r of earnings) {
      const key = (r.customer ?? "Unknown").trim() || "Unknown";
      byCustomer.set(key, (byCustomer.get(key) ?? 0) + r.amount);
    }
    const total = earnings.reduce((s, r) => s + r.amount, 0);
    const numStudents = byCustomer.size;
    const perStudent = numStudents > 0 ? roundTo2(total / numStudents) : 0;
    if (numStudents === 0 || (numStudents === 1 && byCustomer.has("Unknown"))) {
      return { directAnswer: "Earnings aren't broken down by student. Add student info for per-student revenue.", calculations: [], assumptions: [], confidence: "low" };
    }
    return {
      directAnswer: `Your average revenue per student is ${fmtDollars(perStudent)} (${numStudents} students).`,
      calculations: [`Total ${fmtDollars(roundTo2(total))} / ${numStudents} students = ${fmtDollars(perStudent)}`],
      assumptions: [],
      confidence: "high",
    };
  }
  if (/\brevenue\s+per\s+hour|revenue\s+generate\s+per\s+hour|每小时.*收入/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const total = earnings.reduce((s, r) => s + r.amount, 0);
    const hasDuration = earnings.some((r) => r.durationMinutes != null && r.durationMinutes > 0);
    const totalHours = hasDuration
      ? earnings.reduce((s, r) => s + (r.durationMinutes ?? 0) / 60, 0)
      : earnings.length;
    if (totalHours <= 0) {
      return { directAnswer: "No teaching hours in data. Add duration to see revenue per hour.", calculations: [], assumptions: [], confidence: "low" };
    }
    const perHour = roundTo2(total / totalHours);
    return {
      directAnswer: `You generate about ${fmtDollars(perHour)} per hour of teaching.`,
      calculations: [`Total ${fmtDollars(roundTo2(total))} / ${roundTo2(totalHours)} hours = ${fmtDollars(perHour)}/hr`],
      assumptions: hasDuration ? [] : ["Assuming 1 hour per lesson."],
      confidence: hasDuration ? "high" : "medium",
    };
  }

  // Best day of week (by earnings)
  if (/\bbest\s+day\s+of\s+week|day\s+of\s+week\s+earns?|which\s+day\s+earns?|哪天.*最多|mejor\s+día/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const byDay = new Map<number, number>();
    for (const r of earnings) {
      const [y, m, d] = r.date.split("-").map(Number);
      const dayOfWeek = new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
      byDay.set(dayOfWeek, (byDay.get(dayOfWeek) ?? 0) + r.amount);
    }
    const sorted = [...byDay.entries()].sort((a, b) => b[1]! - a[1]!);
    const [dayNum, total] = sorted[0]!;
    const chartData = sorted.map(([d, v]) => ({ label: dayNames[d!]!, value: roundTo2(v!) }));
    return {
      directAnswer: `${dayNames[dayNum]!} earns you the most: ${fmtDollars(roundTo2(total))} total.`,
      calculations: chartData.map((x) => `${x.label}: ${fmtDollars(x.value)}`),
      assumptions: [],
      confidence: "high",
      chartData,
    };
  }

  // Tax: set aside, quarterly, take-home
  if (/\bset\s+aside\s+for\s+taxes|how\s+much\s+set\s+aside|quarterly\s+tax|estimated\s+quarterly|预留.*税|季度税/i.test(q)) {
    if (projectedYearly == null) {
      return { directAnswer: "Not enough data to estimate taxes. Add more earnings.", calculations: [], assumptions: [], confidence: "low" };
    }
    const tax = computeTaxEstimate(projectedYearly);
    const quarterly = tax.estimatedTax != null ? roundTo2(tax.estimatedTax / 4) : null;
    return {
      directAnswer:
        tax.estimatedTax == null
          ? "Not enough data for tax estimate."
          : `Set aside about ${fmtDollars(tax.monthlySetAside)}/month (${fmtDollars(tax.estimatedTax)}/year). Estimated quarterly payment: ${quarterly != null ? fmtDollars(quarterly) : "—"}.`,
      calculations:
        tax.estimatedTax != null
          ? [`20% of projected yearly ${fmtDollars(projectedYearly)} ≈ ${fmtDollars(tax.estimatedTax)}`, `Monthly: ${fmtDollars(tax.monthlySetAside)}`, `Quarterly: ${quarterly != null ? fmtDollars(quarterly) : "—"}`]
          : [],
      assumptions: ["Using ~20% for combined federal/state self-employment tax estimate. Consult a tax professional."],
      confidence: "medium",
    };
  }
  if (/\btake[- ]?home|profit\s+after\s+tax|projected\s+take[- ]?home|税后|到手/i.test(q)) {
    if (projectedYearly == null) {
      return { directAnswer: "Not enough data to project take-home. Add more earnings.", calculations: [], assumptions: [], confidence: "low" };
    }
    const tax = computeTaxEstimate(projectedYearly);
    const takeHome = tax.estimatedTax != null ? roundTo2(projectedYearly - tax.estimatedTax) : projectedYearly;
    return {
      directAnswer: `Projected take-home after estimated taxes: about ${fmtDollars(takeHome)}/year (${fmtDollars(roundTo2(takeHome / 12))}/month).`,
      calculations: [`Projected yearly ${fmtDollars(projectedYearly)} − estimated tax ${tax.estimatedTax != null ? fmtDollars(tax.estimatedTax) : "—"} = ${fmtDollars(takeHome)}`],
      assumptions: ["~20% tax estimate. Actual taxes depend on deductions and situation."],
      confidence: "medium",
    };
  }

  // Stability / volatility
  if (/\bstable|volatile|volatility|income\s+stable|稳定|波动/i.test(q)) {
    const cash = computeCashflowInsights(earnings);
    if (cash.volatility == null) {
      return { directAnswer: "Not enough data to assess stability. Add more weekly earnings.", calculations: [], assumptions: [], confidence: "low" };
    }
    const stable = cash.volatility < 0.25;
    return {
      directAnswer: stable
        ? `Your income looks relatively stable (low week-to-week variation).`
        : `Your income has moderate variation week to week (volatility ${(cash.volatility * 100).toFixed(0)}%). Best and worst weeks can differ.`,
      calculations:
        cash.bestWeek && cash.worstWeek
          ? [`Best week: ${fmtDollars(cash.bestWeek.total)} (${cash.bestWeek.start}–${cash.bestWeek.end})`, `Worst week: ${fmtDollars(cash.worstWeek.total)}`]
          : [],
      assumptions: [],
      confidence: earnings.length >= 8 ? "high" : "medium",
    };
  }

  // Compare to last month / this month vs last
  if (/\bcompare\s+to\s+last\s+month|this\s+month\s+vs|month\s+over\s+month|环比|comparar\s+con/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const n = now();
    const thisMonthStart = new Date(n.getFullYear(), n.getMonth(), 1);
    const lastMonthStart = new Date(n.getFullYear(), n.getMonth() - 1, 1);
    const lastMonthEnd = new Date(n.getFullYear(), n.getMonth(), 0);
    const thisStart = thisMonthStart.toISOString().slice(0, 10);
    const lastStart = lastMonthStart.toISOString().slice(0, 10);
    const lastEnd = lastMonthEnd.toISOString().slice(0, 10);
    const thisTotal = earnings.filter((r) => r.date >= thisStart).reduce((s, r) => s + r.amount, 0);
    const lastTotal = earnings.filter((r) => r.date >= lastStart && r.date <= lastEnd).reduce((s, r) => s + r.amount, 0);
    const change = lastTotal > 0 ? roundTo2(((thisTotal - lastTotal) / lastTotal) * 100) : 0;
    return {
      directAnswer:
        lastTotal === 0
          ? `This month so far: ${fmtDollars(roundTo2(thisTotal))}. Last month had no recorded earnings.`
          : `This month: ${fmtDollars(roundTo2(thisTotal))}. Last month: ${fmtDollars(roundTo2(lastTotal))}. That's ${change >= 0 ? "+" : ""}${change}% ${change >= 0 ? "higher" : "lower"}.`,
      calculations: [`This month (to date): ${fmtDollars(roundTo2(thisTotal))}`, `Last month: ${fmtDollars(roundTo2(lastTotal))}`, `Change: ${change}%`],
      assumptions: [],
      confidence: "high",
    };
  }

  // Year-over-year growth
  if (/\byear[- ]over[- ]year|yoy|growth\s+rate|同比|crecimiento\s+anual/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const y = now().getFullYear();
    const thisYear = earnings.filter((r) => r.date.startsWith(String(y))).reduce((s, r) => s + r.amount, 0);
    const lastYear = earnings.filter((r) => r.date.startsWith(String(y - 1))).reduce((s, r) => s + r.amount, 0);
    const change = lastYear > 0 ? roundTo2(((thisYear - lastYear) / lastYear) * 100) : (thisYear > 0 ? 100 : 0);
    return {
      directAnswer:
        lastYear === 0
          ? `This year so far: ${fmtDollars(roundTo2(thisYear))}. No data for ${y - 1}.`
          : `This year: ${fmtDollars(roundTo2(thisYear))}. Last year: ${fmtDollars(roundTo2(lastYear))}. Year-over-year: ${change >= 0 ? "+" : ""}${change}%.`,
      calculations: [`${y} YTD: ${fmtDollars(roundTo2(thisYear))}`, `${y - 1}: ${fmtDollars(roundTo2(lastYear))}`, `Change: ${change}%`],
      assumptions: [],
      confidence: "high",
    };
  }

  // Revenue concentration: top 3, 80% of revenue
  if (/\btop\s+3\s+students?|80%\s+of\s+revenue|percent(age)?\s+from\s+top|revenue\s+concentration|集中|占比|estudiantes?\s+que\s+generan/i.test(q)) {
    if (!earnings.length) {
      return { directAnswer: "No earnings data yet.", calculations: [], assumptions: [], confidence: "low" };
    }
    const byCustomer = new Map<string, number>();
    for (const r of earnings) {
      const key = (r.customer ?? "Unknown").trim() || "Unknown";
      byCustomer.set(key, (byCustomer.get(key) ?? 0) + r.amount);
    }
    const total = earnings.reduce((s, r) => s + r.amount, 0);
    const sorted = [...byCustomer.entries()].sort((a, b) => b[1]! - a[1]!);
    if (sorted.length === 1 && (sorted[0]![0] === "Unknown" || !sorted[0]![0])) {
      return { directAnswer: "Earnings aren't broken down by student.", calculations: [], assumptions: [], confidence: "low" };
    }
    const top3 = sorted.slice(0, 3);
    const top3Sum = top3.reduce((s, [, v]) => s + v!, 0);
    const pctTop3 = total > 0 ? roundTo2((top3Sum / total) * 100) : 0;
    let n80 = 0;
    let sum80 = 0;
    for (const [, v] of sorted) {
      sum80 += v!;
      n80++;
      if (sum80 >= total * 0.8) break;
    }
    return {
      directAnswer: `Your top 3 students account for ${pctTop3}% of revenue. About ${n80} student(s) generate 80% of your revenue.`,
      calculations: [
        ...top3.map(([name, v]) => `${name}: ${fmtDollars(roundTo2(v!))} (${total > 0 ? roundTo2((v! / total) * 100) : 0}%)`),
        `Top 3 total: ${pctTop3}%`,
      ],
      assumptions: [],
      confidence: "high",
    };
  }

  // Churn / LTV / most profitable hour (acknowledge; give what we can)
  if (/\bmost\s+profitable\s+hour|churn|who\s+likely\s+to\s+churn|lifetime\s+value|ltv|best\s+hour\s+of\s+week/i.test(q)) {
    const bestDay = (() => {
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const byDay = new Map<number, number>();
      for (const r of earnings) {
        const [y, m, d] = r.date.split("-").map(Number);
        const dow = new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
        byDay.set(dow, (byDay.get(dow) ?? 0) + r.amount);
      }
      const ent = [...byDay.entries()].sort((a, b) => b[1]! - a[1]!)[0];
      return ent ? dayNames[ent[0]!] : null;
    })();
    const note = bestDay
      ? `Your highest-earning day of the week is ${bestDay}. We don't predict churn or lifetime value yet — that would require more history.`
      : "We don't have churn prediction or lifetime value yet. Add more data to see best day of week and trends.";
    return {
      directAnswer: note,
      calculations: [],
      assumptions: [],
      confidence: "low",
    };
  }

  // Fallback: generic summary
  const total = earnings.reduce((s, r) => s + r.amount, 0);
  const count = earnings.length;
  if (count === 0) {
    return {
      directAnswer: "No earnings data yet. Add a few entries to ask questions about your income.",
      calculations: [],
      assumptions: [],
      confidence: "low",
    };
  }
  calculations.push(`Total: ${fmtDollars(roundTo2(total))}; Count: ${count}`);
  return {
    directAnswer: `You have ${count} earnings entries, totaling ${fmtDollars(roundTo2(total))}.`,
    calculations,
    assumptions: [],
    confidence: "medium",
  };
}
