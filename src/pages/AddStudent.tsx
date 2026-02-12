import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { parseStudentCSV, rowToStudent } from "@/utils/csvImport";
import { getCurrencyByCode, getStoredCurrencyCode } from "@/utils/currencies";
import type { Student } from "@/types";

const DURATIONS = [30, 45, 60, 90, 120];
const DURATION_LABELS: Record<number, string> = { 30: "30 min", 45: "45 min", 60: "1 hr", 90: "1.5 hr", 120: "2 hr" };
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const { data, addStudent } = useStoreContext();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [rateDollars, setRateDollars] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [rateKeypadValue, setRateKeypadValue] = useState("");
  const [timePickerHour, setTimePickerHour] = useState(5);
  const [timePickerMinute, setTimePickerMinute] = useState(0);
  const [timePickerAmPm, setTimePickerAmPm] = useState<"AM" | "PM">("PM");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim() || !rateDollars.trim()) return;
    const trimmed = timeOfDay.trim();
    if (trimmed && trimmed !== "—" && !/am|pm/i.test(trimmed)) {
      setError("Time must include AM or PM (e.g. 5:00 PM)");
      return;
    }
    const rateCents = Math.round(parseFloat(rateDollars) * 100) || 0;
    const student: Student = {
      id: `s_${Date.now()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      durationMinutes,
      rateCents,
      dayOfWeek,
      timeOfDay: trimmed || "—",
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
    try {
      const text = await file.text();
      const parsed = parseStudentCSV(text);
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        e.target.value = "";
        return;
      }
      const existing = new Set(data.students.map((s) => `${s.firstName.toLowerCase()}|${s.lastName.toLowerCase()}`));
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (let i = 0; i < parsed.rows.length; i++) {
        const studentData = rowToStudent(parsed.rows[i]);
        if (!studentData) {
          skipped++;
          errors.push(`Row ${i + 2}: Invalid or missing data`);
          continue;
        }
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

  const fontStyle = { fontFamily: "var(--font-sans)" };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, ...fontStyle };
  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 8, fontWeight: 600, ...fontStyle };
  const rowStyle: React.CSSProperties = { display: "flex", flexWrap: "nowrap", gap: 6, marginBottom: 16, minWidth: 0 };

  const openRateModal = () => {
    setRateKeypadValue(rateDollars || "");
    setRateModalOpen(true);
  };
  const applyRate = () => {
    const v = rateKeypadValue.trim();
    if (v !== "" && !Number.isNaN(Number(v))) setRateDollars(v);
    setRateModalOpen(false);
  };
  const openTimePicker = () => {
    const parsed = parseTimeOfDay(timeOfDay);
    setTimePickerHour(parsed.hour);
    setTimePickerMinute(parsed.minute);
    setTimePickerAmPm(parsed.amPm);
    setTimePickerOpen(true);
  };
  const applyTime = () => {
    const displayHour = timePickerHour;
    const displayMin = String(timePickerMinute).padStart(2, "0");
    setTimeOfDay(`${displayHour}:${displayMin} ${timePickerAmPm}`);
    setTimePickerOpen(false);
  };

  return (
    <>
      <Link to="/students" style={{ display: "inline-flex", marginBottom: 24, color: "var(--text)", textDecoration: "none", ...fontStyle }}>← Back</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, ...fontStyle }}>Add Student</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="pill" style={{ minHeight: 40, ...fontStyle }} title="Import students from CSV">
            {importing ? "…" : "Import students"}
          </button>
        </div>
      </div>
      {importResult && (
        <div style={{ marginBottom: 24, padding: 12, borderRadius: 12, background: "var(--card)", border: "1px solid var(--border)", fontSize: 14, ...fontStyle }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Imported {importResult.imported} students, skipped {importResult.skipped}</p>
          {importResult.errors.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "var(--text-muted)", maxHeight: 100, overflowY: "auto" }}>
              {importResult.errors.slice(0, 8).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {importResult.errors.length > 8 && <li>…and {importResult.errors.length - 8} more</li>}
            </ul>
          )}
        </div>
      )}
      <form onSubmit={handleSave}>
        <label style={labelStyle}>First name</label>
        <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} required />
        <label style={labelStyle}>Last name</label>
        <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} required />
        <label style={labelStyle}>Lesson duration</label>
        <div style={rowStyle}>
          {DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setDurationMinutes(m)}
              className={durationMinutes === m ? "pill pill--active" : "pill"}
              style={{ padding: "8px 12px", fontSize: 14, flexShrink: 0, ...fontStyle }}
            >
              {DURATION_LABELS[m]}
            </button>
          ))}
        </div>
        <label style={labelStyle}>Rate</label>
        <button type="button" onClick={openRateModal} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
          {rateDollars ? `${getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$"}${rateDollars}` : (getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$") + "0"}
        </button>
        <label style={labelStyle}>Day of week</label>
        <div style={rowStyle}>
          {DAY_SHORT.map((label, i) => (
            <button key={i} type="button" onClick={() => setDayOfWeek(i)} className={dayOfWeek === i ? "pill pill--active" : "pill"} style={{ padding: "8px 10px", fontSize: 13, flexShrink: 0, ...fontStyle }}>
              {label}
            </button>
          ))}
        </div>
        <label style={labelStyle}>Time</label>
        <button type="button" onClick={openTimePicker} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
          {timeOfDay || "5:00 PM"}
        </button>
        {error ? <p style={{ color: "#dc2626", marginBottom: 16, ...fontStyle }}>{error}</p> : null}
        <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 24, ...fontStyle }}>Save</button>
      </form>

      {rateModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setRateModalOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button type="button" onClick={() => setRateModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>×</button>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>Rate (currency set in Settings)</p>
            <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>
              {(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{rateKeypadValue || "0"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} type="button" onClick={() => setRateKeypadValue((v) => v + n)} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>
                  {n}
                </button>
              ))}
              <button type="button" onClick={() => setRateKeypadValue((v) => (v.includes(".") ? v : v + "."))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, cursor: "pointer", ...fontStyle }}>.</button>
              <button type="button" onClick={() => setRateKeypadValue((v) => v + "0")} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>0</button>
              <button type="button" onClick={() => setRateKeypadValue((v) => v.slice(0, -1))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(180, 160, 180, 0.12)", fontSize: 18, cursor: "pointer", ...fontStyle }}>←</button>
            </div>
            <button type="button" onClick={applyRate} className="btn btn-primary" style={{ width: "100%", ...fontStyle }}>Set rate</button>
          </div>
        </div>
      )}

      {timePickerOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setTimePickerOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button type="button" onClick={() => setTimePickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>×</button>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>Select time</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <select value={timePickerHour} onChange={(e) => setTimePickerHour(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                  {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span style={{ fontSize: 18, fontWeight: 600 }}>:</span>
                <select value={timePickerMinute} onChange={(e) => setTimePickerMinute(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button type="button" onClick={() => setTimePickerAmPm("AM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: timePickerAmPm === "AM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>AM</button>
                <button type="button" onClick={() => setTimePickerAmPm("PM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: timePickerAmPm === "PM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>PM</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setTimePickerOpen(false)} style={{ padding: "10px 20px", background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", ...fontStyle }}>Cancel</button>
              <button type="button" onClick={applyTime} className="btn btn-primary" style={{ padding: "10px 20px", ...fontStyle }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
