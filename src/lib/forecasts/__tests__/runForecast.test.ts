/**
 * Unit tests for Insights intent detection and routing.
 * Ensures questions do NOT default to "Projected monthly earnings" unless forecast intent.
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { detectIntent, runForecast } from "../runForecast";

describe("detectIntent", () => {
  it("returns percent_change for YOY percent question", () => {
    expect(detectIntent("What % more did I make in 2025 than 2024?")).toBe("percent_change");
    expect(detectIntent("2025年比2024年多赚了百分之几")).toBe("percent_change");
  });

  it("returns percent_change for YOY dollar question (how much more)", () => {
    expect(detectIntent("How much more did I make in 2025 than 2024?")).toBe("percent_change");
    expect(detectIntent("how much more did i make in 2025 than 2024")).toBe("percent_change");
  });

  it("returns general_qa for who paid most", () => {
    expect(detectIntent("Who paid me the most last month?")).toBe("general_qa");
    expect(detectIntent("who paid me the most")).toBe("general_qa");
  });

  it("returns general_qa for lesson count", () => {
    expect(detectIntent("How many lessons did I teach this month?")).toBe("general_qa");
    expect(detectIntent("How many lessons did I teach last month?")).toBe("general_qa");
  });

  it("returns what_if for lose top students", () => {
    expect(detectIntent("What if I lose my top 2 students?")).toBe("what_if");
    expect(detectIntent("If I lose my top 2 students, what's my monthly revenue change?")).toBe("what_if");
  });

  it("returns general_qa for earnings summary (summary), forecast for projected/on track", () => {
    expect(detectIntent("Show my earnings summary")).toBe("general_qa");
    expect(detectIntent("How much will I earn this month?")).toBe("forecast");
    expect(detectIntent("Am I on track for $80k this year?")).toBe("forecast");
  });

  it("returns tax_estimate for tax questions", () => {
    expect(detectIntent("How much should I set aside for taxes?")).toBe("tax_estimate");
  });

  it("returns insight (unknown) for ambiguous question", () => {
    expect(detectIntent("tell me something random about my studio")).toBe("insight");
  });

  it("routes previously failing questions to correct intent", () => {
    expect(detectIntent("Show my earnings summary")).toBe("general_qa");
    expect(detectIntent("Who is below my average rate?")).toBe("general_qa");
    expect(detectIntent("Top 3 students by revenue?")).toBe("general_qa");
    expect(detectIntent("How much do I earn on average per week?")).toBe("cash_flow");
    expect(detectIntent("What day of the week do I earn the most?")).toBe("general_qa");
    expect(detectIntent("Average lessons per week")).toBe("general_qa");
  });
});

describe("runForecast routing", () => {
  const emptyBody = {
    query: "",
    earnings: [{ date: "2025-01-15", amount: 1000, customer: "Alice" }],
    students: [],
    locale: "en-US" as const,
    timezone: "America/Los_Angeles",
  };

  it("does NOT return 'Projected monthly earnings' for percent_change question", async () => {
    const res = await runForecast({ ...emptyBody, query: "How much more did I make in 2025 than 2024?" });
    expect(res.intent).toBe("percent_change");
    expect(res.summary).not.toContain("Projected monthly earnings");
  });

  it("does NOT return 'Projected monthly earnings' for general_qa question", async () => {
    const res = await runForecast({ ...emptyBody, query: "Who paid me the most last month?" });
    expect(res.intent).toBe("general_qa");
    expect(res.summary).not.toContain("Projected monthly earnings");
  });

  it("does NOT return 'Projected monthly earnings' for unknown (insight) question", async () => {
    const res = await runForecast({ ...emptyBody, query: "tell me something random" });
    expect(res.intent).toBe("insight");
    expect(res.summary).not.toContain("Projected monthly earnings");
    expect(res.structuredAnswer?.needs_clarification).toBe(true);
  });

  it("returns projected monthly ONLY for forecast intent", async () => {
    const res = await runForecast({ ...emptyBody, query: "How much will I earn this month?" });
    expect(res.intent).toBe("forecast");
    expect(res.summary).toMatch(/Projected monthly|Not enough data/);
  });
});
