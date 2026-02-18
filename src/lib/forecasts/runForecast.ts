import { computeForecast, computeTaxEstimate, computeCashflowInsights } from "./compute";
import type { ForecastRequestBody, ForecastResponse } from "./types";

function detectIntent(q: string): ForecastResponse["intent"] {
  const s = q.toLowerCase();
  if (s.includes("tax") || s.includes("irs") || s.includes("1099") || s.includes("impuesto") || s.includes("税")) return "tax_estimate";
  if (s.includes("cash flow") || s.includes("cashflow") || s.includes("trend") || s.includes("稳定") || s.includes("flujo")) return "cash_flow";
  if (s.includes("forecast") || s.includes("project") || s.includes("预计") || s.includes("pronóstico")) return "forecast";
  return "insight";
}

/** Client-side forecast: computes from earnings (no server). Replace with fetch("/api/forecasts", ...) when backend exists. */
export async function runForecast(body: ForecastRequestBody): Promise<ForecastResponse> {
  const query = (body.query ?? "").trim();
  const earnings = Array.isArray(body.earnings) ? body.earnings : [];
  const intent = detectIntent(query);

  const fc = computeForecast(earnings);
  const tax = computeTaxEstimate(fc.projectedYearly);
  const cash = computeCashflowInsights(earnings);

  const summary =
    intent === "tax_estimate"
      ? tax.estimatedTax == null
        ? "Not enough data to estimate taxes yet."
        : `Estimated yearly taxes: $${tax.estimatedTax}`
      : intent === "cash_flow"
        ? fc.avgWeekly == null
          ? "No cash flow insights yet."
          : `Your income trend looks ${fc.trend}.`
        : fc.projectedMonthly == null
          ? "Not enough data to forecast yet."
          : `Projected monthly earnings: $${fc.projectedMonthly}`;

  const detailsParts: string[] = [];
  if (fc.avgWeekly != null) {
    detailsParts.push(`Recent average: $${fc.avgWeekly}/week. Trend: ${fc.trend}.`);
  } else {
    detailsParts.push("Add a few earnings entries to enable forecasting.");
  }
  if (tax.estimatedTax != null && tax.monthlySetAside != null) {
    detailsParts.push(`Tax set-aside suggestion: ~$${tax.monthlySetAside}/month (heuristic estimate).`);
  }
  if (cash.bestWeek && cash.worstWeek) {
    detailsParts.push(
      `Best week: $${cash.bestWeek.total} (${cash.bestWeek.start}–${cash.bestWeek.end}). Lowest week: $${cash.worstWeek.total} (${cash.worstWeek.start}–${cash.worstWeek.end}).`
    );
    if (cash.volatility != null) detailsParts.push(`Income volatility score: ${cash.volatility} (lower is steadier).`);
  }

  const res: ForecastResponse = {
    intent,
    summary,
    details: detailsParts.join(" "),
    metrics: {
      projected_monthly: fc.projectedMonthly ?? null,
      projected_yearly: fc.projectedYearly ?? null,
      estimated_tax: tax.estimatedTax ?? null,
      avg_weekly: fc.avgWeekly ?? null,
      trend: fc.trend,
    },
    confidence: fc.confidence,
    cards: {
      forecast: {
        title: "Earnings forecast",
        body:
          fc.projectedMonthly == null
            ? "Add more earnings entries to generate a forecast."
            : `Projected monthly: $${fc.projectedMonthly}. Projected yearly: $${fc.projectedYearly}. Avg weekly: $${fc.avgWeekly}.`,
      },
      tax: {
        title: "Tax estimation",
        body:
          tax.estimatedTax == null
            ? "Not enough data to estimate taxes yet."
            : `Estimated yearly taxes: $${tax.estimatedTax}. Suggested set-aside: ~$${tax.monthlySetAside}/month.`,
      },
      cashflow: {
        title: "Cash flow insights",
        body:
          cash.bestWeek == null
            ? "No cash flow insights yet."
            : `Trend: ${fc.trend}. Best week: $${cash.bestWeek.total}. Lowest week: $${cash.worstWeek?.total ?? "n/a"}. Volatility: ${cash.volatility ?? "n/a"}.`,
      },
    },
  };

  return res;
}
