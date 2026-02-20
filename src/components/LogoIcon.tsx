/**
 * Logo: gradient five-pointed star inside a white circle (with subtle depth).
 * Star has inner gradient fill + two concentric gradient outlines; matches --avatar-gradient.
 * Replaces previous star. Scales cleanly for nav and favicon.
 */

const viewSize = 100;
const center = viewSize / 2;
const circleR = 50;
const outerR = 44;
const innerR = 17;

/** 5-pointed star path (10 points: outer, inner, ...). Angles from top, clockwise. Rounded via strokeLinejoin. */
function starPath(): string {
  const points: { angle: number; r: number }[] = [];
  for (let i = 0; i < 5; i++) {
    points.push({ angle: i * 72, r: outerR });
    points.push({ angle: i * 72 + 36, r: innerR });
  }
  const d = points
    .map(({ angle, r }) => {
      const rad = (angle * Math.PI) / 180;
      const x = center + r * Math.sin(rad);
      const y = center - r * Math.cos(rad);
      return `${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" L ");
  return `M ${d} Z`;
}

export default function LogoIcon({ size = 52 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
      aria-hidden
    >
      <defs>
        <linearGradient
          id="logoGradient"
          gradientUnits="objectBoundingBox"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0%" stopColor="#b6b1d9" />
          <stop offset="50%" stopColor="#c9dae7" />
          <stop offset="100%" stopColor="#f3a2bd" />
        </linearGradient>
        <filter id="logoCircleShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.12" />
        </filter>
      </defs>
      {/* White circle with subtle depth */}
      <circle
        cx={center}
        cy={center}
        r={circleR}
        fill="#ffffff"
        filter="url(#logoCircleShadow)"
      />
      {/* Star: two concentric gradient outlines then gradient fill */}
      <path
        d={starPath()}
        stroke="url(#logoGradient)"
        strokeWidth={2.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={starPath()}
        stroke="url(#logoGradient)"
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={starPath()}
        fill="url(#logoGradient)"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
