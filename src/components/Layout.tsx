import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { hasSupabase } from "@/lib/supabase";
import ImportBanner from "@/components/ImportBanner";

const navItems = [
  { to: "/", label: "Dashboard", icon: "⌂" },
  { to: "/students", label: "Students", icon: "👥" },
  { to: "/earnings", label: "Earnings", icon: "💰" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function Layout() {
  const { loadError, reload } = useStoreContext();

  useEffect(() => {
    if (!hasSupabase()) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [reload]);

  return (
    <>
      <main className="app-shell" style={{ padding: "20px 16px 24px" }}>
        {loadError && (
          <div style={{ marginBottom: 16, padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 14, color: "#dc2626" }}>
            Could not load data: {loadError}. Try logging out and back in, or check the browser console.
          </div>
        )}
        <ImportBanner />
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Main">
        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
