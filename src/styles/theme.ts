/**
 * Central button (and UI) design tokens.
 * Single source of truth for radius, spacing, typography, and semantic colors.
 * Used by Button and IconButton; keep in sync with index.css where vars are referenced.
 */

export const buttonTokens = {
  /** Pill shape for all buttons unless overridden */
  buttonRadius: 999,
  buttonRadiusSm: 14,

  border: {
    defaultColor: "rgba(0,0,0,0.08)",
    defaultWidth: 1,
  },

  shadow: {
    /** Matches existing floating card feel */
    subtle: "0 2px 16px rgba(140, 120, 150, 0.06)",
    soft: "0 2px 16px rgba(140, 120, 150, 0.06)",
    card: "0 4px 24px rgba(140, 120, 150, 0.06)",
  },

  typography: {
    fontFamily: "var(--font-sans)",
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },

  /** Button heights (min-height) */
  height: {
    sm: 40,
    md: 48,
    lg: 56,
  },

  /** Horizontal padding (left/right) */
  paddingX: {
    sm: 16,
    md: 20,
    lg: 24,
  },

  icon: {
    /** Size for shared SVG icons */
    size: 20,
    /** Icon-only button minimum touch target */
    onlyMinSize: 44,
    arrowStrokeWidth: 1.5,
    arrowColor: "var(--text-muted)",
  },

  /** Semantic colors */
  colors: {
    textPrimary: "#2B1F24",
    textMuted: "var(--text-muted)",
    surfaceWhite: "#FFFFFF",
    surfaceTint: "rgba(255,255,255,0.9)",
    /** Reuse app gradient (pink → lavender) */
    gradientPrimary: "var(--avatar-gradient)",
    dangerRed: "#D64545",
    dangerBg: "rgba(214,69,69,0.10)",
  },
} as const;

export type ButtonSize = "sm" | "md" | "lg";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "tab";
