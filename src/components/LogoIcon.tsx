/** Logo: treble clef icon (from /treble-clef-icon.png). */
export default function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/treble-clef-icon.png"
      alt=""
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain" }}
      aria-hidden
    />
  );
}
