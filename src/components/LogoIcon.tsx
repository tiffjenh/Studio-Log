/**
 * Logo: flower brand mark (daisy-style, dark charcoal) centered for use inside
 * the white circle provided by .logo-circle / .landing__logo.
 * No gradients, shadows, or text. Scales cleanly for nav and favicon.
 */
const FLOWER_STROKE = "#3d3639";
const PETAL_COUNT = 14;

/** Single petal path in local coords: base at origin, tip along -Y. */
function petalPath(width: number, length: number): string {
  const w = width / 2;
  return `M ${w} 0 C ${w} ${-length * 0.5} 0 ${-length} 0 ${-length} C 0 ${-length} ${-w} ${-length * 0.5} ${-w} 0 Z`;
}

export default function LogoIcon({ size = 28 }: { size?: number }) {
  const viewSize = 100;
  const center = viewSize / 2;
  const centerRadius = 6;
  const petalLength = 39; /* flower radius 45 → ~10% internal padding */
  const petalWidth = 4;
  const strokeWidth = 1.6;
  const step = 360 / PETAL_COUNT;

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
      {/* Solid dark center */}
      <circle cx={center} cy={center} r={centerRadius} fill={FLOWER_STROKE} />
      {/* Petals: outlines only, same stroke color */}
      {Array.from({ length: PETAL_COUNT }, (_, i) => (
        <path
          key={i}
          d={petalPath(petalWidth, petalLength)}
          transform={`translate(${center},${center}) rotate(${i * step})`}
          stroke={FLOWER_STROKE}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
