import { queryPlanSchema, type InsightIntent, type QueryPlan, type TimeRange } from "./schema";
import { normalizeDateRange, defaultRangeForIntent } from "./metrics/dateNormalize";

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

function toTimeRange(nr: { start: string; end: string; label?: string }, type: TimeRange["type"] = "custom"): TimeRange {
  return { type, start: nr.start, end: nr.end, label: nr.label };
}

function extractDateRange(query: string, todayISO?: string): TimeRange | undefined {
  const nr = normalizeDateRange(query, todayISO);
  if (!nr) return undefined;
  if (nr.label?.endsWith("YTD")) return toTimeRange(nr, "ytd");
  if (nr.label === "last_month") return toTimeRange(nr, "month");
  if (nr.label === "this_month") return toTimeRange(nr, "month");
  if (nr.label === "last_7_days" || nr.label === "last_30_days") return toTimeRange(nr, "rolling_days");
  if (nr.label && /^\d{4}-\d{2}$/.test(nr.label)) return toTimeRange(nr, "month");
  if (nr.label && /^\d{4}$/.test(nr.label)) return toTimeRange(nr, "year");
  return toTimeRange(nr);
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

function parseTopN(normalized: string): number | undefined {
  const direct = normalized.match(/\btop\s+(\d+)\b/);
  if (direct) return Number(direct[1]);
  const leading = normalized.match(/\b(\d+)\s+(highest|top)\b.*\bstudents?\b/);
  if (leading) return Number(leading[1]);
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const word = normalized.match(/\btop\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (word) return words[word[1]];
  const leadingWord = normalized.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(highest|top)\b.*\bstudents?\b/);
  if (leadingWord) return words[leadingWord[1]];
  return undefined;
}

function inferMissingParams(
  routedIntent: InsightIntent,
  normalized: string,
  studentName?: string
): string[] {
  if (routedIntent === "general_fallback") return ["intent"];
  if (routedIntent === "what_if_rate_change" && !/\b(\$?\d+(?:\.\d+)?)\s*(?:\/\s*hour|per\s*hour|an?\s*hour|hour)\b/.test(normalized) && !/\bby\s+\$?\d+(?:\.\d+)?\b/.test(normalized)) {
    return ["rate_delta"];
  }
  if (routedIntent === "what_if_add_students" && !/\badd\s+\d+\s+new\s+students?\b/.test(normalized)) {
    return ["student_count"];
  }
  if (routedIntent === "what_if_take_time_off" && !/\b\d+\s+weeks?\s+off\b/.test(normalized)) {
    return ["weeks_off"];
  }
  if (routedIntent === "what_if_lose_top_students" && !/\btop\s+\d+\s+students?\b/.test(normalized)) {
    return ["top_n"];
  }
  if (routedIntent === "students_needed_for_target_income") {
    const hasTarget = /\b\$\s*\d+|\b\d+\s*k\b/i.test(normalized);
    const hasRate =
      /\bat\s+\$?\s*\d+(?:\.\d+)?\s*(?:per\s*hour|hr|hour)\b/i.test(normalized) ||
      /\b\$\s*\d+(?:\.\d+)?\s*(?:\/\s*hr|\/\s*hour|per\s*hour|hr|hour)\b/i.test(normalized) ||
      /\b\d+(?:\.\d+)?\s*(?:\/\s*hr|\/\s*hour|per\s*hour)\b/i.test(normalized);
    const missing: string[] = [];
    if (!hasTarget) missing.push("target_income");
    if (!hasRate) missing.push("rate");
    return missing;
  }
  if (
    (routedIntent === "earnings_ytd_for_student" ||
      routedIntent === "student_attendance_summary") &&
    !studentName
  ) {
    return ["student"];
  }
  if (
    routedIntent === "student_missed_most_lessons_in_year" &&
    !/\b20\d{2}\b/.test(normalized)
  ) {
    return ["year"];
  }
  return [];
}

function deriveTruthKey(intent: InsightIntent): string {
  const map: Record<InsightIntent, string> = {
    student_highest_hourly_rate: "student_highest_hourly_rate",
    student_lowest_hourly_rate: "student_lowest_hourly_rate",
    students_below_average_rate: "students_below_average_rate",
    earnings_in_period: "earnings_in_period",
    lessons_count_in_period: "lessons_count_in_period",
    hours_total_in_period: "hours_total_in_period",
    avg_lessons_per_week_in_period: "avg_lessons_per_week_in_period",
    revenue_per_lesson_in_period: "revenue_per_lesson_in_period",
    earnings_ytd_for_student: "earnings_ytd_for_student",
    student_missed_most_lessons_in_year: "student_missed_most_lessons_in_year",
    student_attendance_summary: "student_attendance_summary",
    revenue_per_student_in_period: "revenue_per_student_in_period",
    avg_weekly_revenue: "avg_weekly_revenue",
    cash_flow_trend: "cash_flow_trend",
    income_stability: "income_stability",
    what_if_rate_change: "what_if_rate_change",
    what_if_add_students: "what_if_add_students",
    what_if_take_time_off: "what_if_take_time_off",
    what_if_lose_top_students: "what_if_lose_top_students",
    students_needed_for_target_income: "students_needed_for_target_income",
    tax_guidance: "tax_guidance",
    forecast_monthly: "forecast_monthly",
    forecast_yearly: "forecast_yearly",
    percent_change_yoy: "percent_change_yoy",
    average_hourly_rate_in_period: "average_hourly_rate_in_period",
    day_of_week_earnings_max: "day_of_week_earnings_max",
    general_fallback: "general_fallback",
    clarification: "clarification",
  };
  return map[intent];
}

function routeIntent(normalized: string): InsightIntent {
  if (/^how many lessons did i teach last month$/.test(normalized)) return "lessons_count_in_period";
  if (/^what s my revenue per lesson$/.test(normalized) || /^what is my revenue per lesson$/.test(normalized)) return "revenue_per_lesson_in_period";
  if (/^what day of the week do i earn the most$/.test(normalized)) return "day_of_week_earnings_max";
  if (/\b(estimated\s+tax|tax estimate|set aside for taxes|quarterly taxes|taxes?)\b/.test(normalized)) return "tax_guidance";
  if (/\b(what if|if i)\b.*\b(raise|increase)\b.*\b(rate|rates)\b/.test(normalized)) return "what_if_rate_change";
  if (/\b(what if|if i)\b.*\badd\s+\d+\s+new\s+students?\b/.test(normalized)) return "what_if_add_students";
  if (/\b(what if|if i)\b.*\btake\s+\d+\s+weeks?\s+off\b/.test(normalized)) return "what_if_take_time_off";
  if (/\b(what if|if i)\b.*\blose\b.*\btop\s+\d+\s+students?\b/.test(normalized)) return "what_if_lose_top_students";
  if (/\bhow many students\b.*\breach\b.*\b\$\s*\d+|\bhow many students\b.*\breach\b.*\b\d+\s*k\b/i.test(normalized)) return "students_needed_for_target_income";
  if (/\bhow many hours\b|\bhours worked\b|\bhours did i work\b|\btotal hours\b/.test(normalized)) return "hours_total_in_period";
  if (/\baverage lessons per week\b|\bavg lessons per week\b|\baverage.*lessons.*per week\b/.test(normalized)) return "avg_lessons_per_week_in_period";
  if (/\b(stable|stability|volatile|volatility)\b/.test(normalized) && /\b(income|earnings|revenue|cash flow)\b/.test(normalized)) return "income_stability";
  if (/\bis my income (stable|volatile)\b/.test(normalized)) return "income_stability";
  if (/\bis my cash flow (stable|volatile)\b/.test(normalized)) return "income_stability";
  if (/\b(cash flow trend|income trend|revenue trend|earnings trend|cash flow trending|revenue trending|earnings trending|my cash flow|cashflow trend)\b/.test(normalized)) return "cash_flow_trend";
  if (/\b(what s|what is|whats)\s+my\s+cash flow\b/.test(normalized)) return "cash_flow_trend";
  if ((/\baverage\b.*\bper week\b/.test(normalized) || /\baverage weekly\b/.test(normalized) || /\bper week\b.*\baverage\b/.test(normalized) || /\bweekly average\b/.test(normalized) || /\bearn on average per week\b/.test(normalized)) && /\b(earn|revenue|income|cash flow|earnings)\b/.test(normalized)) return "avg_weekly_revenue";
  if (/\bhow much do i earn (on )?average per week\b/.test(normalized)) return "avg_weekly_revenue";
  if (/\bwho missed the most|missed most lessons|most missed lessons|most absences\b/.test(normalized)) return "student_missed_most_lessons_in_year";
  if (/\bhow many lessons\b|\blesson count\b|\bcount lessons\b|\bnumber of lessons\b/.test(normalized)) return "lessons_count_in_period";
  if (/\brevenue per lesson\b|\baverage revenue per lesson\b|\bavg revenue per lesson\b/.test(normalized)) return "revenue_per_lesson_in_period";
  if (/\bhighest hourly rate|highest hourly student|pays the most per hour|highest paying student|highest paying per hour\b/.test(normalized)) return "student_highest_hourly_rate";
  if (/\blowest hourly rate|lowest hourly student|least hourly rate student|who pays the least per hour|who is lowest per hour\b/.test(normalized)) return "student_lowest_hourly_rate";
  if (/\bwho pays the most\b|\bwhich student pays the most\b|\btop paying student\b/.test(normalized)) return "revenue_per_student_in_period";
  if (/\bwho pays the least\b|\bwhich student pays the least\b/.test(normalized)) return "revenue_per_student_in_period";
  if (/\bbelow my average rate|below my average hourly rate|below average hourly rate|below average hourly|students below average|students below my average|under average rate\b/.test(normalized)) return "students_below_average_rate";
  if (/\baverage hourly rate|avg hourly|hourly average\b/.test(normalized)) return "average_hourly_rate_in_period";
  if (/\baverage rate\b/.test(normalized) && !/\bbelow|under\b/.test(normalized)) return "average_hourly_rate_in_period";
  if (/\bwhat day (?:of the week )?do i earn the most|(?:which |what )?day (?:of the week )?is best for earnings|day of the week.*earn the most|earn the most on which day|best day for earnings|which day do i earn the most\b/.test(normalized)) return "day_of_week_earnings_max";
  if ((/\bytd\b/.test(normalized) || /\byear to date\b/.test(normalized)) && (/\bearn me\b/.test(normalized) || /\b[a-z]+\s+[a-z]+\s+ytd\b/.test(normalized) || /\bytd from\b/.test(normalized) || /\byear to date earnings\b/.test(normalized))) return "earnings_ytd_for_student";
  if (/\battendance summary\b/.test(normalized)) return "student_attendance_summary";
  if (/\b(top\s+\d+|top\s+(one|two|three|four|five|six|seven|eight|nine|ten)|highest)\b.*\b(student|students)\b.*\b(revenue|earnings|income)\b/.test(normalized)) return "revenue_per_student_in_period";
  if (/\btop\s+\d+\b.*\bby\b.*\b(revenue|earnings|income)\b/.test(normalized)) return "revenue_per_student_in_period";
  if (/\btop\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b.*\bby\b.*\b(revenue|earnings|income)\b/.test(normalized)) return "revenue_per_student_in_period";
  if (/\bwhich student\b.*\b(earn|earned|revenue|income)\b.*\bmost\b/.test(normalized)) return "revenue_per_student_in_period";
  if (/\bwho\b.*\bearned?\b.*\bmost\b/.test(normalized)) return "revenue_per_student_in_period";
  if (/\brevenue per student|revenue ranking|student revenue breakdown|best students by revenue\b/.test(normalized)) return "revenue_per_student_in_period";
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
  const todayISO = new Date().toISOString().slice(0, 10);
  let time_range = extractDateRange(normalized, todayISO) ?? priorContext?.time_range;
  // Default date range for intents that support it (e.g. day of week earn most -> YTD)
  if (!time_range && routedIntent === "day_of_week_earnings_max") {
    const def = defaultRangeForIntent("day_of_week_earnings_max", todayISO);
    time_range = toTimeRange(def, "ytd");
  }
  if (!time_range && (routedIntent === "earnings_in_period" || routedIntent === "average_hourly_rate_in_period" || routedIntent === "revenue_per_student_in_period" || routedIntent === "lessons_count_in_period" || routedIntent === "hours_total_in_period" || routedIntent === "avg_lessons_per_week_in_period" || routedIntent === "revenue_per_lesson_in_period" || routedIntent === "avg_weekly_revenue" || routedIntent === "cash_flow_trend" || routedIntent === "income_stability" || routedIntent === "what_if_rate_change" || routedIntent === "what_if_add_students" || routedIntent === "what_if_take_time_off" || routedIntent === "what_if_lose_top_students" || routedIntent === "students_needed_for_target_income" || routedIntent === "tax_guidance")) {
    const def = defaultRangeForIntent(routedIntent, todayISO);
    time_range = toTimeRange(def, def.label?.includes("YTD") ? "ytd" : "rolling_days");
  }
  const student_name = extractStudentName(normalized);

  const missingParams = inferMissingParams(routedIntent, normalized, student_name);
  const needsClarification = missingParams.length > 0;

  const clarifying_question = needsClarification
    ? routedIntent === "student_missed_most_lessons_in_year"
      ? "Which year should I use for missed lessons?"
      : routedIntent === "earnings_ytd_for_student" || routedIntent === "student_attendance_summary"
        ? "Which student did you mean?"
        : routedIntent === "what_if_rate_change"
          ? "How much should I change the rate by (e.g. $10/hour)?"
            : routedIntent === "what_if_add_students"
              ? "How many new students should I model (e.g. “add 3 new students”) and should I assume they match your typical schedule?"
              : routedIntent === "what_if_take_time_off"
                ? "How many weeks off should I model (e.g. “take 2 weeks off”)?"
                : routedIntent === "what_if_lose_top_students"
                  ? "How many top students should I remove (e.g. “lose my top 2 students”) and what time range should I use?"
                  : routedIntent === "students_needed_for_target_income"
                    ? "What target income and hourly rate should I use (e.g. “reach $100k at $70/hr”)?"
        : "Did you mean earnings or attendance?"
    : null;

  const intent: InsightIntent = needsClarification ? "clarification" : routedIntent;
  const slots: Record<string, unknown> = {};
  const years = normalized.match(/\b(20\d{2})\b/g)?.map((y) => Number(y)) ?? [];
  if (years.length >= 2 && routedIntent === "percent_change_yoy") {
    slots.year_a = Math.min(...years);
    slots.year_b = Math.max(...years);
  }
  if (years.length > 0 && !slots.year) slots.year = years[0];
  const topN = parseTopN(normalized);
  if (routedIntent === "revenue_per_student_in_period") {
    if (topN && topN > 0) slots.top_n = topN;
    if (!slots.top_n && (/\bwhich student\b/.test(normalized) || /\bwho\b.*\bearned?\b.*\bmost\b/.test(normalized))) {
      slots.top_n = 1;
    }
  }
  if (routedIntent === "what_if_rate_change") {
    const perHour = normalized.match(/\b(\$?\d+(?:\.\d+)?)\s*(?:\/\s*hour|per\s*hour|an?\s*hour|hour)\b/);
    const by = normalized.match(/\bby\s+\$?\s*(\d+(?:\.\d+)?)\b/);
    const val = perHour ? Number(perHour[1].replace("$", "")) : by ? Number(by[1]) : null;
    if (val != null && Number.isFinite(val)) slots.rate_delta_dollars_per_hour = val;
  }
  if (routedIntent === "what_if_add_students") {
    const m = normalized.match(/\badd\s+(\d+)\s+new\s+students?\b/);
    if (m) slots.new_students = Number(m[1]);
  }
  if (routedIntent === "what_if_take_time_off") {
    const m = normalized.match(/\btake\s+(\d+)\s+weeks?\s+off\b/);
    if (m) slots.weeks_off = Number(m[1]);
  }
  if (routedIntent === "what_if_lose_top_students") {
    const m = normalized.match(/\btop\s+(\d+)\s+students?\b/);
    if (m) slots.top_n = Number(m[1]);
  }
  if (routedIntent === "students_needed_for_target_income") {
    const target = normalized.match(/\breach\s+\$?\s*(\d+(?:,\d{3})*|\d+)\s*k\b/i);
    const target2 = normalized.match(/\breach\s+\$?\s*(\d+(?:,\d{3})*)\b/i);
    const raw = target ? target[1].replace(/,/g, "") : target2 ? target2[1].replace(/,/g, "") : null;
    const val = raw ? Number(raw) : null;
    if (val != null && Number.isFinite(val)) {
      slots.target_income_dollars = target ? val * 1000 : val;
    }
    const rate = normalized.match(/\bat\s+\$?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*hr|\/\s*hour|per\s*hour|hr|hour)\b/i);
    if (rate) slots.rate_dollars_per_hour = Number(rate[1]);
  }

  const plan: QueryPlan = {
    intent,
    normalized_query: normalized,
    time_range,
    student_filter: student_name ? { student_name } : undefined,
    requested_metric:
      routedIntent === "lessons_count_in_period"
        ? "count"
        : routedIntent === "revenue_per_lesson_in_period" || routedIntent === "average_hourly_rate_in_period"
          ? "rate"
          : /%|percent|percentage/.test(normalized)
            ? "percent"
            : /\bwho\b/.test(normalized)
              ? "who"
              : "dollars",
    needs_clarification: needsClarification,
    clarifying_question,
    required_missing_params: missingParams,
    sql_truth_query_key: deriveTruthKey(intent),
    slots: Object.keys(slots).length ? slots : undefined,
  };

  const parsed = queryPlanSchema.safeParse(plan);
  return parsed.success ? parsed.data : plan;
}
