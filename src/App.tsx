import { useEffect, useRef } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useStoreContext } from "./context/StoreContext";
import { useLanguage } from "./context/LanguageContext";
import { supabase, hasSupabase, isAuthCallbackUrl, clearAuthCallbackHash } from "./lib/supabase";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import AddStudent from "./pages/AddStudent";
import Earnings from "./pages/Earnings";
import Settings from "./pages/Settings";
import Calendar from "./pages/Calendar";
import EditLesson from "./pages/EditLesson";

/** Toggle body class so login/forgot-password pages don't reserve space for the bottom nav (removes purple bar). */
function BodyNavClass() {
  const location = useLocation();
  const { data } = useStoreContext();
  const noNav = location.pathname === "/forgot-password" || (location.pathname === "/" && !data.user);
  useEffect(() => {
    document.body.classList.toggle("no-bottom-nav", noNav);
    return () => document.body.classList.remove("no-bottom-nav");
  }, [noNav]);
  return null;
}

/**
 * When user lands from Supabase email-change (or recovery) link, the URL has tokens in the hash.
 * Supabase client picks them up and fires SIGNED_IN. We reload the store and send them to Settings.
 * Also handles the case where the initial load already restored the session from the URL.
 */
function AuthCallbackHandler() {
  const { data, loaded, reload } = useStoreContext();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (!hasSupabase() || !supabase) return;

    const onAuth = async (event: string) => {
      if (event !== "SIGNED_IN" || !isAuthCallbackUrl()) return;
      if (handled.current) return;
      handled.current = true;
      clearAuthCallbackHash();
      await reload();
      navigate("/settings?email_updated=1", { replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange(onAuth);
    return () => sub.subscription.unsubscribe();
  }, [reload, navigate]);

  // If we already have a user and the URL still has callback params, session was restored on load.
  useEffect(() => {
    if (!loaded || !data.user || !isAuthCallbackUrl() || handled.current) return;
    handled.current = true;
    clearAuthCallbackHash();
    navigate("/settings?email_updated=1", { replace: true });
  }, [loaded, data.user, navigate]);

  return null;
}

function AuthGate() {
  const { data, loaded } = useStoreContext();
  const { t } = useLanguage();
  const location = useLocation();
  if (!loaded) return <div className="loading-screen">{t("common.loading")}</div>;
  if (!data.user) {
    if (location.pathname === "/") return <Landing />;
    return <Navigate to="/" replace />;
  }
  return <Layout />;
}

export default function App() {
  return (
    <>
      <BodyNavClass />
      <AuthCallbackHandler />
      <Routes>
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/" element={<AuthGate />}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="add-student" element={<AddStudent />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="settings" element={<Settings />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="edit-lesson/:id" element={<EditLesson />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
