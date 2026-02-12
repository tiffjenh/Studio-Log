import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { hasSupabase } from "@/lib/supabase";
import { updatePasswordSupabase, updateEmailSupabase } from "@/store/supabaseSync";
import { parseLessonCSV, parseLessonMatrixCSV, rowToLesson, type ImportResult } from "@/utils/csvImport";
import { filterCurrencies, getCurrencyByCode, getStoredCurrencyCode, setStoredCurrencyCode } from "@/utils/currencies";
import { getLessonForStudentOnDate } from "@/utils/earnings";
import type { Student } from "@/types";

export default function Settings() {
  const { data, setUser, updateUserProfile, addLesson, updateLesson } = useStoreContext();
  const navigate = useNavigate();
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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [importDataOpen, setImportDataOpen] = useState(false);
  const [importMatrixOpen, setImportMatrixOpen] = useState(false);
  const [importRowOpen, setImportRowOpen] = useState(false);
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState(() => getStoredCurrencyCode());
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");

  const handleSave = async (field: "name" | "email") => {
    if (!user) return;
    setEmailChangeMessage(null);
    if (field === "name" && hasSupabase()) {
      await updateUserProfile({ name });
    } else if (field === "email" && hasSupabase()) {
      const newEmail = email.trim();
      if (newEmail === user.email) {
        setEditing(null);
        return;
      }
      const { error } = await updateEmailSupabase(newEmail);
      if (error) {
        setSaveError(error);
        return;
      }
      // Supabase sends a confirmation link to the NEW email; the change only applies after they click it.
      // Do not update local state yet — show instructions instead.
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
        } catch {
          skipped++;
          errors.push(`Failed: ${name} on ${date}`);
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

  return (
    <>
      <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, marginBottom: 24 }}>Settings</h1>
      {!hasSupabase() && (
        <p style={{ marginBottom: 24, fontSize: 14, color: "var(--text-muted)" }}>
          Using local storage. Add Supabase to sync across browsers (see SETUP-SUPABASE.md).
        </p>
      )}
      <div className="float-card" style={{ marginBottom: 24 }}>
        <div style={rowStyle}>
          <span style={{ flex: 1 }}>Name</span>
          {editing === "name" ? (
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} onBlur={() => handleSave("name")} autoFocus />
          ) : (
            <span style={{ flex: 2 }}>{user.name}</span>
          )}
          <button type="button" onClick={() => (editing === "name" ? handleSave("name") : setEditing("name"))} style={{ marginLeft: 8, color: "var(--text)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            {editing === "name" ? "Save" : "Edit"}
          </button>
        </div>
        <div style={rowStyle}>
          <span style={{ flex: 1 }}>Email</span>
          {editing === "email" ? (
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} onBlur={() => handleSave("email")} autoFocus />
          ) : (
            <span style={{ flex: 2 }}>{user.email}</span>
          )}
          <button type="button" onClick={() => { if (editing === "email") handleSave("email"); else { setEmailChangeMessage(null); setEditing("email"); } }} style={{ marginLeft: 8, color: "var(--text)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            {editing === "email" ? "Save" : "Edit"}
          </button>
        </div>
        {saveError ? <p style={{ color: "#dc2626", marginTop: 8, marginBottom: 0 }}>{saveError}</p> : null}
        {emailChangeMessage === "success" && editing !== "email" && (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "var(--text-muted)" }}>
            Check the inbox for <strong>{email.trim()}</strong> (and spam folder). Click the link in the email from Supabase to confirm the change. Your email here will update after you confirm. If you don’t see it, wait a minute and try again (rate limit: one request per 60 seconds).
          </p>
        )}
        <div style={{ ...rowStyle, borderBottom: "none" }}>
          <span style={{ flex: 1 }}>Password</span>
          {editing === "password" ? (
            <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
                autoFocus
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
              />
              {passwordError && <span style={{ fontSize: 13, color: "#dc2626" }}>{passwordError}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={handleChangePassword} style={{ padding: "8px 14px", color: "white", fontWeight: 600, background: "var(--accent-gradient)", border: "none", borderRadius: 8, cursor: "pointer" }}>Save</button>
                <button type="button" onClick={() => { setEditing(null); setNewPassword(""); setConfirmPassword(""); setPasswordError(""); }} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <span style={{ flex: 2 }}>••••••••</span>
              <button type="button" onClick={() => { setPasswordError(""); setEditing("password"); }} style={{ marginLeft: 8, color: "var(--text)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Edit</button>
            </>
          )}
        </div>
      </div>
      <div className="float-card" style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontFamily: "var(--font-sans)" }}>Default currency</label>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Used when entering rates on Add student and Edit student.</p>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => { setCurrencyDropdownOpen((o) => !o); setCurrencySearch(""); }}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", textAlign: "left", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-sans)" }}
          >
            {getCurrencyByCode(defaultCurrencyCode)?.symbol ?? "$"} {defaultCurrencyCode} – {getCurrencyByCode(defaultCurrencyCode)?.name ?? "US Dollar"}
          </button>
          {currencyDropdownOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-elevated)", maxHeight: 220, overflow: "hidden", zIndex: 10 }}>
              <input type="text" value={currencySearch} onChange={(e) => setCurrencySearch(e.target.value)} placeholder="Search currency..." style={{ width: "100%", padding: "10px 12px", border: "none", borderBottom: "1px solid var(--border)", fontSize: 14, fontFamily: "var(--font-sans)" }} autoFocus />
              <div style={{ maxHeight: 180, overflowY: "auto" }}>
                {filterCurrencies(currencySearch).map((c) => (
                  <button key={c.code} type="button" onClick={() => { setStoredCurrencyCode(c.code); setDefaultCurrencyCode(c.code); setCurrencyDropdownOpen(false); }} style={{ width: "100%", padding: "10px 12px", border: "none", background: defaultCurrencyCode === c.code ? "rgba(201, 123, 148, 0.15)" : "transparent", textAlign: "left", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-sans)" }}>
                    {c.symbol} {c.code} – {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <button type="button" className="pill" style={{ width: "auto", padding: "10px 20px", marginBottom: 8, borderRadius: "var(--radius-pill)", background: "transparent", border: "2px solid #fff", color: "var(--text)", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }} onClick={handleLogOut}>Log Out</button>
        <div>
          <button type="button" onClick={() => setImportDataOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-muted)", textDecoration: "underline" }}>
            Import Data
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
          Import lessons (attendance matrix)
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
                {importing ? "Importing…" : "Import matrix"}
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
          Import lessons (row format)
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
              {importing ? "Importing…" : "Import CSV"}
            </button>
          </div>
        )}
      </div>
      </>
      )}
    </>
  );
}
