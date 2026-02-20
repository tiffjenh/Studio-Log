/**
 * Unit tests for Insights interpreter (intent + entities).
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { interpretInsightsQuestion } from "../intent";

describe("interpretInsightsQuestion", () => {
  it("returns YOY_COMPARISON and percent metric for % question", () => {
    const r = interpretInsightsQuestion("What % more did I make in 2025 than 2024?");
    expect(r.intent).toBe("percent_change");
    expect(r.schemaIntent).toBe("YOY_COMPARISON");
    expect(r.entities.metric).toBe("percent");
    expect(r.entities.year).toBe(2025);
    expect(r.entities.year2).toBe(2024);
    expect(r.confidence).toBe(0.9);
  });

  it("returns YOY_COMPARISON and dollars metric for 'how much more' question", () => {
    const r = interpretInsightsQuestion("How much more did I make in 2025 than 2024?");
    expect(r.intent).toBe("percent_change");
    expect(r.entities.metric).toBe("dollars");
    expect(r.confidence).toBe(0.9);
  });

  it("returns UNKNOWN and low confidence for ambiguous question", () => {
    const r = interpretInsightsQuestion("tell me something random about my studio");
    expect(r.intent).toBe("insight");
    expect(r.schemaIntent).toBe("UNKNOWN");
    expect(r.confidence).toBe(0.5);
  });

  it("returns WHAT_IF_LOSE_STUDENTS for lose top students", () => {
    const r = interpretInsightsQuestion("What if I lose my top 2 students?");
    expect(r.intent).toBe("what_if");
    expect(r.schemaIntent).toBe("WHAT_IF_LOSE_STUDENTS");
    expect(r.confidence).toBe(0.9);
  });
});
