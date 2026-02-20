/**
 * Single shared Button component. All buttons in the app use this for consistent
 * radius, typography, border, shadow, and semantic variants (primary, secondary, ghost, danger, tab).
 */
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { buttonTokens, type ButtonSize, type ButtonVariant } from "@/styles/theme";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icons";

const T = buttonTokens;

function normalizeLegacyArrowIcon(node: ReactNode): ReactNode {
  if (typeof node !== "string") return node;
  const trimmed = node.trim();
  if (trimmed === "‹" || trimmed === "❮") return <ChevronLeftIcon />;
  if (trimmed === "›" || trimmed === "❯") return <ChevronRightIcon />;
  return node;
}

export type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  iconOnly?: boolean;
  type?: "button" | "submit";
  to?: string;
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  title?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type">;

function getVariantStyles(
  variant: ButtonVariant,
  active: boolean,
  disabled: boolean
): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: T.typography.fontFamily,
    fontWeight: T.typography.fontWeight,
    letterSpacing: T.typography.letterSpacing,
    border: "none",
    cursor: disabled ? "default" : "pointer",
    borderRadius: T.buttonRadius,
    transition: "background 0.2s, box-shadow 0.2s, opacity 0.2s",
    opacity: disabled ? 0.65 : 1,
    boxShadow: disabled ? "none" : T.shadow.subtle,
  };

  switch (variant) {
    case "primary":
      return {
        ...base,
        background: T.colors.gradientPrimary,
        color: "#ffffff",
        border: `1px solid rgba(255,255,255,0.2)`,
      };
    case "secondary":
      return {
        ...base,
        background: T.colors.surfaceWhite,
        color: T.colors.textPrimary,
        border: `${T.border.defaultWidth}px solid var(--border, ${T.border.defaultColor})`,
      };
    case "ghost":
      return {
        ...base,
        background: "transparent",
        color: T.colors.textPrimary,
        boxShadow: "none",
      };
    case "danger":
      return {
        ...base,
        background: T.colors.dangerBg,
        color: T.colors.dangerRed,
        border: `1px solid ${T.colors.dangerRed}`,
      };
    case "tab":
      return {
        ...base,
        background: active ? T.colors.surfaceWhite : "rgba(180, 160, 180, 0.12)",
        color: active ? T.colors.textPrimary : T.colors.textMuted,
        border: active ? `1px solid var(--border, ${T.border.defaultColor})` : "1px solid transparent",
        boxShadow: active ? T.shadow.subtle : "none",
      };
    default:
      return base;
  }
}

function getSizeStyles(size: ButtonSize, iconOnly: boolean): React.CSSProperties {
  const h = T.height[size];
  const px = T.paddingX[size];
  if (iconOnly) {
    const min = Math.max(T.icon.onlyMinSize, h);
    return {
      minWidth: min,
      minHeight: min,
      padding: 0,
      fontSize: T.icon.size,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    };
  }
  return {
    minHeight: h,
    paddingLeft: px,
    paddingRight: px,
    paddingTop: 12,
    paddingBottom: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: size === "sm" ? 13 : size === "md" ? 14 : 16,
  };
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  disabled = false,
  loading = false,
  active = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  iconOnly = false,
  type = "button",
  to,
  href,
  className = "",
  style = {},
  onClick,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
  title,
  ...rest
}: ButtonProps) {
  const variantStyles = getVariantStyles(variant, active, disabled);
  const sizeStyles = getSizeStyles(size, iconOnly);
  const combined: React.CSSProperties = {
    ...variantStyles,
    ...sizeStyles,
    ...(fullWidth ? { width: "100%" } : {}),
    ...style,
  };

  const iconWrapStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: T.icon.size,
    lineHeight: 1,
  };
  const iconWrapClass = "ui-button__icon";
  const normalizedChildren = iconOnly ? normalizeLegacyArrowIcon(children) : children;
  const content = (
    <>
      {loading ? (
        <span aria-hidden>…</span>
      ) : (
        <>
          {leftIcon && <span className={iconWrapClass} style={iconWrapStyle}>{leftIcon}</span>}
          {!iconOnly && normalizedChildren}
          {rightIcon && <span className={iconWrapClass} style={iconWrapStyle}>{rightIcon}</span>}
          {iconOnly && <span className={iconWrapClass} style={iconWrapStyle}>{normalizedChildren}</span>}
        </>
      )}
    </>
  );

  const cn = ["ui-button", iconOnly && "ui-button--icon-only", className].filter(Boolean).join(" ");

  if (to) {
    return (
      <Link
        to={disabled ? "#" : to}
        className={cn}
        style={{
          ...combined,
          textDecoration: "none",
          pointerEvents: disabled ? "none" : undefined,
        }}
        onClick={disabled ? undefined : onClick}
        aria-disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        title={title}
      >
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        href={disabled ? undefined : href}
        className={cn}
        style={{
          ...combined,
          textDecoration: "none",
          pointerEvents: disabled ? "none" : undefined,
        }}
        onClick={onClick}
        aria-disabled={disabled}
        aria-label={ariaLabel}
        title={title}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={cn}
      style={combined}
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed ?? (variant === "tab" ? active : undefined)}
      title={title}
      {...rest}
    >
      {content}
    </button>
  );
}

/** Icon-only button with minimum 44x44 touch target. Use same variants/sizes. */
export function IconButton(props: ButtonProps) {
  return <Button {...props} iconOnly size={props.size ?? "md"} />;
}
