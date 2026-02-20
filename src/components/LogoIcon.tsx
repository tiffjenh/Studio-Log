/**
 * Logo: gradient star image inside the existing white circle container.
 * Single source of truth — replace /public/brand/logo-star-gradient.png to update everywhere.
 * Container (size, shadow, radius) is provided by .logo-circle / .landing__logo; this only renders the image.
 */

const LOGO_SRC = "/brand/logo-star-gradient.png";

export default function LogoIcon({ size = 52 }: { size?: number }) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
      }}
      loading="eager"
      fetchPriority="high"
    />
  );
}
