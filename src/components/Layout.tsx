import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import ImportBanner from "@/components/ImportBanner";

const iconSize = 20;
const strokeWidth = 1.5; /* thin icons — nav mock compact */

const NavIcons = {
  dashboard: (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  students: (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  earnings: (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  insights: (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  ),
  settings: (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const navKeys = [
  { to: "/", key: "nav.dashboard", icon: NavIcons.dashboard },
  { to: "/students", key: "nav.students", icon: NavIcons.students },
  { to: "/earnings", key: "nav.earnings", icon: NavIcons.earnings },
  { to: "/insights", key: "nav.insights", icon: NavIcons.insights },
  { to: "/settings", key: "nav.settings", icon: NavIcons.settings },
];

/** Minimum time tab must be hidden before we refetch on visibility. Avoids overwriting state right after import. */
const RELOAD_AFTER_HIDDEN_MS = 4000;

const BODY_CLASS_DASHBOARD = "dashboard-route";

export default function Layout() {
  const { reload } = useStoreContext();
  const { t } = useLanguage();
  const location = useLocation();
  const hiddenAtRef = useRef<number | null>(null);

  /* So dashboard .voice-fab green override still applies when FAB is portaled to #phone-portal */
  useEffect(() => {
    const onDashboard = location.pathname === "/" || location.pathname === "";
    document.body.classList.toggle(BODY_CLASS_DASHBOARD, onDashboard);
    return () => document.body.classList.remove(BODY_CLASS_DASHBOARD);
  }, [location.pathname]);

  useEffect(() => {
    if (!hasSupabase()) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (hiddenAt == null || Date.now() - hiddenAt >= RELOAD_AFTER_HIDDEN_MS) {
          reload();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [reload]);

  const devLoadedAt = typeof window !== "undefined" && import.meta.env.DEV ? (window as unknown as { __studioLogLoadedAt?: number }).__studioLogLoadedAt : null;

  return (
    <>
      <div
        className="app-layout"
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <main
          className="app-shell"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            padding: "20px 16px 24px",
            paddingBottom: "calc(var(--nav-height) + var(--safe-bottom) + 24px)",
          }}
        >
        {devLoadedAt != null && (
          <div style={{ position: "fixed", bottom: 56, right: 12, fontSize: 10, color: "var(--text-muted)", opacity: 0.7, pointerEvents: "none", zIndex: 0 }} title="Page load time – if this doesn’t change after refresh, the browser is serving cached code">
            loaded {new Date(devLoadedAt).toLocaleTimeString()}
          </div>
        )}
        <ImportBanner />
        <div className="pageTransition" style={{ flex: 1, minHeight: 0 }}>
          <Outlet />
        </div>
        </main>
      </div>
      {(() => {
        const portalTarget =
          typeof document !== "undefined"
            ? (document.getElementById("phone-portal") ?? document.getElementById("root"))
            : null;
        return portalTarget
          ? createPortal(
              <nav className="bottom-nav" aria-label="Main">
                {navKeys.map(({ to, key, icon }) => (
                  <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                    <span className="bottom-nav__icon">{icon}</span>
                    <span className="bottom-nav__label">{t(key)}</span>
                  </NavLink>
                ))}
              </nav>,
              portalTarget
            )
          : null;
      })()}
    </>
  );
}
