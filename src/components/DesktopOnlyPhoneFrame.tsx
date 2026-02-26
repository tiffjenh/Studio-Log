import React from "react";
import PhoneFrame from "./PhoneFrame";

function isDesktopLike() {
  if (typeof window === "undefined") return false;

  const wideEnough = window.matchMedia("(min-width: 1024px)").matches;
  const hasMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Desktop-ish = wide screen AND mouse/trackpad hover
  return wideEnough && hasMouse;
}

export default function DesktopOnlyPhoneFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const [wrap, setWrap] = React.useState(false);

  React.useEffect(() => {
    const update = () => setWrap(isDesktopLike());
    update();

    const mqlWidth = window.matchMedia("(min-width: 1024px)");
    const mqlPointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    const handler = () => update();
    mqlWidth.addEventListener?.("change", handler);
    mqlPointer.addEventListener?.("change", handler);
    window.addEventListener("resize", handler);

    return () => {
      mqlWidth.removeEventListener?.("change", handler);
      mqlPointer.removeEventListener?.("change", handler);
      window.removeEventListener("resize", handler);
    };
  }, []);

  return wrap ? <PhoneFrame>{children}</PhoneFrame> : <>{children}</>;
}
