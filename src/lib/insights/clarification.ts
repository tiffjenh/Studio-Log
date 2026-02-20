export type PendingInsightsClarification = {
  originalQuestion: string;
  requiredMissingParams: string[];
};

/**
 * Deterministically resumes a prior question after a 1-turn clarification.
 * This avoids losing the original intent (the biggest source of "generic totals" after clarification).
 */
export function resolveInsightsClarification(
  pending: PendingInsightsClarification,
  replyRaw: string
): string {
  const reply = replyRaw.trim();
  const missing = new Set(pending.requiredMissingParams);

  if (missing.has("student")) return `${pending.originalQuestion} for student ${reply}`;
  if (missing.has("year")) return `${pending.originalQuestion} in ${reply}`;
  if (missing.has("rate_delta")) return `${pending.originalQuestion} by ${reply}`;
  if (missing.has("intent")) return `${pending.originalQuestion} ${reply}`;
  return `${pending.originalQuestion} ${reply}`;
}

