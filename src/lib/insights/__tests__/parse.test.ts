import { describe, expect, it } from "vitest";
import { parseToQueryPlan } from "@/lib/insights/parse";

describe("parseToQueryPlan dropdown routing", () => {
  it("routes lessons count dropdown query deterministically", () => {
    const plan = parseToQueryPlan("How many lessons did I teach last month?");
    expect(plan.intent).toBe("lessons_count_in_period");
    expect(plan.needs_clarification).toBe(false);
    expect(plan.sql_truth_query_key).toBe("lessons_count_in_period");
    expect({ intent: plan.intent, time_range_type: plan.time_range?.type }).toMatchInlineSnapshot(`
      {
        "intent": "lessons_count_in_period",
        "time_range_type": "month",
      }
    `);
  });

  it("routes revenue per lesson dropdown query deterministically", () => {
    const plan = parseToQueryPlan("What's my revenue per lesson?");
    expect(plan.intent).toBe("revenue_per_lesson_in_period");
    expect(plan.needs_clarification).toBe(false);
    expect(plan.sql_truth_query_key).toBe("revenue_per_lesson_in_period");
    expect({ intent: plan.intent, time_range_type: plan.time_range?.type }).toMatchInlineSnapshot(`
      {
        "intent": "revenue_per_lesson_in_period",
        "time_range_type": "rolling_days",
      }
    `);
  });

  it("routes best day of week dropdown query deterministically", () => {
    const plan = parseToQueryPlan("What day of the week do I earn the most?");
    expect(plan.intent).toBe("day_of_week_earnings_max");
    expect(plan.needs_clarification).toBe(false);
    expect(plan.sql_truth_query_key).toBe("day_of_week_earnings_max");
    expect({ intent: plan.intent, time_range_type: plan.time_range?.type }).toMatchInlineSnapshot(`
      {
        "intent": "day_of_week_earnings_max",
        "time_range_type": "ytd",
      }
    `);
  });

  it("routes revenue per student breakdown dropdown query deterministically", () => {
    const plan = parseToQueryPlan("Revenue per student breakdown");
    expect(plan.intent).toBe("revenue_per_student_in_period");
    expect(plan.needs_clarification).toBe(false);
    expect(plan.sql_truth_query_key).toBe("revenue_per_student_in_period");
    expect({ intent: plan.intent, time_range_type: plan.time_range?.type }).toMatchInlineSnapshot(`
      {
        "intent": "revenue_per_student_in_period",
        "time_range_type": "rolling_days",
      }
    `);
  });
});

