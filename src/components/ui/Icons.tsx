/**
 * Shared SVG icons for buttons and UI. Use consistent size (matches theme icon size).
 */
import { buttonTokens } from "@/styles/theme";

const defaultSize = buttonTokens.icon.size;
const arrowColor = buttonTokens.icon.arrowColor;
const arrowStroke = buttonTokens.icon.arrowStrokeWidth;

/** Light stroke matches other button icons (chevrons, calendar) for consistent visual weight. */
const iconStrokeWidth = buttonTokens.icon.arrowStrokeWidth;

export function DownloadIcon({
  size = defaultSize,
  strokeWidth = iconStrokeWidth,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = defaultSize }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={arrowStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block", flexShrink: 0, color: arrowColor }}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ size = defaultSize }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={arrowStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block", flexShrink: 0, color: arrowColor }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function CalendarIcon({ size = defaultSize }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block", flexShrink: 0, color: "var(--text-muted)" }}
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}
