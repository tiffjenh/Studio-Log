import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { updatePasswordSupabase, initiateEmailChange } from "@/store/supabaseSync";
import { downloadCsv } from "@/utils/importTemplates";
import { SEED_STUDENTS, getSeedLessons } from "@/data/seedData";
import { filterCurrencies, getCurrencyByCode, getStoredCurrencyCode, setStoredCurrencyCode } from "@/utils/currencies";
import type { Student } from "@/types";
import { Button, IconButton } from "@/components/ui/Button";
import { ChevronLeftIcon, DownloadIcon } from "@/components/ui/Icons";
import "./settings.css";

export default function Settings() {
  const { data, setUser, updateUserProfile, addStudentsBulk, addLessonsBulk, reload } = useStoreContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const user = data.user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [editing, setEditing] = useState<"name" | "email" | "password" | null>(null);
  const [saveError, setSaveError] = useState("");
  const [emailChangeMessage, setEmailChangeMessage] = useState<"success" | null>(null);
  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(null);
  const [emailJustConfirmed, setEmailJustConfirmed] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // After returning from the email-change confirmation link, show success and sync email from store.
  useEffect(() => {
    if (searchParams.get("email_updated") !== "1" || !user?.email) return;
    setEmail(user.email);
    setEmailJustConfirmed(true);
    setEmailChangeMessage(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("email_updated");
      return next;
    }, { replace: true });
  }, [searchParams, user?.email]);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loadingDemoData, setLoadingDemoData] = useState(false);
  const [demoDataResult, setDemoDataResult] = useState<{ students: number; lessons: number } | null>(null);
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState(() => getStoredCurrencyCode());
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");

  const handleSave = async (field: "name" | "email") => {
    if (!user) return;
    setSaveError("");
    setEmailChangeMessage(null);
    if (field === "name" && hasSupabase()) {
      await updateUserProfile({ name });
    } else if (field === "email" && hasSupabase()) {
      const newEmail = email.trim();
      if (newEmail === user.email) {
        setEditing(null);
        return;
      }
      // Send a verification magic-link to the CURRENT (old) email.
      // The new email will be applied after the user confirms via the link.
      const redirectUrl = `${window.location.origin}/settings`;
      const { error } = await initiateEmailChange(user.email, newEmail, redirectUrl);
      if (error) {
        setSaveError(error);
        return;
      }
      setPendingNewEmail(newEmail);
      setEmailChangeMessage("success");
    } else {
      setUser({ ...user, name: field === "name" ? name : user.name, email: field === "email" ? email : user.email });
    }
    setSaveError("");
    setEditing(null);
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    if (!hasSupabase()) {
      setPasswordError("Password change is only available when you're signed in with an account.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }
    const { error } = await updatePasswordSupabase(newPassword);
    if (error) {
      setPasswordError(error);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setEditing(null);
  };

  const handleLogOut = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      setUser(null);
      navigate("/", { replace: true });
    }
  };

  const handleLoadDemoData = async () => {
    setDemoDataResult(null);
    setLoadingDemoData(true);
    try {
      const { created } = await addStudentsBulk(SEED_STUDENTS, (inserted, total) => {
        setImportProgress({ current: inserted, total });
      });
      setImportProgress(null);
      if (created.length === 0) {
        setDemoDataResult({ students: 0, lessons: 0 });
        return;
      }
      const lessonPayload = getSeedLessons(created.map((s) => s.id));
      const addedLessons = await addLessonsBulk(lessonPayload);
      setDemoDataResult({ students: created.length, lessons: addedLessons.length });
      if (hasSupabase()) await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Failed to load demo data");
    } finally {
      setLoadingDemoData(false);
      setImportProgress(null);
    }
  };

  if (!user) return null;

  const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(201, 123, 148, 0.1)" };
  const inputStyle: React.CSSProperties = { flex: 2, padding: 6, fontSize: 15, border: "1px solid var(--border)", borderRadius: 8 };

  const currencySymbol = getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$";

  const openCurrencyModal = () => {
    setCurrencySearch("");
    setCurrencyModalOpen(true);
  };

  const selectCurrency = (code: string) => {
    setStoredCurrencyCode(code);
    setDefaultCurrencyCode(code);
    setCurrencyModalOpen(false);
  };

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <h1 className="settings-page__title">{t("settings.title")}</h1>
        <div className="settings-page__headerRight">
          <button
            type="button"
            className="settings-page__currencyCircle"
            onClick={openCurrencyModal}
            aria-label={t("settings.defaultCurrency")}
          >
            {currencySymbol}
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      {currencyModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setCurrencyModalOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 360, width: "90%", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)" }}>{t("settings.defaultCurrency")}</h3>
              <IconButton type="button" variant="ghost" size="sm" onClick={() => setCurrencyModalOpen(false)} aria-label="Close">×</IconButton>
            </div>
            <input
              type="text"
              value={currencySearch}
              onChange={(e) => setCurrencySearch(e.target.value)}
              placeholder={t("settings.searchCurrency")}
              style={{ width: "100%", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 12, fontSize: 14, fontFamily: "var(--font-sans)", marginBottom: 12 }}
              autoFocus
            />
            <div style={{ overflowY: "auto", maxHeight: 280 }}>
              {filterCurrencies(currencySearch).map((c) => (
                <Button
                  key={c.code}
                  type="button"
                  variant="tab"
                  active={defaultCurrencyCode === c.code}
                  size="sm"
                  fullWidth
                  onClick={() => selectCurrency(c.code)}
                  style={{ width: "100%", textAlign: "left", justifyContent: "flex-start", boxShadow: "none" }}
                >
                  {c.symbol} {c.code} – {c.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
      {!hasSupabase() && (
        <p style={{ marginBottom: 24, fontSize: 14, color: "var(--text-muted)" }}>
          {t("settings.localStorageHint")}
        </p>
      )}
      <div className="float-card" style={{ marginBottom: 24 }}>
        <div style={rowStyle}>
          <span style={{ flex: 1 }}>{t("settings.name")}</span>
          {editing === "name" ? (
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} onBlur={() => handleSave("name")} autoFocus />
          ) : (
            <span style={{ flex: 2 }}>{user.name}</span>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={() => (editing === "name" ? handleSave("name") : setEditing("name"))} style={{ marginLeft: 8 }}>
            {editing === "name" ? t("common.save") : t("common.edit")}
          </Button>
        </div>
        <div style={rowStyle}>
          <span style={{ flex: 1 }}>{t("settings.email")}</span>
          {editing === "email" ? (
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} onBlur={() => handleSave("email")} autoFocus />
          ) : (
            <span style={{ flex: 2 }}>{user.email}</span>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={() => { if (editing === "email") handleSave("email"); else { setEmailChangeMessage(null); setEditing("email"); } }} style={{ marginLeft: 8 }}>
            {editing === "email" ? t("common.save") : t("common.edit")}
          </Button>
        </div>
        {saveError ? <p style={{ color: "#dc2626", marginTop: 8, marginBottom: 0 }}>{saveError}</p> : null}
        {emailJustConfirmed && (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "var(--success, green)" }}>
            Your email has been updated to <strong>{user.email}</strong>.
          </p>
        )}
        {emailChangeMessage === "success" && editing !== "email" && !emailJustConfirmed && (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "var(--text-muted)" }}>
            Check the inbox for <strong>{user.email}</strong> (and spam folder). Click the verification link to confirm the email change. Your login email will update to <strong>{pendingNewEmail || email.trim()}</strong> after you confirm. If you don't see it, wait a minute and try again (rate limit: one request per 60 seconds).
          </p>
        )}
        <div style={{ ...rowStyle, borderBottom: "none" }}>
          <span style={{ flex: 1 }}>{t("settings.password")}</span>
          {editing === "password" ? (
            <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="password"
                placeholder={t("settings.newPassword")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
                autoFocus
              />
              <input
                type="password"
                placeholder={t("settings.confirmPassword")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
              />
              {passwordError && <span style={{ fontSize: 13, color: "#dc2626" }}>{passwordError}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="button" variant="secondary" size="sm" onClick={handleChangePassword}>{t("common.save")}</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setEditing(null); setNewPassword(""); setConfirmPassword(""); setPasswordError(""); }}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            <>
              <span style={{ flex: 2 }}>••••••••</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => { setPasswordError(""); setEditing("password"); }} style={{ marginLeft: 8 }}>{t("common.edit")}</Button>
            </>
          )}
        </div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <Button type="button" variant="secondary" size="md" onClick={handleLogOut}>{t("settings.logOut")}</Button>
      </div>

      {/* Dev-only: Button Showcase for visual consistency check */}
      {import.meta.env.DEV && (
        <div className="float-card" style={{ marginTop: 32, padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Button Showcase</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <Button variant="primary" size="sm">Primary sm</Button>
            <Button variant="primary" size="md">Primary md</Button>
            <Button variant="primary" size="lg">Primary lg</Button>
            <Button variant="secondary" size="sm">Secondary sm</Button>
            <Button variant="secondary" size="md">Secondary md</Button>
            <Button variant="ghost" size="sm">Ghost sm</Button>
            <Button variant="danger" size="sm">Danger</Button>
            <Button variant="tab" size="sm" active>Tab active</Button>
            <Button variant="tab" size="sm">Tab inactive</Button>
            <Button variant="primary" size="md" disabled>Disabled</Button>
            <Button variant="primary" size="md" loading>Loading</Button>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Icon buttons: <Button variant="primary" size="md" iconOnly aria-label="Example">+</Button>
            <Button variant="secondary" size="md" iconOnly aria-label="Back" style={{ marginLeft: 8 }}><ChevronLeftIcon /></Button>
            <Button variant="ghost" size="md" iconOnly aria-label="Download" style={{ marginLeft: 8 }}><DownloadIcon size={7} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
