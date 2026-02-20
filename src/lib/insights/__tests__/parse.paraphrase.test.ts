import { describe, expect, it } from "vitest";
import { parseToQueryPlan } from "@/lib/insights/parse";
import { getCanonicalInsightsQuestions } from "@/features/insights/canonicalQuestions";

describe("insights canonical question coverage", () => {
  it("enumerates dropdown prompts programmatically", () => {
    const canonical = getCanonicalInsightsQuestions();
    expect(canonical.length).toBeGreaterThan(20);
    expect(canonical.some((q) => q.question === "How many lessons did I teach last month?")).toBe(true);
    expect(canonical.some((q) => q.question === "Top 3 students by revenue?")).toBe(true);
  });
});

describe("parseToQueryPlan paraphrase robustness", () => {
  const cases: Array<{
    expectedIntent: string;
    phrases: string[];
    expectedTopN?: number;
  }> = [
    {
      expectedIntent: "cash_flow_trend",
      phrases: [
        "What's my cash flow trend?",
        "Show my earnings trend",
        "How is my revenue trending lately?",
      ],
    },
    {
      expectedIntent: "income_stability",
      phrases: [
        "Is my income stable or volatile?",
        "How volatile are my earnings?",
        "Is my cash flow stable?",
      ],
    },
    {
      expectedIntent: "avg_weekly_revenue",
      phrases: [
        "How much do I earn on average per week?",
        "What's my average weekly revenue?",
        "Average income per week",
      ],
    },
    {
      expectedIntent: "revenue_per_student_in_period",
      phrases: [
        "Which student did I earn the most from in 2025?",
        "Who earned me the most in 2025?",
      ],
      expectedTopN: 1,
    },
    {
      expectedIntent: "revenue_per_student_in_period",
      phrases: [
        "Top 3 students by revenue?",
        "top three students by earnings in january 2026",
        "3 highest students by income",
      ],
      expectedTopN: 3,
    },
  ];

  for (const tc of cases) {
    for (const phrase of tc.phrases) {
      it(`routes "${phrase}"`, () => {
        const plan = parseToQueryPlan(phrase);
        expect(plan.intent).toBe(tc.expectedIntent);
        expect(plan.needs_clarification).toBe(false);
        if (tc.expectedTopN != null) {
          expect(plan.slots?.top_n).toBe(tc.expectedTopN);
        }
      });
    }
  }

  it("resolves key period semantics", () => {
    const lastMonth = parseToQueryPlan("How many lessons did I teach last month?");
    expect(lastMonth.time_range?.type).toBe("month");

    const last30 = parseToQueryPlan("How much did I earn in the last 30 days?");
    expect(last30.time_range?.label).toBe("last_30_days");

    const jan2026 = parseToQueryPlan("Top 3 students by revenue in January 2026");
    expect(jan2026.time_range?.label).toBe("2026-01");

    const y2025 = parseToQueryPlan("Which student did I earn the most from in 2025?");
    expect(y2025.time_range?.start).toBe("2025-01-01");
    expect(y2025.time_range?.end).toBe("2025-12-31");
  });
});
