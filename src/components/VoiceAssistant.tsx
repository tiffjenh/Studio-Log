/**
 * VoiceAssistant — confirmation card UI when voice command is ambiguous or low confidence.
 * Renders "I heard: ..." summary with Confirm / Cancel buttons.
 */

import type { ResolvedVoiceCommand } from "@/lib/voice/types";
import { Button } from "@/components/ui/Button";

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
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onConfirm}
          disabled={isLoading}
          loading={isLoading}
        >
          Confirm
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function getSummaryFromResolved(resolved: ResolvedVoiceCommand): string {
  return resolved.summary;
}
