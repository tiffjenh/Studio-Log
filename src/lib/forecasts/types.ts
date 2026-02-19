export type SupportedLocale = "en-US" | "es-ES" | "zh-CN" | "zh-TW";

export type EarningsRow = {
  date: string;
  amount: number;
  method?: "venmo" | "zelle" | "cash" | "check" | "card" | "other";
  customer?: string;
  studentId?: string;
  /** Duration in minutes for this entry (lesson length); used for hourly rate when present. */
  durationMinutes?: number;
};

export type ForecastIntent = "forecast" | "tax_estimate" | "cash_flow" | "insight" | "question_answer" | "what_if" | "general_qa" | "percent_change";

/** Strict output for Insights: answer only what was asked, optional supporting bullets. */
export type InsightsStructuredAnswer = {
  answer: string;
  type: "percent_change" | "dollar_change" | "forecast" | "ranking" | "what_if" | "other";
  supporting: string[];
  needs_clarification: boolean;
  clarifying_question: string | null;
};

/** Parsed from user query for what-if and general Q&A. */
export type ParsedQuery = {
  target_income?: number;
  hourly_rate?: number;
  timeframe?: "this_year" | "this_month" | "last_month" | "last_year" | "all";
  new_students_needed?: number;
  new_students_added?: number;
  avg_hours_per_student_per_week?: number;
  /** Rate increase: dollars per hour (e.g. 10 for "$10/hour") or percent (e.g. 5 for "5%"). */
  rate_increase_dollars?: number;
  rate_increase_percent?: number;
  /** New hypothetical rate (e.g. 70 for "$70/hour instead of $60"). */
  new_rate?: number;
  weeks_off?: number;
  /** Label for display (e.g. "2025", "January 2025"). */
  timeframe_label?: string;
};

export type UsedTimeframe = {
  startDate: string;
  endDate: string;
  label: string;
};

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
  /** Short direct answer (title + body). Shown as the main Answer card. */
  answer?: { title: string; body: string };
  assumptions: string[];
  calculations: string[];
  used_timeframe?: UsedTimeframe;
  /** When set, UI should prompt user for this missing info. */
  missing_info_needed?: string[];
  /** Optional chart data for simple bar/list display (e.g. best months, payment methods). */
  chartData?: { label: string; value: number }[];
  /** Strict format for Insights UI: render only answer + supporting. */
  structuredAnswer?: InsightsStructuredAnswer;
  cards?: {
    general?: { title: string; body: string };
    forecast?: { title: string; body: string };
    tax?: { title: string; body: string };
    cashflow?: { title: string; body: string };
  };
};

/** Optional student summary for pricing/rate and student-level insights. */
export type StudentSummary = {
  id: string;
  name: string;
  rateCents: number;
  durationMinutes: number;
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
  /** When provided, enables pricing/rate and student-level answers (lowest rate, below average, etc.). */
  students?: StudentSummary[];
  /** Optional conversation history for multi-turn follow-ups (Insights). */
  conversationContext?: {
    lastTurns: { role: string; content: string }[];
    lastComputedMetrics?: Record<string, unknown>;
  };
};
