/** Categories and suggested questions for the Insights page. */

export type InsightsCategoryId =
  | "revenueForecasting"
  | "pricingRateOptimization"
  | "studentLevelInsights"
  | "cashFlowStability"
  | "operationalMetrics"
  | "taxFinancialPlanning"
  | "whatIfModeling";

export const INSIGHTS_CATEGORIES: Array<{
  id: InsightsCategoryId;
  /** i18n key for the label. */
  labelKey: `insights.categories.${InsightsCategoryId}`;
  /** Seed questions (kept in English; engine supports ES/ZH typed questions too). */
  questions: string[];
}> = [
  {
    id: "revenueForecasting",
    labelKey: "insights.categories.revenueForecasting",
    questions: [
      "Am I on track for $80k this year?",
      "What was my total revenue last month?",
      "What is my projected earnings this year?",
      "How much will I earn this month?",
      "Show my earnings summary",
    ],
  },
  {
    id: "pricingRateOptimization",
    labelKey: "insights.categories.pricingRateOptimization",
    questions: [
      "Who pays the most per hour?",
      "What is my average hourly rate?",
      "Who is below my average rate?",
      "If I raise rates by $10/hour, what happens to my income?",
    ],
  },
  {
    id: "studentLevelInsights",
    labelKey: "insights.categories.studentLevelInsights",
    questions: [
      "Who pays the most?",
      "Which student earned me the most?",
      "Who pays the least?",
      "Revenue per student breakdown",
      "Top 3 students by revenue?",
    ],
  },
  {
    id: "cashFlowStability",
    labelKey: "insights.categories.cashFlowStability",
    questions: [
      "Is my income stable or volatile?",
      "What's my cash flow trend?",
      "How much do I earn on average per week?",
    ],
  },
  {
    id: "operationalMetrics",
    labelKey: "insights.categories.operationalMetrics",
    questions: [
      "How many lessons did I teach last month?",
      "What's my revenue per lesson?",
      "What day of the week do I earn the most?",
      "Average lessons per week",
    ],
  },
  {
    id: "taxFinancialPlanning",
    labelKey: "insights.categories.taxFinancialPlanning",
    questions: [
      "How much should I set aside for taxes?",
      "Estimated tax on my income this year?",
      "What do I need to set aside for quarterly taxes?",
    ],
  },
  {
    id: "whatIfModeling",
    labelKey: "insights.categories.whatIfModeling",
    questions: [
      "If I add 3 new students, what's my new income?",
      "If I take 2 weeks off, how does that affect my yearly earnings?",
      "What if I lose my top 2 students?",
      "How many students do I need to reach $100k at $70/hr?",
    ],
  },
] as const;

/** Suggestion chips: click populates input and runs query (3–5 items). */
export const SUGGESTION_CHIPS = [
  "Am I on track for $80k this year?",
  "Who pays the most per hour?",
  "What was my best month?",
  "How much should I set aside for taxes?",
  "Revenue per student breakdown",
] as const;
