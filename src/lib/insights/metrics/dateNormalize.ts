/** Single place for date-range parsing. Inclusive [start, end]. YYYY-MM-DD. */

export type NormalizedRange = { start: string; end: string; label?: string };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthRange(year: number, month: number): NormalizedRange {
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}`, label: `${year}-${pad(month)}` };
}

export function yearRange(year: number): NormalizedRange {
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) };
}

export function normalizeDateRange(query: string, todayISO?: string): NormalizedRange | undefined {
  const now = todayISO ? new Date(todayISO + "T12:00:00") : new Date();
  const today = todayISO ?? now.toISOString().slice(0, 10);
  const yearNow = now.getFullYear();
  const q = query.toLowerCase().trim();
  if (/\bytd|year to date|this year\b/.test(q)) return { start: `${yearNow}-01-01`, end: today, label: `${yearNow} YTD` };
  if (/\blast month\b/.test(q)) {
    const y = now.getMonth() === 0 ? yearNow - 1 : yearNow;
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    return monthRange(y, m);
  }
  if (/\bthis month\b/.test(q)) return monthRange(yearNow, now.getMonth() + 1);
  if (/\blast year\b/.test(q)) return yearRange(yearNow - 1);
  const explicitMonth = q.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/);
  if (explicitMonth) {
    const m = MONTHS[explicitMonth[1]];
    const y = Number(explicitMonth[2]);
    if (m && y) return monthRange(y, m);
  }
  const monthShortYear = q.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+'?(\d{2})\b/);
  if (monthShortYear) {
    const m = MONTHS[monthShortYear[1]];
    const y2 = Number(monthShortYear[2]);
    const y = y2 >= 0 && y2 <= 99 ? 2000 + y2 : y2;
    if (m && y >= 2000 && y <= 2100) return monthRange(y, m);
  }
  const slashMonthYear = q.match(/\b(\d{1,2})\/(20\d{2})\b/);
  if (slashMonthYear) {
    const m = Number(slashMonthYear[1]);
    const y = Number(slashMonthYear[2]);
    if (m >= 1 && m <= 12 && y >= 2000) return monthRange(y, m);
  }
  const explicitYear = q.match(/\b(20\d{2})\b/);
  if (explicitYear) return yearRange(Number(explicitYear[1]));
  if (/\blast 7 days|past 7 days\b/.test(q)) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - 6);
    return { start: toDateKeyLocal(d), end: today, label: "last_7_days" };
  }
  if (/\blast 30 days|past 30 days\b/.test(q)) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - 29);
    return { start: toDateKeyLocal(d), end: today, label: "last_30_days" };
  }
  return undefined;
}

export function defaultRangeForIntent(intent: string, todayISO?: string): NormalizedRange {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const y = new Date(today + "T12:00:00").getFullYear();
  if (intent === "on_track_goal" || intent === "day_of_week_earnings_max" || intent === "average_hourly_rate_in_period") {
    return { start: `${y}-01-01`, end: today, label: `${y} YTD` };
  }
  const d = new Date(today + "T12:00:00");
  d.setDate(d.getDate() - 29);
  return { start: toDateKeyLocal(d), end: today, label: "last_30_days" };
}
