import {
  computeForecast,
  computeTaxEstimate,
  computeCashflowInsights,
  parseQueryParams,
  getTimeframeBounds,
  computeWhatIf,
  computeScenarioWhatIf,
  computeGeneralAnalytics,
  computePercentChange,
} from "./compute";
import type { ForecastRequestBody, ForecastResponse, InsightsStructuredAnswer } from "./types";

export function detectIntent(q: string): ForecastResponse["intent"] {
  const s = q.toLowerCase().trim();
  // What-if / capacity / scenario: students needed, rate change, add/lose students (not "top N by revenue")
  if (
    /\bhow\s+many\s+(?:more\s+)?(?:new\s+)?students?\b|students?\s+needed|needed\s+to\s+reach|estudiantes?\s+necesito|需要.*学生|多少学生/i.test(s) ||
    /\bif\s+i\s+(?:raise|increase|charged?|add|lost?|take|align)|what\s+would\s+.*\s+if|what\s+happens\s+if|si\s+aumento|si\s+pierdo|如果.*涨|如果.*少/i.test(s) ||
    /\bhow\s+many\s+students?\s+at\s+\$|students?\s+at\s+\$\d|what\s+does\s+\$[\d,]+\s+require|requirement.*\$|要赚.*需要/i.test(s) ||
    /\blose\s+my\s+top\s+\d|lose\s+top\s+students?/i.test(s)
  ) {
    if (s.includes("$") || s.includes("hour") || s.includes("hora") || s.includes("小时") || /\d+k?\b|\d{2,}/.test(q) || /\blose\s+my\s+top|lose\s+top\s+\d|lose\s+top\s+students?/i.test(s)) return "what_if";
  }
  // Tax
  if (/\btax|irs|1099|quarterly\s+tax|set\s+aside|impuesto|税|预留|退休/i.test(s)) return "tax_estimate";
  // Cash flow / stability / volatility / average per week
  if (/\bcash\s+flow|cashflow|trend|stable|volatile|volatility|稳定|波动|flujo|recurring\s+%|earn\s+(?:on\s+)?average\s+per\s+week|how\s+much\s+do\s+i\s+earn\s+(?:on\s+)?average/i.test(s)) return "cash_flow";
  // Forecast: earn this month, on track, projected (not "show my earnings summary" — that is general_qa)
  if (/\bhow\s+much\s+will\s+i\s+earn|\bearn\s+this\s+month\b|on\s+track|projected|forecast|project|预计|本月.*赚|今年.*目标|pronóstico/i.test(s)) return "forecast";
  // Percent change: "what % more" or "how much more" with two years; "percent", "percentage", "growth rate"
  if (/%|percent(age)?|growth\s+rate|how\s+much\s+more\s+did\s+i\s+make|同比|环比|增长|多赚了百分之几/i.test(s) || /\d{4}\s+than\s+\d{4}|\d{4}\s+vs\s+\d{4}|\d{4}\s+que\s+\d{4}|2025.*2024|2024.*2025/.test(q)) return "percent_change";
  // General Q&A: earnings summary, best/worst month, who paid most/least, rates, lessons, earnings in month, revenue
  if (
    /\bearnings?\s+summary\b|show\s+my\s+earnings\b/i.test(s) ||
    /\bbest\s+month|worst\s+month|slow\s+months?|mejor\s+mes|peor\s+mes|最好|最差|最慢/i.test(s) ||
    /\bstudent\s+pays\s+most|who\s+pays\s+the\s+most|who\s+paid\s+(?:me\s+)?the\s+most|paid\s+me\s+the\s+most|earned\s+me\s+the\s+most|least|estudiante.*más|哪个学生.*最多|谁.*最多|quién\s+me\s+pagó/i.test(s) ||
    /\baverage\s+hourly|avg\s+hourly|tarifa\s+promedio|平均.*时薪|时薪/i.test(s) ||
    /\blowest\s+rate|highest\s+rate|below\s+(?:my\s+)?average\s+rate|rate\s+increase|谁.*最低|谁.*最高|低于平均/i.test(s) ||
    /\bcash\s+vs\s+venmo|payment\s+method|método\s+de\s+pago|现金|venmo|zelle/i.test(s) ||
    /\blessons?\s+last\s+month|how\s+many\s+lessons|lessons?\s+did\s+i\s+teach|avg\s+lessons|average\s+lessons|lessons\s+per\s+week|revenue\s+per\s+lesson|revenue\s+per\s+student|revenue\s+per\s+hour|多少.*课|平均.*课/i.test(s) ||
    /\bbest\s+day\s+of\s+week|day\s+earns?\s+(?:the\s+)?most|day\s+of\s+the\s+week\s+.*earn\s+(?:the\s+)?most|哪天.*最多/i.test(s) ||
    /\bcompare\s+to\s+last\s+month|this\s+month\s+vs|year[- ]over|同比|环比/i.test(s) ||
    /\brevenue\s+concentration|top\s+\d\s+students?\s+by\s+revenue|top\s+3\s+students?|80%\s+of\s+revenue|percent(age)?\s+from\s+top|集中|占比/i.test(s) ||
    /\bmost\s+profitable\s+hour|churn|diversify\s+payment|concentration\s+risk/i.test(s) ||
    /\b(?:what\s+were\s+my\s+earnings|earnings\s+in)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})/i.test(s) ||
    /\btotal\s+revenue\s+last\s+month|revenue\s+last\s+month|earned\s+me\s+ytd|earn\s+me\s+ytd/i.test(s)
  )
    return "general_qa";
  return "insight";
}

const DEBUG_INSIGHTS =
  typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
function logInsights(msg: string, data?: Record<string, unknown>) {
  if (DEBUG_INSIGHTS && typeof console !== "undefined" && console.log) {
    console.log(`[Insights runForecast] ${msg}`, data ?? "");
  }
}

/** Client-side forecast: computes from earnings (no server). Replace with fetch("/api/forecasts", ...) when backend exists. */
export async function runForecast(body: ForecastRequestBody): Promise<ForecastResponse> {
  const query = (body.query ?? "").trim();
  const earnings = Array.isArray(body.earnings) ? body.earnings : [];
  const parsed = parseQueryParams(query);
  const intent = detectIntent(query);
  logInsights("intent detected", { query: query.slice(0, 60), intent });
  // conversationContext (lastTurns) available for future follow-up refinement

  const fc = computeForecast(earnings);
  const tax = computeTaxEstimate(fc.projectedYearly);
  const cash = computeCashflowInsights(earnings);
  const students = Array.isArray(body.students) ? body.students : [];

  const baseMetrics = {
    projected_monthly: fc.projectedMonthly ?? null,
    projected_yearly: fc.projectedYearly ?? null,
    estimated_tax: tax.estimatedTax ?? null,
    avg_weekly: fc.avgWeekly ?? null,
    trend: fc.trend,
  };

  let answer: { title: string; body: string } | undefined;
  let assumptions: string[] = [];
  let calculations: string[] = [];
  let used_timeframe: ForecastResponse["used_timeframe"];
  let missing_info_needed: string[] | undefined;
  let chartData: ForecastResponse["chartData"];
  let summary: string;
  let details: string;
  let confidence: ForecastResponse["confidence"] = fc.confidence;

  // What-if: scenario (rate change, add/lose students, weeks off) or students needed to reach target
  if (intent === "what_if") {
    const isScenario =
      parsed.weeks_off != null ||
      parsed.new_students_added != null ||
      parsed.rate_increase_dollars != null ||
      parsed.rate_increase_percent != null ||
      parsed.new_rate != null ||
      /\blost?\s+my\s+lowest|lost?\s+lowest|if\s+i\s+lost|si\s+pierdo|失去.*最低/i.test(query) ||
      /\breplace\s+(?:my\s+)?(?:current\s+)?income|replace\s+income|替代.*收入/i.test(query);

    if (isScenario) {
      const scenario = computeScenarioWhatIf(query, earnings, parsed, {
        avgWeekly: fc.avgWeekly ?? null,
        projectedYearly: fc.projectedYearly ?? null,
        students,
      });
      summary = scenario.directAnswer;
      details = scenario.calculations.join("\n");
      assumptions = scenario.assumptions;
      calculations = scenario.calculations;
      confidence = scenario.confidence;
      answer = { title: "What-if", body: scenario.directAnswer + (scenario.assumptions.length ? "\n\nAssumptions: " + scenario.assumptions.join(" ") : "") + "\n\n" + scenario.calculations.join("\n") };
    } else {
      const bounds = getTimeframeBounds(parsed.timeframe ?? "this_year", earnings) ?? getTimeframeBounds("this_year", earnings);
      if (!bounds) {
        summary = "I couldn’t determine the time period. Try “this year” or “this month.”";
        details = "";
        assumptions = [];
        calculations = [];
        missing_info_needed = ["Time period (e.g. this year)"];
      } else {
        used_timeframe = { startDate: bounds.startDate, endDate: bounds.endDate, label: bounds.label };
        if (parsed.target_income == null) missing_info_needed = ["Target income (e.g. $100,000)"];
        if (parsed.hourly_rate == null) missing_info_needed = [...(missing_info_needed ?? []), "Hourly rate (e.g. $70/hour)"];
        const whatIf = computeWhatIf(parsed, earnings, bounds);
        assumptions = whatIf.assumptions;
        calculations = whatIf.calculations;
        confidence = whatIf.confidence;
        summary = whatIf.directAnswer;
        details = whatIf.calculations.join("\n");
        answer = { title: "Answer", body: whatIf.directAnswer + (assumptions.length ? "\n\nAssumptions: " + assumptions.join(" ") : "") + "\n\nSteps: " + calculations.join("\n") };
      }
    }
  }
  // Percent change: answer only what was asked — % or $ depending on wording
  else if (intent === "percent_change") {
    const yearMatch = query.match(/(\d{4})\s+than\s+(\d{4})|(\d{4})\s+vs\s+(\d{4})|(\d{4})\s+and\s+(\d{4})|(\d{4})\s+que\s+(\d{4})/i);
    const currentYear = new Date().getFullYear();
    const laterYear = yearMatch ? parseInt(yearMatch[1] ?? yearMatch[3] ?? yearMatch[5] ?? yearMatch[7] ?? String(currentYear), 10) : currentYear;
    const earlierYear = yearMatch ? parseInt(yearMatch[2] ?? yearMatch[4] ?? yearMatch[6] ?? yearMatch[8] ?? String(currentYear - 1), 10) : currentYear - 1;
    const actualLater = Math.max(laterYear, earlierYear);
    const actualEarlier = Math.min(laterYear, earlierYear);
    const pctResult = computePercentChange(earnings, actualLater, actualEarlier);
    const askedForPercent = /%|percent(age)?|百分之几|por\s+ciento|porcentaje/i.test(query);
    if (askedForPercent) {
      summary = pctResult.answer;
      details = pctResult.dollarDelta ? `Dollar difference: ${pctResult.dollarDelta}.` : "";
      answer = { title: "Percent change", body: summary + (pctResult.dollarDelta ? `\n\n${pctResult.dollarDelta} difference.` : "") };
    } else {
      summary = pctResult.dollarDelta
        ? `You earned ${pctResult.dollarDelta} more in ${actualLater} than ${actualEarlier}.`
        : pctResult.answer;
      details = "";
      answer = { title: "Year-over-year", body: summary };
    }
    assumptions = [];
    calculations = [];
    confidence = "high";
    used_timeframe = { startDate: `${actualEarlier}-01-01`, endDate: `${actualLater}-12-31`, label: `${actualEarlier} vs ${actualLater}` };
  }
  // General Q&A: best month, top student, hourly rate, cash vs Venmo, lessons count, etc.
  else if (intent === "general_qa") {
    const analytics = computeGeneralAnalytics(query, earnings, baseMetrics, students);
    summary = analytics.directAnswer;
    details = analytics.calculations.join("\n");
    assumptions = analytics.assumptions;
    calculations = analytics.calculations;
    confidence = analytics.confidence;
    chartData = analytics.chartData;
    answer = {
      title: "Answer",
      body: analytics.directAnswer + (assumptions.length ? "\n\nAssumptions: " + assumptions.join(" ") : "") + (calculations.length ? "\n\nHow: " + calculations.join("; ") : ""),
    };
  }
  // Forecast intent: "how much will I earn this month?", "on track to hit $X?"
  else if (intent === "forecast") {
    const targetMatch = query.match(/\$?([\d,]+)\s*(k|K)?/);
    const targetDollars = targetMatch
      ? parseFloat(targetMatch[1]!.replace(/,/g, "")) * (targetMatch[2] ? 1000 : 1)
      : null;
    if (targetDollars != null && /\bon\s+track|hit\s+\$|reach\s+\$|目标|达标/i.test(query.toLowerCase())) {
      const yearly = fc.projectedYearly ?? 0;
      const onTrack = yearly >= targetDollars;
      summary = onTrack
        ? `Yes. You're on track — projected yearly is $${yearly.toFixed(0)}, above your $${targetDollars.toFixed(0)} goal.`
        : `Not quite. Projected yearly is $${yearly.toFixed(0)}. You'd need about $${(targetDollars - yearly).toFixed(0)} more to reach $${targetDollars}.`;
      details = fc.avgWeekly != null ? `Based on recent average of $${fc.avgWeekly}/week.` : "";
    } else {
      summary =
        fc.projectedMonthly == null
          ? "Not enough data to forecast yet."
          : `Projected monthly: $${fc.projectedMonthly}. Yearly: $${fc.projectedYearly}.`;
      details =
        fc.avgWeekly != null
          ? `Recent average: $${fc.avgWeekly}/week. Trend: ${fc.trend}.`
          : "Add more earnings to improve the forecast.";
    }
    answer = { title: "Forecast", body: summary + (details ? "\n\n" + details : "") };
  }
  // Tax and cash_flow: answer only what was asked. Unknown (insight): ask for clarification — never default to projected monthly.
  else if (intent === "tax_estimate") {
    summary =
      tax.estimatedTax == null
        ? "Not enough data to estimate taxes yet."
        : `Estimated yearly taxes: $${tax.estimatedTax}`;
    details = "";
    answer = { title: "Answer", body: summary };
  } else if (intent === "cash_flow") {
    const askAvgPerWeek = /\b(?:how\s+much\s+do\s+i\s+)?earn\s+(?:on\s+)?average\s+per\s+week|average\s+per\s+week|earn\s+per\s+week\b/i.test(query);
    summary =
      fc.avgWeekly == null
        ? "No cash flow insights yet."
        : askAvgPerWeek
          ? `You earn on average $${Number(fc.avgWeekly).toFixed(2)} per week.`
          : `Your income trend looks ${fc.trend}.`;
    details = "";
    answer = { title: "Answer", body: summary };
  } else {
    // Unknown / insight: do NOT return projected monthly. Ask for clarification.
    summary =
      "I'm not sure what you're asking. Try: \"How much did I make in 2025 vs 2024?\", \"Who paid me the most last month?\", or \"How much will I earn this month?\"";
    details = "";
    missing_info_needed = ["What would you like to know? (e.g. earnings comparison, top student, forecast)"];
    answer = { title: "Clarify", body: summary };
  }

  // Build strict structured output for Insights UI: answer only + optional supporting (max 2 bullets).
  const structuredAnswer: InsightsStructuredAnswer = {
    answer: summary,
    type:
      intent === "percent_change"
        ? "percent_change"
        : intent === "what_if"
          ? "what_if"
          : intent === "forecast"
            ? "forecast"
            : intent === "general_qa"
              ? "other"
              : "other",
    supporting: assumptions.length > 0 ? assumptions.slice(0, 2) : [],
    needs_clarification: (missing_info_needed?.length ?? 0) > 0,
    clarifying_question: missing_info_needed?.[0] ?? null,
  };

  logInsights("handler completed", { intent, hasClarification: (missing_info_needed?.length ?? 0) > 0 });
  const res: ForecastResponse = {
    intent,
    summary,
    details,
    metrics: baseMetrics,
    confidence,
    answer,
    assumptions,
    calculations,
    used_timeframe,
    missing_info_needed,
    chartData,
    structuredAnswer,
    cards: {
      general: answer,
      forecast: {
        title: "Earnings forecast",
        body: fc.projectedMonthly == null ? "Add more earnings entries to generate a forecast." : `Projected monthly: $${fc.projectedMonthly}. Yearly: $${fc.projectedYearly}. Avg weekly: $${fc.avgWeekly}.`,
      },
      tax: {
        title: "Tax estimation",
        body: tax.estimatedTax == null ? "Not enough data to estimate taxes yet." : `Estimated yearly taxes: $${tax.estimatedTax}. Set-aside: ~$${tax.monthlySetAside}/month.`,
      },
      cashflow: {
        title: "Cash flow insights",
        body: cash.bestWeek == null ? "No cash flow insights yet." : `Trend: ${fc.trend}. Best week: $${cash.bestWeek.total}. Lowest: $${cash.worstWeek?.total ?? "n/a"}.`,
      },
    },
  };

  return res;
}
