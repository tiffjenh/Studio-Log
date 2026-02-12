import { useState, useEffect, Fragment } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { formatCurrency, getEffectiveSchedule, getDayOfWeekFromDateKey } from "@/utils/earnings";
import { getCurrencyByCode, getStoredCurrencyCode } from "@/utils/currencies";
import DatePicker from "@/components/DatePicker";
import StudentAvatar from "@/components/StudentAvatar";
import type { Student, Lesson } from "@/types";

const DURATIONS = [30, 45, 60, 90, 120];
const DURATION_LABELS: Record<number, string> = { 30: "30 min", 45: "45 min", 60: "1 hr", 90: "1.5 hr", 120: "2 hr" };
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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

function formatDuration(mins: number): string {
  return mins === 60 ? "1 hour" : mins === 90 ? "1.5 hours" : mins === 120 ? "2 hours" : `${mins} min`;
}

/** Parse "5:00pm" / "5:00 PM" style to minutes from midnight; return null if unparseable. */
function parseTimeToMinutes(t: string): number | null {
  if (!t || t.trim() === "" || t === "—") return null;
  const s = t.trim().toLowerCase();
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1]!, 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3];
  if (period === "pm" && hours !== 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  if (!period && hours < 12) hours += 12;
  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h >= 12 ? "pm" : "am";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m > 0 ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
}

/** Compact range e.g. "5-6pm". */
function formatCompactTimeRange(startTimeStr: string, durationMinutes: number): string {
  const startMins = parseTimeToMinutes(startTimeStr);
  if (startMins == null) return "—";
  const endMins = startMins + durationMinutes;
  const h1 = Math.floor(startMins / 60) % 24;
  const h2 = Math.floor(endMins / 60) % 24;
  const period = h1 >= 12 ? "pm" : "am";
  const hour1 = h1 === 0 ? 12 : h1 > 12 ? h1 - 12 : h1;
  const hour2 = h2 === 0 ? 12 : h2 > 12 ? h2 - 12 : h2;
  const m1 = startMins % 60;
  const m2 = endMins % 60;
  if (m1 === 0 && m2 === 0) return `${hour1}-${hour2}${period}`;
  return `${formatMinutesToTime(startMins)} - ${formatMinutesToTime(endMins)}`;
}

/** Count how many times a given day of week (0–6) appears between start and end (inclusive). */
function countDaysWithDayOfWeek(start: Date, end: Date, dayOfWeek: number): number {
  const startCopy = new Date(start);
  startCopy.setHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setHours(23, 59, 59, 999);
  let count = 0;
  const d = new Date(startCopy);
  while (d <= endCopy) {
    if (d.getDay() === dayOfWeek) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, updateStudent, deleteStudent } = useStoreContext();
  const student = data.students.find((s) => s.id === id);
  const completedForStudent = data.lessons.filter((l) => l.studentId === id && l.completed);
  const studentLessons =
    student == null
      ? completedForStudent
      : completedForStudent.filter(
          (l) => getDayOfWeekFromDateKey(l.date) === getEffectiveSchedule(student, l.date).dayOfWeek
        );
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonthPrefix = `${thisYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisYearLessons = studentLessons.filter((l) => l.date.startsWith(String(thisYear)));
  const thisMonthLessons = studentLessons.filter((l) => l.date.startsWith(thisMonthPrefix));
  const earningsThisMonth = thisMonthLessons.reduce((sum, l) => sum + l.amountCents, 0);
  const earningsYTD = studentLessons.reduce((sum, l) => sum + l.amountCents, 0);
  const monthLabel = now.toLocaleDateString("en-US", { month: "short" });
  const availableThisMonth =
    student != null
      ? countDaysWithDayOfWeek(
          new Date(now.getFullYear(), now.getMonth(), 1),
          new Date(now.getFullYear(), now.getMonth() + 1, 0),
          student.dayOfWeek
        )
      : 0;
  const availableThisYear =
    student != null ? countDaysWithDayOfWeek(new Date(thisYear, 0, 1), now, student.dayOfWeek) : 0;

  const [editing, setEditing] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState(student?.firstName ?? "");
  const [lastName, setLastName] = useState(student?.lastName ?? "");
  const [durationMinutes, setDurationMinutes] = useState(student?.durationMinutes ?? 60);
  const [rateDollars, setRateDollars] = useState(student ? String((student.rateCents / 100).toFixed(2)) : "");
  const [dayOfWeek, setDayOfWeek] = useState(student?.dayOfWeek ?? 1);
  const [timeOfDay, setTimeOfDay] = useState(student?.timeOfDay ?? "");
  const [scheduleChangeFromDate, setScheduleChangeFromDate] = useState(student?.scheduleChangeFromDate ?? "");
  const [scheduleChangeDayOfWeek, setScheduleChangeDayOfWeek] = useState<number | undefined>(student?.scheduleChangeDayOfWeek);
  const [scheduleChangeTimeOfDay, setScheduleChangeTimeOfDay] = useState(student?.scheduleChangeTimeOfDay ?? "");
  const [scheduleChangeDurationMinutes, setScheduleChangeDurationMinutes] = useState<number | undefined>(student?.scheduleChangeDurationMinutes);
  const [scheduleChangeRateDollars, setScheduleChangeRateDollars] = useState(student?.scheduleChangeRateCents != null ? String((student.scheduleChangeRateCents / 100).toFixed(2)) : "");
  const [terminatedFromDate, setTerminatedFromDate] = useState(student?.terminatedFromDate ?? "");
  const [changeScheduleOpen, setChangeScheduleOpen] = useState(false);
  const [terminateStudentOpen, setTerminateStudentOpen] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateKeypadValue, setRateKeypadValue] = useState("");
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerHour, setTimePickerHour] = useState(5);
  const [timePickerMinute, setTimePickerMinute] = useState(0);
  const [timePickerAmPm, setTimePickerAmPm] = useState<"AM" | "PM">("PM");
  const [scheduleChangeRateModalOpen, setScheduleChangeRateModalOpen] = useState(false);
  const [scheduleChangeRateKeypadValue, setScheduleChangeRateKeypadValue] = useState("");
  const [scheduleChangeTimePickerOpen, setScheduleChangeTimePickerOpen] = useState(false);
  const [scheduleChangeTimePickerHour, setScheduleChangeTimePickerHour] = useState(5);
  const [scheduleChangeTimePickerMinute, setScheduleChangeTimePickerMinute] = useState(0);
  const [scheduleChangeTimePickerAmPm, setScheduleChangeTimePickerAmPm] = useState<"AM" | "PM">("PM");

  useEffect(() => {
    if (student) {
      setEditing(false);
      setFirstName(student.firstName);
      setLastName(student.lastName);
      setDurationMinutes(student.durationMinutes);
      setRateDollars(String((student.rateCents / 100).toFixed(2)));
      setDayOfWeek(student.dayOfWeek);
      setTimeOfDay(student.timeOfDay);
      setScheduleChangeFromDate(student.scheduleChangeFromDate ?? "");
      setScheduleChangeDayOfWeek(student.scheduleChangeDayOfWeek);
      setScheduleChangeTimeOfDay(student.scheduleChangeTimeOfDay ?? "");
      setScheduleChangeDurationMinutes(student.scheduleChangeDurationMinutes);
      setScheduleChangeRateDollars(student.scheduleChangeRateCents != null ? String((student.scheduleChangeRateCents / 100).toFixed(2)) : "");
      setTerminatedFromDate(student.terminatedFromDate ?? "");
    }
  }, [id]);

  if (!student) return <p style={{ padding: 24 }}>Student not found</p>;

  const syncFormFromStudent = () => {
    setFirstName(student.firstName);
    setLastName(student.lastName);
    setDurationMinutes(student.durationMinutes);
    setRateDollars(String((student.rateCents / 100).toFixed(2)));
    setDayOfWeek(student.dayOfWeek);
    setTimeOfDay(student.timeOfDay);
    setScheduleChangeFromDate(student.scheduleChangeFromDate ?? "");
    setScheduleChangeDayOfWeek(student.scheduleChangeDayOfWeek);
    setScheduleChangeTimeOfDay(student.scheduleChangeTimeOfDay ?? "");
    setScheduleChangeDurationMinutes(student.scheduleChangeDurationMinutes);
    setScheduleChangeRateDollars(student.scheduleChangeRateCents != null ? String((student.scheduleChangeRateCents / 100).toFixed(2)) : "");
    setTerminatedFromDate(student.terminatedFromDate ?? "");
  };

  const handleStartEdit = () => {
    syncFormFromStudent();
    setError("");
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim() || !rateDollars.trim()) return;
    const trimmed = timeOfDay.trim();
    if (trimmed && trimmed !== "—" && !/am|pm/i.test(trimmed)) {
      setError("Time must include AM or PM (e.g. 5:00 PM)");
      return;
    }
    const fromDateTrimmed = scheduleChangeFromDate.trim();
    if (fromDateTrimmed && (scheduleChangeDayOfWeek == null || scheduleChangeTimeOfDay.trim() === "")) {
      setError("If you set a \"From date\" for schedule change, please select day of week and time.");
      return;
    }
    const scheduleTimeTrimmed = scheduleChangeTimeOfDay.trim();
    if (fromDateTrimmed && scheduleTimeTrimmed && scheduleTimeTrimmed !== "—" && !/am|pm/i.test(scheduleTimeTrimmed)) {
      setError("Schedule change time must include AM or PM (e.g. 5:00 PM).");
      return;
    }
    const rateCents = Math.round(parseFloat(rateDollars) * 100) || 0;
    const scheduleChangeRateCents = scheduleChangeRateDollars.trim() ? Math.round(parseFloat(scheduleChangeRateDollars) * 100) || undefined : undefined;
    const updates: Partial<Student> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      durationMinutes,
      rateCents,
      dayOfWeek,
      timeOfDay: trimmed || "—",
      scheduleChangeFromDate: fromDateTrimmed || undefined,
      scheduleChangeDayOfWeek: fromDateTrimmed && scheduleChangeDayOfWeek != null ? scheduleChangeDayOfWeek : undefined,
      scheduleChangeTimeOfDay: fromDateTrimmed && scheduleTimeTrimmed ? (scheduleTimeTrimmed === "—" ? "—" : scheduleTimeTrimmed) : undefined,
      scheduleChangeDurationMinutes: fromDateTrimmed && scheduleChangeDurationMinutes != null ? scheduleChangeDurationMinutes : undefined,
      scheduleChangeRateCents: fromDateTrimmed && scheduleChangeRateCents != null ? scheduleChangeRateCents : undefined,
      terminatedFromDate: terminatedFromDate.trim() || undefined,
    };
    try {
      await updateStudent(student.id, updates);
      setEditing(false);
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not save. Try again.";
      setError(msg);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${student.firstName} ${student.lastName}? This will also remove all their lessons.`)) return;
    setError("");
    try {
      await deleteStudent(student.id);
      navigate("/students");
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not delete. Try again.";
      setError(msg);
    }
  };

  const fontStyle = { fontFamily: "var(--font-sans)" };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, ...fontStyle };
  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 8, fontWeight: 600, ...fontStyle };
  const rowStyle: React.CSSProperties = { display: "flex", flexWrap: "nowrap", gap: 6, marginBottom: 16, minWidth: 0 };

  const openRateModal = () => { setRateKeypadValue(rateDollars || ""); setRateModalOpen(true); };
  const applyRate = () => { const v = rateKeypadValue.trim(); if (v !== "" && !Number.isNaN(Number(v))) setRateDollars(v); setRateModalOpen(false); };
  const openTimePicker = () => { const p = parseTimeOfDay(timeOfDay); setTimePickerHour(p.hour); setTimePickerMinute(p.minute); setTimePickerAmPm(p.amPm); setTimePickerOpen(true); };
  const applyTime = () => { const displayHour = timePickerHour; const displayMin = String(timePickerMinute).padStart(2, "0"); setTimeOfDay(`${displayHour}:${displayMin} ${timePickerAmPm}`); setTimePickerOpen(false); };

  const openScheduleChangeRateModal = () => { setScheduleChangeRateKeypadValue(scheduleChangeRateDollars || ""); setScheduleChangeRateModalOpen(true); };
  const applyScheduleChangeRate = () => { const v = scheduleChangeRateKeypadValue.trim(); if (v !== "" && !Number.isNaN(Number(v))) setScheduleChangeRateDollars(v); setScheduleChangeRateModalOpen(false); };
  const openScheduleChangeTimePicker = () => { const p = parseTimeOfDay(scheduleChangeTimeOfDay); setScheduleChangeTimePickerHour(p.hour); setScheduleChangeTimePickerMinute(p.minute); setScheduleChangeTimePickerAmPm(p.amPm); setScheduleChangeTimePickerOpen(true); };
  const applyScheduleChangeTime = () => { const displayHour = scheduleChangeTimePickerHour; const displayMin = String(scheduleChangeTimePickerMinute).padStart(2, "0"); setScheduleChangeTimeOfDay(`${displayHour}:${displayMin} ${scheduleChangeTimePickerAmPm}`); setScheduleChangeTimePickerOpen(false); };

  return (
    <>
      <Link to="/students" style={{ display: "inline-flex", alignItems: "center", marginBottom: 20, color: "var(--text)", textDecoration: "none", fontSize: 15 }}>← Back</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <StudentAvatar student={student} size={48} />
          <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0 }}>{student.firstName} {student.lastName}</h1>
        </div>
        {!editing ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={handleStartEdit} className="pill pill--active" style={{ padding: "10px 18px" }}>Edit</button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div>
        <form onSubmit={handleSaveEdit} className="float-card" style={{ marginBottom: 28, ...fontStyle }}>
          <label style={labelStyle}>First name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} required />
          <label style={labelStyle}>Last name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} required />
          <label style={labelStyle}>Lesson duration</label>
          <div style={rowStyle}>
            {DURATIONS.map((m) => (
              <button key={m} type="button" onClick={() => setDurationMinutes(m)} className={durationMinutes === m ? "pill pill--active" : "pill"} style={{ padding: "8px 12px", fontSize: 14, flexShrink: 0, ...fontStyle }}>
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
              <button key={i} type="button" onClick={() => setDayOfWeek(i)} className={dayOfWeek === i ? "pill pill--active" : "pill"} style={{ padding: "8px 10px", fontSize: 13, flexShrink: 0, ...fontStyle }}>{label}</button>
            ))}
          </div>
          <label style={labelStyle}>Time</label>
          <button type="button" onClick={openTimePicker} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
            {timeOfDay || "5:00 PM"}
          </button>

          <div style={{ marginTop: 24, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setChangeScheduleOpen((o) => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start", padding: "14px 16px", background: "var(--bg)", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text-muted)", textAlign: "left" }}
            >
              <span style={{ fontSize: 18 }}>{changeScheduleOpen ? "▼" : "▶"}</span>
              Change schedule
            </button>
            {changeScheduleOpen && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "12px 0" }}>From the date below, this student&apos;s lessons use the new day, time, duration, and rate.</p>
                <label style={labelStyle}>From date (e.g. July 1)</label>
                <div style={{ marginBottom: 16 }}>
                  <DatePicker value={scheduleChangeFromDate} onChange={setScheduleChangeFromDate} placeholder="Select date" />
                </div>
                <label style={labelStyle}>New day of week</label>
                <div style={rowStyle}>
                  {DAY_SHORT.map((label, i) => (
                    <button key={i} type="button" onClick={() => setScheduleChangeDayOfWeek(i)} className={scheduleChangeDayOfWeek === i ? "pill pill--active" : "pill"} style={{ padding: "8px 10px", fontSize: 13, flexShrink: 0, ...fontStyle }}>{label}</button>
                  ))}
                </div>
                <label style={labelStyle}>New time</label>
                <button type="button" onClick={openScheduleChangeTimePicker} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
                  {scheduleChangeTimeOfDay || "5:00 PM"}
                </button>
                <label style={labelStyle}>New lesson duration</label>
                <div style={rowStyle}>
                  {DURATIONS.map((m) => (
                    <button key={m} type="button" onClick={() => setScheduleChangeDurationMinutes(m)} className={scheduleChangeDurationMinutes === m ? "pill pill--active" : "pill"} style={{ padding: "8px 12px", fontSize: 14, flexShrink: 0, ...fontStyle }}>
                      {DURATION_LABELS[m]}
                    </button>
                  ))}
                </div>
                <label style={labelStyle}>New rate</label>
                <button type="button" onClick={openScheduleChangeRateModal} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
                  {scheduleChangeRateDollars ? `${getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$"}${scheduleChangeRateDollars}` : (getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$") + "0"}
                </button>
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setTerminateStudentOpen((o) => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start", padding: "14px 16px", background: "var(--bg)", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text-muted)", textAlign: "left" }}
            >
              <span style={{ fontSize: 18 }}>{terminateStudentOpen ? "▼" : "▶"}</span>
              Terminate student
            </button>
            {terminateStudentOpen && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "12px 0" }}>Select the date of this student&apos;s last lesson. After that date they will no longer appear on the calendar or dashboard.</p>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Last lesson date</label>
                <div style={{ marginBottom: 16 }}>
                  <DatePicker value={terminatedFromDate} onChange={setTerminatedFromDate} placeholder="Select date" />
                </div>
              </div>
            )}
          </div>

          {error ? <p style={{ color: "#dc2626", marginBottom: 16, ...fontStyle }}>{error}</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" style={fontStyle}>Save</button>
            <button type="button" onClick={handleCancelEdit} className="btn" style={{ border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", ...fontStyle }}>Cancel</button>
            <button type="button" onClick={handleDelete} className="btn" style={{ border: "1px solid rgba(220,38,38,0.4)", background: "transparent", color: "#dc2626", ...fontStyle }}>Delete</button>
          </div>
        </form>

        {rateModalOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setRateModalOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button type="button" onClick={() => setRateModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>×</button>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>Rate (currency set in Settings)</p>
              <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>{(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{rateKeypadValue || "0"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} type="button" onClick={() => setRateKeypadValue((v) => v + n)} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>{n}</button>
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
                <button type="button" onClick={() => setTimePickerOpen(false)} style={{ padding: "10px 20px", background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", ...fontStyle }}>Cancel</button>
                <button type="button" onClick={applyTime} className="btn btn-primary" style={{ padding: "10px 20px", ...fontStyle }}>OK</button>
              </div>
            </div>
          </div>
        )}
        {scheduleChangeRateModalOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setScheduleChangeRateModalOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button type="button" onClick={() => setScheduleChangeRateModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>×</button>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>New rate (currency set in Settings)</p>
              <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>{(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{scheduleChangeRateKeypadValue || "0"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} type="button" onClick={() => setScheduleChangeRateKeypadValue((v) => v + n)} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>{n}</button>
                ))}
                <button type="button" onClick={() => setScheduleChangeRateKeypadValue((v) => (v.includes(".") ? v : v + "."))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, cursor: "pointer", ...fontStyle }}>.</button>
                <button type="button" onClick={() => setScheduleChangeRateKeypadValue((v) => v + "0")} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>0</button>
                <button type="button" onClick={() => setScheduleChangeRateKeypadValue((v) => v.slice(0, -1))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(180, 160, 180, 0.12)", fontSize: 18, cursor: "pointer", ...fontStyle }}>←</button>
              </div>
              <button type="button" onClick={applyScheduleChangeRate} className="btn btn-primary" style={{ width: "100%", ...fontStyle }}>Set rate</button>
            </div>
          </div>
        )}
        {scheduleChangeTimePickerOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setScheduleChangeTimePickerOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button type="button" onClick={() => setScheduleChangeTimePickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>×</button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>New time</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <select value={scheduleChangeTimePickerHour} onChange={(e) => setScheduleChangeTimePickerHour(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                    {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (<option key={h} value={h}>{h}</option>))}
                  </select>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>:</span>
                  <select value={scheduleChangeTimePickerMinute} onChange={(e) => setScheduleChangeTimePickerMinute(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}</option>))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button type="button" onClick={() => setScheduleChangeTimePickerAmPm("AM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: scheduleChangeTimePickerAmPm === "AM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>AM</button>
                  <button type="button" onClick={() => setScheduleChangeTimePickerAmPm("PM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: scheduleChangeTimePickerAmPm === "PM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>PM</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setScheduleChangeTimePickerOpen(false)} style={{ padding: "10px 20px", background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", ...fontStyle }}>Cancel</button>
                <button type="button" onClick={applyScheduleChangeTime} className="btn btn-primary" style={{ padding: "10px 20px", ...fontStyle }}>OK</button>
              </div>
            </div>
          </div>
        )}
        </div>
      ) : (
        <>
          <div className="hero-card" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>Progress & earnings</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.3, whiteSpace: "nowrap" }}>{thisMonthLessons.length} out of {availableThisMonth} lessons</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{monthLabel}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="headline-serif" style={{ fontSize: 24, fontWeight: 400 }}>{formatCurrency(earningsThisMonth)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>This month</div>
              </div>
              <div>
                <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.3, whiteSpace: "nowrap" }}>{thisYearLessons.length} out of {availableThisYear} lessons</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>YTD</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="headline-serif" style={{ fontSize: 24, fontWeight: 400 }}>{formatCurrency(earningsYTD)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>YTD earnings</div>
              </div>
            </div>
          </div>
          <div className="float-card" style={{ padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {(() => {
                const todayKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
                const { dayOfWeek: d, timeOfDay: t } = getEffectiveSchedule(student, todayKey);
                const timeRange = t && t !== "—" ? ` @ ${formatCompactTimeRange(t, student.durationMinutes)}` : "";
                return (
                  <>
                    <span>{DAYS_FULL[d]}s{timeRange}</span>
                    <span style={{ color: "var(--text-muted)" }}>|</span>
                    <span>{formatDuration(student.durationMinutes)}, {formatCurrency(student.rateCents)}</span>
                  </>
                );
              })()}
            </div>
            {student.scheduleChangeFromDate && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                From {new Date(student.scheduleChangeFromDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}: {DAYS_FULL[student.scheduleChangeDayOfWeek ?? 0]}s
                {student.scheduleChangeTimeOfDay && student.scheduleChangeTimeOfDay !== "—"
                  ? ` @ ${formatCompactTimeRange(student.scheduleChangeTimeOfDay, student.scheduleChangeDurationMinutes ?? student.durationMinutes)}`
                  : ""}
                {(student.scheduleChangeDurationMinutes != null || student.scheduleChangeRateCents != null)
                  ? ` · ${formatDuration(student.scheduleChangeDurationMinutes ?? student.durationMinutes)}, ${formatCurrency(student.scheduleChangeRateCents ?? student.rateCents)}`
                  : ""}
              </div>
            )}
            {student.terminatedFromDate && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>Last lesson: {new Date(student.terminatedFromDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            )}
          </div>
        </>
      )}

      {error && !editing ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}

      {!editing && (
        <>
          {(() => {
            const years = [...new Set(studentLessons.map((l) => l.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
            if (years.length === 0) {
              return <p style={{ color: "var(--text-muted)" }}>No lessons logged yet</p>;
            }
            return years.map((year) => {
              const yearLessons = studentLessons.filter((l) => l.date.startsWith(year));
              const byMonth = new Map<string, Lesson[]>();
              for (const l of yearLessons) {
                const key = l.date.slice(0, 7);
                if (!byMonth.has(key)) byMonth.set(key, []);
                byMonth.get(key)!.push(l);
              }
              const rows = Array.from(byMonth.entries())
                .map(([monthKey, lessons]) => {
                  const [y, m] = monthKey.split("-").map(Number);
                  const first = new Date(y, m - 1, 1);
                  const last = new Date(y, m - 1 + 1, 0);
                  const available = student ? countDaysWithDayOfWeek(first, last, student.dayOfWeek) : lessons.length;
                  const totalEarned = lessons.reduce((s, l) => s + l.amountCents, 0);
                  const monthName = first.toLocaleDateString("en-US", { month: "long" });
                  return { monthKey, monthName, lessons: lessons.sort((a, b) => b.date.localeCompare(a.date)), available, totalEarned };
                })
                .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
              return (
                <div key={year} style={{ marginBottom: 28 }}>
                  <h3 className="headline-serif" style={{ fontSize: 20, fontWeight: 400, marginBottom: 14 }}>Lessons Log {year}</h3>
                  <div className="float-card" style={{ overflow: "hidden", padding: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {rows.map(({ monthKey, monthName, lessons, available, totalEarned }) => (
                        <Fragment key={monthKey}>
                          <div
                            onClick={() => setExpandedMonth((prev) => (prev === monthKey ? null : monthKey))}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "14px 20px",
                              cursor: "pointer",
                              background: expandedMonth === monthKey ? "var(--hero-gradient-subtle)" : undefined,
                              borderBottom: "1px solid rgba(201, 123, 148, 0.08)",
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{expandedMonth === monthKey ? "▼ " : "▶ "}{monthName}</span>
                            <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{lessons.length}/{available} · {formatCurrency(totalEarned)}</span>
                          </div>
                          {expandedMonth === monthKey && (
                            <div style={{ padding: "12px 20px 16px", background: "var(--hero-gradient-subtle)" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {lessons.map((l) => (
                                  <div key={l.id} className="float-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, margin: 0 }}>
                                    <span style={{ fontSize: 14 }}>{l.date}</span>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(l.amountCents)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </>
      )}
    </>
  );
}
