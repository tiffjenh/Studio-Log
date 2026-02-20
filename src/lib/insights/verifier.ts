import type { ComputedResult, QueryPlan } from "./schema";

export type VerifierResult = {
  passed: boolean;
  errors: string[];
  confidence: "high" | "medium" | "low";
};

export function runInsightsVerifier(
  plan: QueryPlan,
  computed: ComputedResult | null
): VerifierResult {
  const errors: string[] = [];
  if (!computed) return { passed: false, errors: ["No computed result."], confidence: "low" };

  const out = computed.outputs as Record<string, unknown>;
  if (out.error) errors.push(String(out.error));
  if (plan.needs_clarification && computed.intent !== "clarification") {
    errors.push("Clarification plan did not return clarification result.");
  }
  if (!plan.needs_clarification && computed.confidence === "low") {
    errors.push("Low confidence computation.");
  }
  if (typeof out.total_dollars === "number" && out.total_dollars < 0) {
    errors.push("Negative total dollars.");
  }
  if (typeof out.hourly_dollars === "number" && out.hourly_dollars > 1000) {
    errors.push("Hourly rate out of expected range.");
  }

  const confidence = errors.length > 0 ? "low" : computed.confidence;
  return { passed: errors.length === 0, errors, confidence };
}
