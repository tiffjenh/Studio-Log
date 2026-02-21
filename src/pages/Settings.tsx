import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { updatePasswordSupabase, initiateEmailChange } from "@/store/supabaseSync";
import { parseLessonMatrixCSV, type ImportResult } from "@/utils/csvImport";
import { downloadCsv, getMatrixTemplateCsv } from "@/utils/importTemplates";
import { filterCurrencies, getCurrencyByCode, getStoredCurrencyCode, setStoredCurrencyCode } from "@/utils/currencies";
import { getLessonForStudentOnDate } from "@/utils/earnings";
import type { Lesson, Student } from "@/types";
import { Button, IconButton } from "@/components/ui/Button";
import { ChevronLeftIcon, DownloadIcon } from "@/components/ui/Icons";

export default function Settings() {
  const { data, setUser, updateUserProfile, addStudentsBulk, addLessonsBulk, updateLesson, clearAllLessons, reload } = useStoreContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
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
  const [clearingLessons, setClearingLessons] = useState(false);
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

  function matchStudentByName(name: string, studentList?: Student[]): Student | undefined {
    const list = studentList ?? data.students;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return undefined;

    const exact = list.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === name.toLowerCase());
    if (exact) return exact;

    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ") || first;
    const match = list.find(
      (s) =>
        s.firstName.toLowerCase() === first.toLowerCase() &&
        s.lastName.toLowerCase() === last.toLowerCase()
    );
    if (match) return match;

    if (parts.length >= 2) {
      const lastAlt = parts[1];
      return list.find(
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
    setImportProgress(null);

    try {
      const text = await file.text();
      const parsed = parseLessonMatrixCSV(text, new Date().getFullYear());
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        setImportProgress(null);
        e.target.value = "";
        return;
      }

      const total = parsed.attendance.length;
      setImportProgress({ current: 0, total });
      await new Promise((r) => setTimeout(r, 80));

      const existingSet = new Set(data.lessons.map((l) => `${l.studentId}|${l.date}`));
      const toAdd: Omit<Lesson, "id">[] = [];
      const toUpdate: { id: string; date: string; updates: { completed: boolean; amountCents: number; durationMinutes: number } }[] = [];
      const errors: string[] = [];

      let studentListForMatch = data.students;
      const uniqueNames = [...new Set(parsed.studentNames)];
      const missingNames = uniqueNames.filter((n) => !matchStudentByName(n, studentListForMatch));
      if (missingNames.length > 0) {
        const toCreate: Omit<Student, "id">[] = missingNames.map((name) => {
          const parts = name.trim().split(/\s+/).filter(Boolean);
          const firstName = parts[0] ?? "";
          const lastName = parts.slice(1).join(" ") || "";
          return {
            firstName,
            lastName,
            durationMinutes: 60,
            rateCents: 0,
            dayOfWeek: 1,
            timeOfDay: "9:00 AM",
          };
        });
        const { created } = await addStudentsBulk(toCreate);
        studentListForMatch = [...data.students, ...created];
      }

      const PROGRESS_BATCH = 150;
      for (let idx = 0; idx < parsed.attendance.length; idx++) {
        if (idx % PROGRESS_BATCH === 0 || idx === parsed.attendance.length - 1) {
          setImportProgress({ current: idx + 1, total });
          if (idx > 0 && idx < parsed.attendance.length - 1) await new Promise((r) => setTimeout(r, 0));
        }
        const { date, studentIndex } = parsed.attendance[idx];
        const name = parsed.studentNames[studentIndex];
        const student = name ? matchStudentByName(name, studentListForMatch) : undefined;
        if (!student) {
          if (!errors.some((x) => x.includes(name ?? ""))) errors.push(`No student named "${name}"`);
          continue;
        }
        const key = `${student.id}|${date}`;
        if (existingSet.has(key)) {
          const existing = getLessonForStudentOnDate(data.lessons, student.id, date);
          if (existing) toUpdate.push({ id: existing.id, date, updates: { completed: true, amountCents: student.rateCents, durationMinutes: student.durationMinutes } });
        } else {
          toAdd.push({ studentId: student.id, date, durationMinutes: student.durationMinutes, amountCents: student.rateCents, completed: true });
          existingSet.add(key);
        }
      }

      const totalSteps = parsed.attendance.length + toUpdate.length + toAdd.length;
      let updateImported = 0;
      const countsByYear: Record<string, number> = {};
      for (let i = 0; i < toUpdate.length; i++) {
        if (i % PROGRESS_BATCH === 0 || i === toUpdate.length - 1) {
          setImportProgress({ current: parsed.attendance.length + i + 1, total: totalSteps });
          if (i > 0 && i < toUpdate.length - 1) await new Promise((r) => setTimeout(r, 0));
        }
        const { id, date, updates } = toUpdate[i]!;
        try {
          await updateLesson(id, updates);
          updateImported++;
          const y = date.slice(0, 4);
          countsByYear[y] = (countsByYear[y] ?? 0) + 1;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Update failed for ${date}: ${msg}`);
        }
      }

      const toAddCountsByYear: Record<string, number> = {};
      for (const l of toAdd) {
        const y = l.date.slice(0, 4);
        toAddCountsByYear[y] = (toAddCountsByYear[y] ?? 0) + 1;
      }
      let bulkImported = 0;
      if (toAdd.length > 0) {
        setImportProgress({ current: totalSteps, total: totalSteps });
        try {
          const created = await addLessonsBulk(toAdd);
          bulkImported = created.length;
          for (const l of created) {
            const y = l.date.slice(0, 4);
            countsByYear[y] = (countsByYear[y] ?? 0) + 1;
          }
          if (created.length !== toAdd.length) {
            errors.push(`Only ${created.length} of ${toAdd.length} lessons were saved; ${toAdd.length - created.length} may have failed.`);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Bulk add failed (${toAdd.length} lessons): ${msg}`);
        }
      }

      const imported = updateImported + bulkImported;
      const skipped = parsed.attendance.length - imported;
      const dateRange =
        parsed.dates.length > 0
          ? { min: parsed.dates[0]!, max: parsed.dates[parsed.dates.length - 1]! }
          : undefined;
      const yearsInFile =
        dateRange
          ? (() => {
              const yMin = parseInt(dateRange.min.slice(0, 4), 10);
              const yMax = parseInt(dateRange.max.slice(0, 4), 10);
              const years: number[] = [];
              for (let y = yMin; y <= yMax; y++) years.push(y);
              return years;
            })()
          : undefined;
      const parsedCountsByYear: Record<string, number> = {};
      for (const { date } of parsed.attendance) {
        const y = date.slice(0, 4);
        parsedCountsByYear[y] = (parsedCountsByYear[y] ?? 0) + 1;
      }
      setImportResult({ imported, skipped, errors, dateRange, yearsInFile, countsByYear: Object.keys(countsByYear).length > 0 ? countsByYear : undefined, parsedCountsByYear: Object.keys(parsedCountsByYear).length > 0 ? parsedCountsByYear : undefined, toAddCountsByYear: Object.keys(toAddCountsByYear).length > 0 ? toAddCountsByYear : undefined, skippedRowsNoYear: parsed.skippedRowsNoYear });
      if (imported > 0 && hasSupabase()) await reload();
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
      setImportProgress(null);
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

  const importProgressBar = importing && importProgress ? (
    <div style={{ marginTop: 12, fontSize: 14, fontFamily: "var(--font-sans)" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Importing... {importProgress.current} of {importProgress.total}</p>
      <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%`, height: "100%", borderRadius: 4, background: "#c97b94", transition: "width 0.2s ease" }} />
      </div>
    </div>
  ) : null;

  const importResultBanner = importResult && !importing ? (() => {
    const success = importResult.imported > 0 && importResult.errors.length === 0;
    const partial = importResult.imported > 0 && importResult.errors.length > 0;
    const fail = importResult.imported === 0 && importResult.errors.length > 0;
    const label = success ? "lessons" : "items";
    const dateRange = importResult.dateRange ?? null;
    return (
      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, fontSize: 14, fontFamily: "var(--font-sans)", background: success ? "#f0fdf4" : fail ? "#fef2f2" : "#fffbeb", border: `1px solid ${success ? "#bbf7d0" : fail ? "#fecaca" : "#fde68a"}` }}>
        <p style={{ margin: 0, fontWeight: 700, color: success ? "#166534" : fail ? "#991b1b" : "#92400e" }}>
          {success ? `Success! Imported ${importResult.imported} ${label}.` : partial ? `Partially imported: ${importResult.imported} added, ${importResult.skipped} skipped.` : `Import failed — ${importResult.skipped} item${importResult.skipped !== 1 ? "s" : ""} skipped.`}
        </p>
        {importResult.skippedRowsNoYear != null && importResult.skippedRowsNoYear > 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#92400e", fontWeight: 600 }}>
            {importResult.skippedRowsNoYear} row{importResult.skippedRowsNoYear !== 1 ? "s" : ""} skipped: date had no year (e.g. 1/15). Use full dates in the first column (e.g. 1/15/2024, 1/15/2025) so lessons go to the right year.
          </p>
        )}
        {dateRange && (
          <>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: success ? "#166534" : fail ? "#991b1b" : "#92400e", opacity: 0.9 }}>
              Date range in file: {dateRange.min} to {dateRange.max}
              {importResult.yearsInFile && importResult.yearsInFile.length > 0 && ` · Years: ${importResult.yearsInFile.join(", ")}`}.
              {importResult.parsedCountsByYear && Object.keys(importResult.parsedCountsByYear).length > 0 && (
                <> Parsed: {Object.entries(importResult.parsedCountsByYear).sort(([a], [b]) => a.localeCompare(b)).map(([yr, n]) => `${yr}: ${n}`).join(", ")}. </>
              )}
              {importResult.toAddCountsByYear && Object.keys(importResult.toAddCountsByYear).length > 0 && (
                <> To add: {Object.entries(importResult.toAddCountsByYear).sort(([a], [b]) => a.localeCompare(b)).map(([yr, n]) => `${yr}: ${n}`).join(", ")}. </>
              )}
              {importResult.countsByYear && Object.keys(importResult.countsByYear).length > 0 && (
                <> Saved: {Object.entries(importResult.countsByYear).sort(([a], [b]) => a.localeCompare(b)).map(([yr, n]) => `${yr}: ${n}`).join(", ")} lessons. </>
              )}
              If 2025 or 2026 show $0 or wrong totals, use <strong>Clear all lessons</strong> below, then re-import this CSV. Check that <strong>Parsed</strong>, <strong>To add</strong>, and <strong>Saved</strong> all show 2024, 2025, and 2026. Student names must match exactly (e.g. Chloe Parker).
            </p>
            {importResult.yearsInFile && importResult.yearsInFile.length === 1 && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                Only one year was detected. If your sheet has 2025/2026 too: in Google Sheets, select the date column (column A) → Format → Number → <strong>Plain text</strong>, then File → Download → CSV and re-import.
              </p>
            )}
            {importResult.toAddCountsByYear && importResult.countsByYear && ["2025", "2026"].some((yr) => (importResult.toAddCountsByYear![yr] ?? 0) > 0 && (importResult.countsByYear![yr] ?? 0) === 0) && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#991b1b", fontWeight: 600 }}>
                Some years were in the file but didn’t save (2025/2026 missing or low). Check the error below—copy the full message if you need to report it. Try <strong>Clear all lessons</strong> and re-import; if it happens again, share the error.
              </p>
            )}
          </>
        )}
        {importResult.errors.length > 0 && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: fail ? "#991b1b" : "#92400e", maxHeight: 120, overflowY: "auto", fontSize: 13 }}>
            {importResult.errors.slice(0, 10).map((err, i) => (<li key={i} style={{ marginBottom: 2 }}>{err}</li>))}
            {importResult.errors.length > 10 && <li>...and {importResult.errors.length - 10} more</li>}
          </ul>
        )}
      </div>
    );
  })() : null;

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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openCurrencyModal}
            style={{ minWidth: 40, paddingLeft: 8, paddingRight: 8 }}
            aria-label={t("settings.defaultCurrency")}
          >
            {currencySymbol}
          </Button>
          <LanguageSwitcher />
        </div>
      </div>

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
        <Button type="button" variant="secondary" size="md" onClick={handleLogOut} style={{ marginBottom: 8 }}>{t("settings.logOut")}</Button>
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setImportDataOpen((o) => !o)}>
            {t("settings.importData")}
          </Button>
        </div>
      </div>
      {importDataOpen && (
      <>
      <div className="float-card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setImportMatrixOpen((o) => !o)}
          fullWidth
          style={{ width: "100%", textAlign: "left", justifyContent: "flex-start", boxShadow: "none" }}
        >
          <span style={{ fontSize: 14 }}>{importMatrixOpen ? "▼" : "▶"}</span>
          {t("settings.importLessonsMatrix")}
        </Button>
        {importMatrixOpen && (
          <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13 }}>
            <p style={{ margin: "12px 0", fontSize: 13, color: "var(--text-muted)" }}>
              First row: student names. First column: dates in <strong>month-day-year</strong> format (e.g. 1/15/2024, 1-15-2025, or 2024-01-15). Use full dates with year so lessons go to the right year. Put &quot;Y&quot; if they attended. Students must already exist.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input
                ref={matrixFileInputRef}
                type="file"
                accept=".csv"
                onChange={handleMatrixImport}
                style={{ display: "none" }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => matrixFileInputRef.current?.click()}
                disabled={importing || clearingLessons}
                loading={importing}
              >
                {t("settings.importMatrix")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => downloadCsv("lessons-matrix-template.csv", getMatrixTemplateCsv())}
                leftIcon={<DownloadIcon size={7} />}
              >
                Template
              </Button>
            </div>
            {importProgressBar}
            {importResultBanner}
            <p style={{ margin: "16px 0 8px", fontSize: 13, color: "var(--text-muted)" }}>To fix wrong dates (e.g. everything in 2024): clear all lessons, then re-import your matrix CSV with full dates (1/15/2024, 1/15/2025). If it still shows only 2024, do a <strong>hard refresh</strong> (Ctrl+Shift+R or Cmd+Shift+R) or open the app in a private/incognito window so the latest code loads, then clear and re-import again.</p>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={clearingLessons}
              onClick={async () => {
                if (!window.confirm("Are you sure?")) return;
                if (!window.confirm("This will delete ALL lessons. This cannot be undone. You can re-import the attendance matrix after. Continue?")) return;
                setClearingLessons(true);
                try {
                  await clearAllLessons();
                  if (hasSupabase()) await reload();
                } catch (e) {
                  console.error(e);
                  window.alert(e instanceof Error ? e.message : "Failed to clear");
                } finally {
                  setClearingLessons(false);
                }
              }}
              loading={clearingLessons}
            >
              Clear all lessons
            </Button>
          </div>
        )}
      </div>
      </>
      )}

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
    </>
  );
}
