import { queryPlanSchema, type InsightIntent, type QueryPlan, type TimeRange } from "./schema";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export type InsightsPriorContext = {
  intent: InsightIntent;
  time_range?: TimeRange;
  student_filter?: QueryPlan["student_filter"];
  slots?: Record<string, unknown>;
};

export function normalizeInsightsQuery(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:()]+/g, " ")
    .replace(/\bhrs?\b/g, "hour")
    .replace(/\bh\b/g, "hour")
    .replace(/\bmins?\b/g, "minutes")
    .replace(/\s+/g, " ");
}

function monthRange(year: number, month: number, label?: string): TimeRange {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { type: "month", start, end, label: label ?? `${year}-${String(month).padStart(2, "0")}` };
}

function yearRange(year: number): TimeRange {
  return { type: "year", start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) };
}

function extractDateRange(query: string): TimeRange | undefined {
  const now = new Date();
  const yearNow = now.getFullYear();
  if (/\bytd|year to date|this year\b/.test(query)) {
    return { type: "ytd", start: `${yearNow}-01-01`, end: now.toISOString().slice(0, 10), label: `${yearNow} YTD` };
  }
  if (/\blast month\b/.test(query)) {
    const y = now.getMonth() === 0 ? yearNow - 1 : yearNow;
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    return monthRange(y, m, "last_month");
  }
  if (/\bthis month\b/.test(query)) {
    return monthRange(yearNow, now.getMonth() + 1, "this_month");
  }
  if (/\blast year\b/.test(query)) {
    return yearRange(yearNow - 1);
  }
  const explicitYear = query.match(/\b(20\d{2})\b/);
  const explicitMonth = query.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/);
  if (explicitMonth) {
    const m = MONTHS[explicitMonth[1]];
    const y = Number(explicitMonth[2]);
    if (m && y) return monthRange(y, m);
  }
  if (explicitYear) return yearRange(Number(explicitYear[1]));
  if (/\blast 7 days|past 7 days\b/.test(query)) {
    const end = now.toISOString().slice(0, 10);
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return { type: "rolling_days", start: s.toISOString().slice(0, 10), end, label: "last_7_days" };
  }
  return undefined;
}

function extractStudentName(query: string): string | undefined {
  const patterns = [
    /how much did\s+(.+?)\s+earn me/i,
    /how much has\s+(.+?)\s+earned me/i,
    /(.+?)\s+ytd\s+(?:earnings|total)/i,
    /ytd from\s+(.+)/i,
    /(.+?)\s+year to date\s+earnings/i,
    /attendance summary for\s+(.+)/i,
    /for student\s+(.+)/i,
  ];
  for (const p of patterns) {
    const m = query.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function deriveTruthKey(intent: InsightIntent): string {
  const map: Record<InsightIntent, string> = {
    student_highest_hourly_rate: "student_highest_hourly_rate",
    student_lowest_hourly_rate: "student_lowest_hourly_rate",
    students_below_average_rate: "students_below_average_rate",
    earnings_in_period: "earnings_in_period",
    earnings_ytd_for_student: "earnings_ytd_for_student",
    student_missed_most_lessons_in_year: "student_missed_most_lessons_in_year",
    student_attendance_summary: "student_attendance_summary",
    revenue_per_student_in_period: "revenue_per_student_in_period",
    forecast_monthly: "forecast_monthly",
    forecast_yearly: "forecast_yearly",
    percent_change_yoy: "percent_change_yoy",
    average_hourly_rate_in_period: "average_hourly_rate_in_period",
    general_fallback: "general_fallback",
    clarification: "clarification",
  };
  return map[intent];
}

function routeIntent(normalized: string): InsightIntent {
  if (/\bwho missed the most|missed most lessons|most missed lessons|most absences\b/.test(normalized)) return "student_missed_most_lessons_in_year";
  if (/\bhighest hourly rate|highest hourly student|pays the most per hour|highest paying student|highest paying per hour\b/.test(normalized)) return "student_highest_hourly_rate";
  if (/\blowest hourly rate|lowest hourly student|least hourly rate student|who pays the least per hour|who is lowest per hour|pays the least\b/.test(normalized)) return "student_lowest_hourly_rate";
  if (/\bbelow my average rate|below my average hourly rate|below average hourly rate|below average hourly|students below average|students below my average|under average rate\b/.test(normalized)) return "students_below_average_rate";
  if (/\baverage hourly rate|avg hourly|hourly average\b/.test(normalized)) return "average_hourly_rate_in_period";
  if (/\baverage rate\b/.test(normalized) && !/\bbelow|under\b/.test(normalized)) return "average_hourly_rate_in_period";
  if ((/\bytd\b/.test(normalized) || /\byear to date\b/.test(normalized)) && (/\bearn me\b/.test(normalized) || /\b[a-z]+\s+[a-z]+\s+ytd\b/.test(normalized) || /\bytd from\b/.test(normalized) || /\byear to date earnings\b/.test(normalized))) return "earnings_ytd_for_student";
  if (/\battendance summary\b/.test(normalized)) return "student_attendance_summary";
  if (/\btop 3 students by revenue|top 3 by revenue|revenue per student|revenue ranking|student revenue breakdown\b/.test(normalized)) return "revenue_per_student_in_period";
  if (/\bforecast monthly|projected monthly|forecast this month|monthly projection|will i earn this month\b/.test(normalized)) return "forecast_monthly";
  if (/\bforecast yearly|projected yearly|forecast this year|yearly projection|will i earn this year\b/.test(normalized)) return "forecast_yearly";
  if (/%|percent|percentage/.test(normalized) && /\b(20\d{2}).*(20\d{2})\b/.test(normalized)) return "percent_change_yoy";
  if (/\bhow much did i earn|earnings|revenue|income\b/.test(normalized)) return "earnings_in_period";
  if (/\bhow much in\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+20\d{2}\b/.test(normalized)) return "earnings_in_period";
  return "general_fallback";
}

export function parseToQueryPlan(query: string, priorContext?: InsightsPriorContext): QueryPlan {
  const normalized = normalizeInsightsQuery(query || "");
  const routedIntent = routeIntent(normalized);
  const time_range = extractDateRange(normalized) ?? priorContext?.time_range;
  const student_name = extractStudentName(normalized);

  const needsClarification =
    routedIntent === "general_fallback" ||
    ((routedIntent === "earnings_ytd_for_student" || routedIntent === "student_attendance_summary") && !student_name) ||
    (routedIntent === "student_missed_most_lessons_in_year" && !/\b20\d{2}\b/.test(normalized));

  const clarifying_question = needsClarification
    ? routedIntent === "student_missed_most_lessons_in_year"
      ? "Which year should I use for missed lessons?"
      : routedIntent === "earnings_ytd_for_student" || routedIntent === "student_attendance_summary"
        ? "Which student did you mean?"
        : "Did you mean earnings, attendance, rate comparison, or forecast?"
    : null;

  const intent: InsightIntent = needsClarification ? "clarification" : routedIntent;
  const slots: Record<string, unknown> = {};
  const years = normalized.match(/\b(20\d{2})\b/g)?.map((y) => Number(y)) ?? [];
  if (years.length >= 2 && routedIntent === "percent_change_yoy") {
    slots.year_a = Math.min(...years);
    slots.year_b = Math.max(...years);
  }
  if (years.length > 0 && !slots.year) slots.year = years[0];

  const plan: QueryPlan = {
    intent,
    normalized_query: normalized,
    time_range,
    student_filter: student_name ? { student_name } : undefined,
    requested_metric: /%|percent|percentage/.test(normalized) ? "percent" : /\bwho\b/.test(normalized) ? "who" : "dollars",
    needs_clarification: needsClarification,
    clarifying_question,
    required_missing_params: needsClarification ? (routedIntent === "student_missed_most_lessons_in_year" ? ["year"] : ["intent"]) : [],
    sql_truth_query_key: deriveTruthKey(intent),
    slots: Object.keys(slots).length ? slots : undefined,
  };

  const parsed = queryPlanSchema.safeParse(plan);
  return parsed.success ? parsed.data : plan;
}
