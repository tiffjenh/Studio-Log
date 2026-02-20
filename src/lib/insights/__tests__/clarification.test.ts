import { describe, expect, it } from "vitest";
import { resolveInsightsClarification } from "@/lib/insights/clarification";

describe("resolveInsightsClarification", () => {
  it("resumes missing student follow-ups", () => {
    const q = resolveInsightsClarification(
      { originalQuestion: "Attendance summary", requiredMissingParams: ["student"] },
      "Leo Chen"
    );
    expect(q).toBe("Attendance summary for student Leo Chen");
  });

  it("resumes missing intent follow-ups", () => {
    const q = resolveInsightsClarification(
      { originalQuestion: "Show me my trend", requiredMissingParams: ["intent"] },
      "earnings"
    );
    expect(q).toBe("Show me my trend earnings");
  });

  it("resumes missing rate delta follow-ups", () => {
    const q = resolveInsightsClarification(
      { originalQuestion: "If I raise rates, what happens?", requiredMissingParams: ["rate_delta"] },
      "$10/hour"
    );
    expect(q).toBe("If I raise rates, what happens? by $10/hour");
  });
});

