import { useState, useEffect, Fragment } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { formatCurrency, getEffectiveSchedule } from "@/utils/earnings";
import type { Student, Lesson } from "@/types";

const DURATIONS = [30, 45, 60, 90, 120];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
  const studentLessons = data.lessons.filter((l) => l.studentId === id && l.completed);
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

  const inputStyle: React.CSSProperties = { width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16 };

  return (
    <>
      <Link to="/students" style={{ display: "inline-flex", alignItems: "center", marginBottom: 20, color: "var(--text)", textDecoration: "none", fontSize: 15 }}>← Back</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0 }}>{student.firstName} {student.lastName}</h1>
        {!editing ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={handleStartEdit} className="pill pill--active" style={{ padding: "10px 18px" }}>Edit</button>
            <button type="button" onClick={handleDelete} className="pill" style={{ border: "1px solid rgba(220,38,38,0.4)", color: "#dc2626", background: "transparent" }}>Delete</button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={handleSaveEdit} className="float-card" style={{ marginBottom: 28 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>First name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Last name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Lesson duration</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            {DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDurationMinutes(m)}
                className={durationMinutes === m ? "pill pill--active" : "pill"}
              >
                {m === 60 ? "1 hour" : m === 90 ? "1.5 hours" : m === 120 ? "2 hours" : `${m} min`}
              </button>
            ))}
          </div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Rate ($)</label>
          <input type="number" step="0.01" value={rateDollars} onChange={(e) => setRateDollars(e.target.value)} placeholder="70" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Day of week</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            {DAYS_FULL.map((d, i) => (
              <button key={i} type="button" onClick={() => setDayOfWeek(i)} className={dayOfWeek === i ? "pill pill--active" : "pill"} style={{ fontSize: 13 }}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Time (e.g. 5:00 PM) – include AM or PM</label>
          <input type="text" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} placeholder="5:00 PM" style={inputStyle} />

          <div style={{ marginTop: 24, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setChangeScheduleOpen((o) => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--bg)", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              Change schedule
              <span style={{ fontSize: 18 }}>{changeScheduleOpen ? "▼" : "▶"}</span>
            </button>
            {changeScheduleOpen && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "12px 0" }}>From the date below, this student&apos;s lessons use the new day, time, duration, and rate.</p>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>From date (e.g. July 1)</label>
                <input type="date" value={scheduleChangeFromDate} onChange={(e) => setScheduleChangeFromDate(e.target.value)} style={inputStyle} />
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>New day of week</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                  {DAYS_FULL.map((d, i) => (
                    <button key={i} type="button" onClick={() => setScheduleChangeDayOfWeek(i)} className={scheduleChangeDayOfWeek === i ? "pill pill--active" : "pill"} style={{ fontSize: 13 }}>
                      {d.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>New time (e.g. 5:00 PM)</label>
                <input type="text" value={scheduleChangeTimeOfDay} onChange={(e) => setScheduleChangeTimeOfDay(e.target.value)} placeholder="5:00 PM" style={inputStyle} />
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>New lesson duration</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                  {DURATIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setScheduleChangeDurationMinutes(m)}
                      className={scheduleChangeDurationMinutes === m ? "pill pill--active" : "pill"}
                    >
                      {m === 60 ? "1 hour" : m === 90 ? "1.5 hours" : m === 120 ? "2 hours" : `${m} min`}
                    </button>
                  ))}
                </div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>New rate ($)</label>
                <input type="number" step="0.01" value={scheduleChangeRateDollars} onChange={(e) => setScheduleChangeRateDollars(e.target.value)} placeholder="e.g. 60" style={inputStyle} />
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setTerminateStudentOpen((o) => !o)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--bg)", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              Terminate student
              <span style={{ fontSize: 18 }}>{terminateStudentOpen ? "▼" : "▶"}</span>
            </button>
            {terminateStudentOpen && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "12px 0" }}>Select the date of this student&apos;s last lesson. After that date they will no longer appear on the calendar or dashboard.</p>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Last lesson date</label>
                <input type="date" value={terminatedFromDate} onChange={(e) => setTerminatedFromDate(e.target.value)} style={inputStyle} />
              </div>
            )}
          </div>

          {error ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" onClick={handleCancelEdit} style={{ padding: "10px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", cursor: "pointer" }}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="hero-card" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>Progress & earnings</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.3 }}>{thisMonthLessons.length} out of {availableThisMonth} lessons</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{monthLabel}</div>
              </div>
              <div>
                <div className="headline-serif" style={{ fontSize: 24, fontWeight: 400 }}>{formatCurrency(earningsThisMonth)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>This month</div>
              </div>
              <div>
                <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.3 }}>{thisYearLessons.length} out of {availableThisYear} lessons</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>YTD</div>
              </div>
              <div>
                <div className="headline-serif" style={{ fontSize: 24, fontWeight: 400 }}>{formatCurrency(earningsYTD)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>YTD earnings</div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <div className="float-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {(() => {
                  const todayKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
                  const { dayOfWeek: d, timeOfDay: t } = getEffectiveSchedule(student, todayKey);
                  return (
                    <>
                      {DAYS_FULL[d]}s
                      {t && t !== "—" ? ` @ ${formatCompactTimeRange(t, student.durationMinutes)}` : ""}
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
            <div className="float-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {formatDuration(student.durationMinutes)}, {formatCurrency(student.rateCents)}
              </div>
            </div>
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
