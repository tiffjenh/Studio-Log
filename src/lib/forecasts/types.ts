export type SupportedLocale = "en-US" | "es-ES" | "zh-CN" | "zh-TW";

export type EarningsRow = {
  date: string;
  amount: number;
  method?: "venmo" | "zelle" | "cash" | "check" | "card" | "other";
  customer?: string;
};

export type ForecastIntent = "forecast" | "tax_estimate" | "cash_flow" | "insight" | "question_answer";

export type ForecastResponse = {
  intent: ForecastIntent;
  summary: string;
  details: string;
  metrics: {
    projected_monthly: number | null;
    projected_yearly: number | null;
    estimated_tax: number | null;
    avg_weekly: number | null;
    trend: "up" | "down" | "stable" | "unknown";
  };
  confidence: "high" | "medium" | "low";
  cards?: {
    forecast?: { title: string; body: string };
    tax?: { title: string; body: string };
    cashflow?: { title: string; body: string };
  };
};

export type ForecastRequestBody = {
  query: string;
  timezone?: string;
  locale?: SupportedLocale;
  rangeContext?: {
    mode: "daily" | "weekly" | "monthly" | "yearly" | "students" | "forecasts";
    startDate?: string;
    endDate?: string;
  };
  earnings: EarningsRow[];
};
