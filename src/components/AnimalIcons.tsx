import type React from "react";

/**
 * Animal avatar icons – simple black outline, minimalist style (rounded head, minimal features).
 * Only dog, cat, koala. Initials (gradient) is the default.
 */

const stroke = "currentColor";
const strokeWidth = 1.5;
const viewBox = "0 0 24 24";

const icons: Record<string, React.ReactNode> = {
  dog: (
    <svg viewBox={viewBox} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="13" rx="6" ry="6" />
      <path d="M6 8v2c0 2 1 3 6 3s6-1 6-3V8" />
      <path d="M5 10c0-1 1-2 2-2s2 .5 2 1.5M19 10c0-1-1-2-2-2s-2 .5-2 1.5" />
      <circle cx="10" cy="12" r="1.2" fill={stroke} />
      <circle cx="14" cy="12" r="1.2" fill={stroke} />
      <ellipse cx="12" cy="15" rx="1.5" ry="1" fill={stroke} />
      <path d="M11 16.5c.3.4.9.5 1 .5s.7-.1 1-.5" />
    </svg>
  ),
  cat: (
    <svg viewBox={viewBox} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5.5c-2 0-4 1.5-4 4v6c0 1.5 1 2.5 4 2.5s4-1 4-2.5v-6c0-2.5-2-4-4-4z" />
      <path d="M8 9h8" />
      <path d="M9 6l.5 1.5M15 6l-.5 1.5" />
      <path d="M7 5l1.5 1M17 5l-1.5 1" />
      <circle cx="10" cy="12" r="1" fill={stroke} />
      <circle cx="14" cy="12" r="1" fill={stroke} />
      <path d="M10 15.2c.4.5 1 .8 2 .8s1.6-.3 2-.8" />
    </svg>
  ),
  koala: (
    <svg viewBox={viewBox} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="13" rx="5.5" ry="5.5" />
      <path d="M7 8.5v1.5M17 8.5v1.5" />
      <circle cx="10" cy="12" r="1" fill={stroke} />
      <circle cx="14" cy="12" r="1" fill={stroke} />
      <path d="M10 15c.5.6 1.2 1 2 1s1.5-.4 2-1" />
      <path d="M9 7.5h6" />
    </svg>
  ),
};

export const AVATAR_ICON_KEYS = ["dog", "cat", "koala"] as const;
export type AvatarIconKey = (typeof AVATAR_ICON_KEYS)[number];

/** Dog = light blue, Cat = pink, Koala = light purple (from gradient palette). */
export const AVATAR_ICON_COLORS: Record<AvatarIconKey, string> = {
  dog: "#c9dae7",
  cat: "#f3a2bd",
  koala: "#b6b1d9",
};

export function isValidAvatarIcon(value: string | undefined): value is AvatarIconKey {
  return value != null && AVATAR_ICON_KEYS.includes(value as AvatarIconKey);
}

export default function AnimalIcon({ name, size = 24 }: { name: AvatarIconKey; size?: number }) {
  const icon = icons[name];
  if (!icon) return null;
  return (
    <span style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {icon}
    </span>
  );
}

export function getAnimalIcon(name: string | undefined): React.ReactNode {
  if (!name || !isValidAvatarIcon(name)) return null;
  return icons[name];
}

export { icons };
