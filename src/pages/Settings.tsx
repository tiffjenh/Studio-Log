import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { updatePasswordSupabase, initiateEmailChange } from "@/store/supabaseSync";
import { parseLessonCSV, parseLessonMatrixCSV, rowToLesson, type ImportResult } from "@/utils/csvImport";
import { filterCurrencies, getCurrencyByCode, getStoredCurrencyCode, setStoredCurrencyCode } from "@/utils/currencies";
import { getLessonForStudentOnDate } from "@/utils/earnings";
import type { Student } from "@/types";

export default function Settings() {
  const { data, setUser, updateUserProfile, addLesson, updateLesson } = useStoreContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const matrixFileInputRef = useRef<HTMLInputElement>(null);
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
  const [importDataOpen, setImportDataOpen] = useState(false);
  const [importMatrixOpen, setImportMatrixOpen] = useState(false);
  const [importRowOpen, setImportRowOpen] = useState(false);
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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);

    try {
      const text = await file.text();
      const parsed = parseLessonCSV(text);
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        e.target.value = "";
        return;
      }

      const students = data.students;
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < parsed.rows.length; i++) {
        const lessonData = rowToLesson(parsed.rows[i]);
        if (!lessonData) {
          skipped++;
          errors.push(`Row ${i + 2}: Invalid or missing data`);
          continue;
        }

        const student = students.find(
          (s) =>
            s.firstName.toLowerCase().trim() === lessonData.first_name.toLowerCase() &&
            s.lastName.toLowerCase().trim() === lessonData.last_name.toLowerCase()
        );
        if (!student) {
          skipped++;
          errors.push(`Row ${i + 2}: No student named ${lessonData.first_name} ${lessonData.last_name}`);
          continue;
        }

        try {
          const existing = getLessonForStudentOnDate(data.lessons, student.id, lessonData.date);
          if (existing) {
            await updateLesson(existing.id, {
              completed: true, // Imported lessons count in earnings; no need to toggle manually
              durationMinutes: lessonData.duration_minutes,
              amountCents: lessonData.amount_cents,
              note: lessonData.note,
            });
            imported++;
          } else {
            const id = await addLesson({
              studentId: student.id,
              date: lessonData.date,
              durationMinutes: lessonData.duration_minutes,
              amountCents: lessonData.amount_cents,
              completed: true, // Imported lessons count in earnings; no need to toggle manually
              note: lessonData.note,
            });
            if (id) imported++;
            else {
              skipped++;
              errors.push(`Row ${i + 2}: Failed to save`);
            }
          }
        } catch {
          skipped++;
          errors.push(`Row ${i + 2}: Failed to save`);
        }
      }

      setImportResult({ imported, skipped, errors });
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  function matchStudentByName(name: string): Student | undefined {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return undefined;

    const exact = data.students.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === name.toLowerCase());
    if (exact) return exact;

    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ") || first;
    const match = data.students.find(
      (s) =>
        s.firstName.toLowerCase() === first.toLowerCase() &&
        s.lastName.toLowerCase() === last.toLowerCase()
    );
    if (match) return match;

    if (parts.length >= 2) {
      const lastAlt = parts[1]; // "Dylan Chun Chun" -> try first=Dylan, last=Chun
      return data.students.find(
        (s) =>
          s.firstName.toLowerCase() === first.toLowerCase() &&
          s.lastName.toLowerCase() === lastAlt.toLowerCase()
      );
    }
    return undefined;
  }

  const handleMatrixImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);

    try {
      const text = await file.text();
      const parsed = parseLessonMatrixCSV(text, importYear);
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        e.target.value = "";
        return;
      }

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const { date, studentIndex } of parsed.attendance) {
        const name = parsed.studentNames[studentIndex];
        const student = name ? matchStudentByName(name) : undefined;
        if (!student) {
          skipped++;
          if (!errors.some((x) => x.includes(name ?? ""))) errors.push(`No student named "${name}"`);
          continue;
        }

        try {
          const existing = getLessonForStudentOnDate(data.lessons, student.id, date);
          if (existing) {
            await updateLesson(existing.id, { completed: true }); // Imported = toggled on for earnings
            imported++;
          } else {
            const id = await addLesson({
              studentId: student.id,
              date,
              durationMinutes: student.durationMinutes,
              amountCents: student.rateCents,
              completed: true, // Imported = toggled on for earnings
            });
            if (id) imported++;
            else { skipped++; errors.push(`Failed: ${name} on ${date}`); }
          }
        } catch (err: unknown) {
          skipped++;
          console.error(`Matrix import failed: ${name} on ${date}`, err);
          const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as Record<string, unknown>).message) : "unknown error";
          errors.push(`Failed: ${name} on ${date} — ${msg}`);
        }
      }

      setImportResult({ imported, skipped, errors });
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleLogOut = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      setUser(null);
      navigate("/", { replace: true });
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
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0 }}>{t("settings.title")}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={openCurrencyModal}
            style={{ fontSize: 18, fontWeight: 700, color: "var(--text-muted)", fontFamily: "var(--font-sans)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
            aria-label={t("settings.defaultCurrency")}
          >
            {currencySymbol}
          </button>
          <LanguageSwitcher />
        </div>
      </div>

      {currencyModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setCurrencyModalOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 360, width: "90%", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)" }}>{t("settings.defaultCurrency")}</h3>
              <button type="button" onClick={() => setCurrencyModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)" }} aria-label="Close">×</button>
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
                <button
                  key={c.code}
                  type="button"
                  onClick={() => selectCurrency(c.code)}
                  style={{ width: "100%", padding: "12px 14px", border: "none", background: defaultCurrencyCode === c.code ? "rgba(201, 123, 148, 0.15)" : "transparent", textAlign: "left", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-sans)" }}
                >
                  {c.symbol} {c.code} – {c.name}
                </button>
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
          <button type="button" onClick={() => (editing === "name" ? handleSave("name") : setEditing("name"))} style={{ marginLeft: 8, color: "var(--text)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            {editing === "name" ? t("common.save") : t("common.edit")}
          </button>
        </div>
        <div style={rowStyle}>
          <span style={{ flex: 1 }}>{t("settings.email")}</span>
          {editing === "email" ? (
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} onBlur={() => handleSave("email")} autoFocus />
          ) : (
            <span style={{ flex: 2 }}>{user.email}</span>
          )}
          <button type="button" onClick={() => { if (editing === "email") handleSave("email"); else { setEmailChangeMessage(null); setEditing("email"); } }} style={{ marginLeft: 8, color: "var(--text)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            {editing === "email" ? t("common.save") : t("common.edit")}
          </button>
        </div>
        {saveError ? <p style={{ color: "#dc2626", marginTop: 8, marginBottom: 0 }}>{saveError}</p> : null}
        {emailJustConfirmed && (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "var(--success, green)" }}>
            Your email has been updated to <strong>{user.email}</strong>.
          </p>
        )}
        {emailChangeMessage === "success" && editing !== "email" && !emailJustConfirmed && (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "var(--text-muted)" }}>
            Check the inbox for <strong>{user.email}</strong> (and spam folder). Click the verification link to confirm the email change. Your login email will update to <strong>{pendingNewEmail || email.trim()}</strong> after you confirm. If you don’t see it, wait a minute and try again (rate limit: one request per 60 seconds).
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
                <button type="button" onClick={handleChangePassword} style={{ padding: "8px 14px", color: "white", fontWeight: 600, background: "var(--accent-gradient)", border: "none", borderRadius: 8, cursor: "pointer" }}>{t("common.save")}</button>
                <button type="button" onClick={() => { setEditing(null); setNewPassword(""); setConfirmPassword(""); setPasswordError(""); }} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", cursor: "pointer" }}>{t("common.cancel")}</button>
              </div>
            </div>
          ) : (
            <>
              <span style={{ flex: 2 }}>••••••••</span>
              <button type="button" onClick={() => { setPasswordError(""); setEditing("password"); }} style={{ marginLeft: 8, color: "var(--text)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>{t("common.edit")}</button>
            </>
          )}
        </div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <button type="button" className="pill" style={{ width: "auto", padding: "10px 20px", marginBottom: 8, borderRadius: "var(--radius-pill)", background: "transparent", border: "2px solid #fff", color: "var(--text)", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }} onClick={handleLogOut}>{t("settings.logOut")}</button>
        <div>
          <button type="button" onClick={() => setImportDataOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-muted)", textDecoration: "underline" }}>
            {t("settings.importData")}
          </button>
        </div>
      </div>
      {importDataOpen && (
      <>
      <div className="float-card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setImportMatrixOpen((o) => !o)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
        >
          <span style={{ fontSize: 14 }}>{importMatrixOpen ? "▼" : "▶"}</span>
          {t("settings.importLessonsMatrix")}
        </button>
        {importMatrixOpen && (
          <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13 }}>
            <p style={{ margin: "12px 0", fontSize: 13, color: "var(--text-muted)" }}>
              First row: student names. First column: dates (e.g. 1/1, 1/4). Put &quot;Y&quot; if they attended. Uses each student&apos;s rate. Students must already exist.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <label style={{ fontSize: 14 }}>
                Year for dates:
                <input
                  type="number"
                  min={2020}
                  max={2030}
                  value={importYear}
                  onChange={(e) => setImportYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                  style={{ marginLeft: 8, width: 70, padding: 6, border: "1px solid var(--border)", borderRadius: 6 }}
                />
              </label>
              <input
                ref={matrixFileInputRef}
                type="file"
                accept=".csv"
                onChange={handleMatrixImport}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => matrixFileInputRef.current?.click()}
                disabled={importing}
                style={{ padding: "10px 16px", fontSize: 14, border: "2px solid #fff", borderRadius: 8, background: "transparent", color: "var(--text)", cursor: importing ? "not-allowed" : "pointer" }}
              >
                {importing ? t("common.loading") : t("settings.importMatrix")}
              </button>
            </div>
            {importResult && (
              <div style={{ marginTop: 12, fontSize: 14 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Imported {importResult.imported} lessons, skipped {importResult.skipped}</p>
                {importResult.errors.length > 0 && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "var(--text-muted)", maxHeight: 120, overflowY: "auto" }}>
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResult.errors.length > 10 && <li>…and {importResult.errors.length - 10} more</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="float-card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setImportRowOpen((o) => !o)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
        >
          <span style={{ fontSize: 14 }}>{importRowOpen ? "▼" : "▶"}</span>
          {t("settings.importLessonsRow")}
        </button>
        {importRowOpen && (
          <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13 }}>
            <p style={{ margin: "12px 0", fontSize: 13, color: "var(--text-muted)" }}>
              CSV needs: <code>first_name</code>, <code>last_name</code>, <code>date</code> (YYYY-MM-DD or M/D/YYYY), <code>duration_minutes</code>, <code>amount</code> (dollars) or <code>amount_cents</code>. Optional: <code>completed</code>, <code>note</code>. Students must already exist.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImport}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              style={{ padding: "10px 16px", fontSize: 14, border: "2px solid #fff", borderRadius: 8, background: "transparent", color: "var(--text)", cursor: importing ? "not-allowed" : "pointer" }}
            >
              {importing ? t("common.loading") : t("settings.importCsv")}
            </button>
          </div>
        )}
      </div>
      </>
      )}
    </>
  );
}
