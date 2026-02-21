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

describe("parseToQueryPlan deterministic routing harness", () => {
  it("normalizes children synonym and resolves April 2024 unique student count", () => {
    const plan = parseToQueryPlan("How many children did I teach in April 2024?");
    expect(plan.normalized_query).toContain("students");
    expect(plan.intent).toBe("unique_student_count_in_period");
    expect(plan.sql_truth_query_key).toBe("UNIQUE_STUDENT_COUNT");
    expect(plan.time_range?.start).toBe("2024-04-01");
    expect(plan.time_range?.end).toBe("2024-04-30");
    expect(plan.needs_clarification).toBe(false);
  });

  it("routes attendance-missed ranking deterministically", () => {
    const plan = parseToQueryPlan("Which student missed the most lessons in 2025?");
    expect(plan.intent).toBe("student_missed_most_lessons_in_year");
    expect(plan.sql_truth_query_key).toBe("ATTENDANCE_RANK_MISSED");
    expect(plan.time_range?.start).toBe("2025-01-01");
    expect(plan.time_range?.end).toBe("2025-12-31");
    expect(plan.needs_clarification).toBe(false);
  });

  it("routes earnings-min ranking deterministically", () => {
    const plan = parseToQueryPlan("Which student did I earn the least from in 2025?");
    expect(plan.intent).toBe("revenue_per_student_in_period");
    expect(plan.sql_truth_query_key).toBe("EARNINGS_RANK_MIN");
    expect(plan.slots?.rank_order).toBe("asc");
    expect(plan.needs_clarification).toBe(false);
  });

  it("defaults missing timeframe to current year for rank questions", () => {
    const currentYear = new Date().getFullYear();
    const plan = parseToQueryPlan("Who pays the most?");
    expect(plan.intent).toBe("revenue_per_student_in_period");
    expect(plan.sql_truth_query_key).toBe("EARNINGS_RANK_MAX");
    expect(plan.time_range?.start).toBe(`${currentYear}-01-01`);
    expect(plan.time_range?.end).toBe(`${currentYear}-12-31`);
    expect(plan.needs_clarification).toBe(false);
  });
});

