import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import { parseStudentCSV, rowToStudentWithError } from "@/utils/csvImport";
import { getCurrencyByCode, getStoredCurrencyCode } from "@/utils/currencies";
import type { DaySchedule, Student } from "@/types";

const DURATIONS = [30, 45, 60, 90, 120];
const DURATION_LABELS: Record<number, string> = { 30: "30 min", 45: "45 min", 60: "1 hr", 90: "1.5 hr", 120: "2 hr" };
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseTimeOfDay(s: string): { hour: number; minute: number; amPm: "AM" | "PM" } {
  const t = s.trim();
  if (!t || t === "—") return { hour: 5, minute: 0, amPm: "PM" };
  const match = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return { hour: 5, minute: 0, amPm: "PM" };
  let hour = parseInt(match[1]!, 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const period = (match[3] || "").toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const amPm = hour < 12 ? "AM" : "PM";
  return { hour: displayHour, minute: Math.min(59, Math.max(0, minute)), amPm };
}

export default function AddStudent() {
  const { data, addStudent, reload } = useStoreContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  // Schedule entries: each entry has its own day, duration, rate, time
  const [scheduleEntries, setScheduleEntries] = useState<{ id: number; dayOfWeek: number; durationMinutes: number; rateDollars: string; timeOfDay: string }[]>([
    { id: 1, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" },
  ]);
  let nextEntryId = scheduleEntries.length > 0 ? Math.max(...scheduleEntries.map((e) => e.id)) + 1 : 1;

  // Rate modal
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateModalDay, setRateModalDay] = useState(0);
  const [rateKeypadValue, setRateKeypadValue] = useState("");

  // Time picker
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerDay, setTimePickerDay] = useState(0);
  const [timePickerHour, setTimePickerHour] = useState(5);
  const [timePickerMinute, setTimePickerMinute] = useState(0);
  const [timePickerAmPm, setTimePickerAmPm] = useState<"AM" | "PM">("PM");

  const addScheduleEntry = () => {
    setScheduleEntries((prev) => [...prev, { id: nextEntryId, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" }]);
  };
  const removeScheduleEntry = (id: number) => {
    setScheduleEntries((prev) => prev.length <= 1 ? prev : prev.filter((e) => e.id !== id));
  };
  const updateEntry = (id: number, field: string, value: string | number) => {
    setScheduleEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) return;

    for (let i = 0; i < scheduleEntries.length; i++) {
      if (!scheduleEntries[i].rateDollars.trim()) {
        setError(`Please set a rate for lesson ${i + 1}.`);
        return;
      }
    }

    const primary = scheduleEntries[0];
    const primaryRateCents = Math.round(parseFloat(primary.rateDollars) * 100) || 0;
    const primaryTime = primary.timeOfDay.trim() || "\u2014";

    const additionalSchedules: DaySchedule[] = scheduleEntries.slice(1).map((entry) => ({
      dayOfWeek: entry.dayOfWeek,
      timeOfDay: entry.timeOfDay.trim() || "\u2014",
      durationMinutes: entry.durationMinutes,
      rateCents: Math.round(parseFloat(entry.rateDollars) * 100) || 0,
    }));

    const student: Student = {
      id: `s_${Date.now()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      durationMinutes: primary.durationMinutes,
      rateCents: primaryRateCents,
      dayOfWeek: primary.dayOfWeek,
      timeOfDay: primaryTime,
      additionalSchedules: additionalSchedules.length > 0 ? additionalSchedules : undefined,
    };
    try {
      await addStudent(student);
      navigate("/students");
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not add student. Try again.";
      setError(msg);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);
    setImportProgress(null);
    try {
      const text = await file.text();
      const parsed = parseStudentCSV(text);
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        setImportProgress(null);
        e.target.value = "";
        return;
      }
      const total = parsed.rows.length;
      setImportProgress({ current: 0, total });
      const existing = new Set(data.students.map((s) => `${s.firstName.toLowerCase()}|${s.lastName.toLowerCase()}`));
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (let i = 0; i < total; i++) {
        setImportProgress({ current: i + 1, total });
        const result = rowToStudentWithError(parsed.rows[i]);
        if (!result.ok) {
          skipped++;
          errors.push(`Row ${i + 2}: ${result.error}`);
          continue;
        }
        const studentData = result.data;
        const key = `${studentData.first_name.toLowerCase()}|${studentData.last_name.toLowerCase()}`;
        if (existing.has(key)) {
          skipped++;
          errors.push(`Row ${i + 2}: ${studentData.first_name} ${studentData.last_name} already exists`);
          continue;
        }
        try {
          await addStudent({
            id: `s_${Date.now()}_${i}`,
            firstName: studentData.first_name,
            lastName: studentData.last_name,
            durationMinutes: studentData.duration_minutes,
            rateCents: studentData.rate_cents,
            dayOfWeek: studentData.day_of_week,
            timeOfDay: studentData.time_of_day,
          });
          existing.add(key);
          imported++;
        } catch (err: unknown) {
          skipped++;
          console.error(`Import row ${i + 2} failed:`, err);
          let msg = "Failed to save";
          if (err instanceof Error) msg = err.message;
          else if (typeof err === "object" && err !== null && "message" in err) msg = String((err as Record<string, unknown>).message);
          else if (typeof err === "string") msg = err;
          else msg = JSON.stringify(err) ?? "Unknown error";
          errors.push(`Row ${i + 2}: ${msg}`);
        }
      }
      setImportResult({ imported, skipped, errors });
      if (imported > 0 && hasSupabase()) await reload();
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
      setImportProgress(null);
      e.target.value = "";
    }
  };

  const fontStyle = { fontFamily: "var(--font-sans)" };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, ...fontStyle };
  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 8, fontWeight: 600, ...fontStyle };
  const currencySymbol = getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$";

  // rateModalDay / timePickerDay now store the entry ID (not day index)
  const openRateModal = (entryId: number) => {
    setRateModalDay(entryId);
    const entry = scheduleEntries.find((e) => e.id === entryId);
    setRateKeypadValue(entry?.rateDollars || "");
    setRateModalOpen(true);
  };
  const applyRate = () => {
    const v = rateKeypadValue.trim();
    if (v !== "" && !Number.isNaN(Number(v))) updateEntry(rateModalDay, "rateDollars", v);
    setRateModalOpen(false);
  };
  const openTimePicker = (entryId: number) => {
    setTimePickerDay(entryId);
    const entry = scheduleEntries.find((e) => e.id === entryId);
    const parsed = parseTimeOfDay(entry?.timeOfDay || "");
    setTimePickerHour(parsed.hour);
    setTimePickerMinute(parsed.minute);
    setTimePickerAmPm(parsed.amPm);
    setTimePickerOpen(true);
  };
  const applyTime = () => {
    updateEntry(timePickerDay, "timeOfDay", `${timePickerHour}:${String(timePickerMinute).padStart(2, "0")} ${timePickerAmPm}`);
    setTimePickerOpen(false);
  };

  return (
    <>
      <Link to="/students" style={{ display: "inline-flex", marginBottom: 24, color: "var(--text)", textDecoration: "none", ...fontStyle }}>&larr; {t("common.back")}</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, ...fontStyle }}>{t("addStudent.title")}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="pill" style={{ minHeight: 40, ...fontStyle }} title={t("students.importStudents")}>
            {importing ? "..." : t("students.importStudents")}
          </button>
        </div>
      </div>
      {importing && importProgress && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, background: "var(--card)", border: "1px solid var(--border)", fontSize: 14, ...fontStyle }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>Importing students... {importProgress.current} of {importProgress.total}</p>
          <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`, height: "100%", borderRadius: 4, background: "#c97b94", transition: "width 0.2s ease" }} />
          </div>
        </div>
      )}
      {importResult && !importing && (() => {
        const success = importResult.imported > 0 && importResult.errors.length === 0;
        const partial = importResult.imported > 0 && importResult.errors.length > 0;
        const fail = importResult.imported === 0 && importResult.errors.length > 0;
        return (
          <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, fontSize: 14, ...fontStyle, background: success ? "#f0fdf4" : fail ? "#fef2f2" : "#fffbeb", border: `1px solid ${success ? "#bbf7d0" : fail ? "#fecaca" : "#fde68a"}` }}>
            <p style={{ margin: 0, fontWeight: 700, color: success ? "#166534" : fail ? "#991b1b" : "#92400e" }}>
              {success ? `Success! Imported ${importResult.imported} student${importResult.imported !== 1 ? "s" : ""}.` : partial ? `Partially imported: ${importResult.imported} added, ${importResult.skipped} skipped.` : `Import failed — ${importResult.skipped} student${importResult.skipped !== 1 ? "s" : ""} skipped.`}
            </p>
            {importResult.errors.length > 0 && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: fail ? "#991b1b" : "#92400e", maxHeight: 120, overflowY: "auto", fontSize: 13 }}>
                {importResult.errors.slice(0, 8).map((err, i) => (<li key={i} style={{ marginBottom: 2 }}>{err}</li>))}
                {importResult.errors.length > 8 && <li>...and {importResult.errors.length - 8} more</li>}
              </ul>
            )}
          </div>
        );
      })()}
      <form onSubmit={handleSave}>
        <label style={labelStyle}>{t("addStudent.firstName")}</label>
        <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("addStudent.firstName")} style={inputStyle} required />
        <label style={labelStyle}>{t("addStudent.lastName")}</label>
        <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("addStudent.lastName")} style={inputStyle} required />

        {/* Schedule entries */}
        {scheduleEntries.map((entry) => (
          <div key={entry.id} style={{ marginBottom: 20, padding: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, ...fontStyle }}>{DAYS_FULL[entry.dayOfWeek]} Lesson</span>
              {scheduleEntries.length > 1 && (
                <button type="button" onClick={() => removeScheduleEntry(entry.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#dc2626", padding: "4px 8px", fontWeight: 600, ...fontStyle }}>Delete Day</button>
              )}
            </div>
            <label style={labelStyle}>{t("addStudent.dayOfWeek")}</label>
            <div style={{ display: "flex", flexWrap: "nowrap", gap: 4, marginBottom: 16 }}>
              {DAY_SHORT.map((label, i) => (
                <button key={i} type="button" onClick={() => updateEntry(entry.id, "dayOfWeek", i)} className={entry.dayOfWeek === i ? "pill pill--active" : "pill"} style={{ flex: "1 1 0", minWidth: 0, padding: "8px 2px", fontSize: 13, textAlign: "center", ...fontStyle }}>
                  {label}
                </button>
              ))}
            </div>
            <label style={labelStyle}>{t("addStudent.lessonDuration")}</label>
            <div style={{ display: "flex", flexWrap: "nowrap", gap: 4, marginBottom: 16 }}>
              {DURATIONS.map((m) => (
                <button key={m} type="button" onClick={() => updateEntry(entry.id, "durationMinutes", m)} className={entry.durationMinutes === m ? "pill pill--active" : "pill"} style={{ flex: "1 1 0", minWidth: 0, padding: "8px 2px", fontSize: 13, textAlign: "center", ...fontStyle }}>
                  {DURATION_LABELS[m]}
                </button>
              ))}
            </div>
            <label style={labelStyle}>{t("common.rate")}</label>
            <button type="button" onClick={() => openRateModal(entry.id)} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
              {entry.rateDollars ? `${currencySymbol}${entry.rateDollars}` : `${currencySymbol}0`}
            </button>
            <label style={labelStyle}>{t("common.time")}</label>
            <button type="button" onClick={() => openTimePicker(entry.id)} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 0, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
              {entry.timeOfDay || "5:00 PM"}
            </button>
          </div>
        ))}
        <button type="button" onClick={addScheduleEntry} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 20, ...fontStyle }}>
          + Day
        </button>

        {error ? <p style={{ color: "#dc2626", marginBottom: 16, ...fontStyle }}>{error}</p> : null}
        <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 24, ...fontStyle }}>{t("common.save")}</button>
      </form>

      {rateModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setRateModalOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button type="button" onClick={() => setRateModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>&times;</button>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>{scheduleEntries.length > 1 ? `${DAY_SHORT[scheduleEntries.find((e) => e.id === rateModalDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}{t("common.rate")}</p>
            <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>
              {currencySymbol}{rateKeypadValue || "0"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} type="button" onClick={() => setRateKeypadValue((v) => v + n)} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>{n}</button>
              ))}
              <button type="button" onClick={() => setRateKeypadValue((v) => (v.includes(".") ? v : v + "."))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, cursor: "pointer", ...fontStyle }}>.</button>
              <button type="button" onClick={() => setRateKeypadValue((v) => v + "0")} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>0</button>
              <button type="button" onClick={() => setRateKeypadValue((v) => v.slice(0, -1))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(180, 160, 180, 0.12)", fontSize: 18, cursor: "pointer", ...fontStyle }}>&larr;</button>
            </div>
            <button type="button" onClick={applyRate} className="btn btn-primary" style={{ width: "100%", ...fontStyle }}>{t("common.setRate")}</button>
          </div>
        </div>
      )}

      {timePickerOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setTimePickerOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button type="button" onClick={() => setTimePickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>&times;</button>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>{scheduleEntries.length > 1 ? `${DAY_SHORT[scheduleEntries.find((e) => e.id === timePickerDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}{t("common.selectTime")}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <select value={timePickerHour} onChange={(e) => setTimePickerHour(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                  {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (<option key={h} value={h}>{h}</option>))}
                </select>
                <span style={{ fontSize: 18, fontWeight: 600 }}>:</span>
                <select value={timePickerMinute} onChange={(e) => setTimePickerMinute(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}</option>))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button type="button" onClick={() => setTimePickerAmPm("AM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: timePickerAmPm === "AM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>AM</button>
                <button type="button" onClick={() => setTimePickerAmPm("PM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: timePickerAmPm === "PM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>PM</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setTimePickerOpen(false)} style={{ padding: "10px 20px", background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", ...fontStyle }}>{t("common.cancel")}</button>
              <button type="button" onClick={applyTime} className="btn btn-primary" style={{ padding: "10px 20px", ...fontStyle }}>{t("common.ok")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
