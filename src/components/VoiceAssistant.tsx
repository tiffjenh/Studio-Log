/**
 * VoiceAssistant — confirmation card UI when voice command is ambiguous or low confidence.
 * Renders "I heard: ..." summary with Confirm / Cancel buttons.
 */

import type { ResolvedVoiceCommand } from "@/lib/voice/types";

export interface VoiceConfirmationCardProps {
  summary: string;
  transcript?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function VoiceConfirmationCard({
  summary,
  transcript,
  onConfirm,
  onCancel,
  isLoading = false,
}: VoiceConfirmationCardProps) {
  return (
    <div
      style={{
        padding: "12px 0",
        borderTop: "1px solid var(--border, #eee)",
        marginTop: 12,
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--text-muted)", fontStyle: "italic" }}>
        {transcript ? `"${transcript}"` : null}
      </p>
      <p style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
        I heard: {summary}
      </p>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
        Confirm to apply this change.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className="btn btn-primary pill"
          style={{ padding: "10px 18px", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-sans)" }}
        >
          {isLoading ? "Applying…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="pill"
          style={{
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "var(--font-sans)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function getSummaryFromResolved(resolved: ResolvedVoiceCommand): string {
  return resolved.summary;
}
