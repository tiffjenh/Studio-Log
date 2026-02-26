import React from "react";

/**
 * Bezel-only desktop simulator. Does NOT add scroll, padding, or backgrounds
 * to app content. App layout (app-layout / app-shell) controls scrolling.
 * Provides #phone-portal inside the shell for nav/overlays so fixed/absolute
 * pin to the phone viewport.
 */
export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    /* Desktop canvas: white, centered, no page scroll */
    <div className="min-h-dvh overflow-hidden bg-white flex items-center justify-center p-6">
      {/* Phone shell: transform-gpu creates containing block for fixed descendants */}
      <div
        id="phone-shell"
        data-desktop-simulator="true"
        className="
          relative
          w-[390px] max-w-[92vw]
          h-[844px] max-h-[90dvh]
          overflow-hidden
          rounded-[44px]
          border border-black/10
          shadow-[0_30px_80px_rgba(0,0,0,0.14)]
          bg-white
          transform-gpu
        "
      >
        {/* Portal mount + app content; --app-layout-height so app fills phone, no double scroll */}
        <div
          id="phone-portal"
          className="relative h-full w-full"
          style={{ ["--app-layout-height" as string]: "100%" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
