import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { formatCurrency } from "@/utils/earnings";
import type { Student } from "@/types";

const DURATIONS = [30, 45, 60, 90, 120];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function formatTimeRange(startTimeStr: string, durationMinutes: number): string {
  const startMins = parseTimeToMinutes(startTimeStr);
  if (startMins == null) return startTimeStr;
  const endMins = startMins + durationMinutes;
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
  const ytdLabel = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " YTD";
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
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState(student?.firstName ?? "");
  const [lastName, setLastName] = useState(student?.lastName ?? "");
  const [durationMinutes, setDurationMinutes] = useState(student?.durationMinutes ?? 60);
  const [rateDollars, setRateDollars] = useState(student ? String((student.rateCents / 100).toFixed(2)) : "");
  const [dayOfWeek, setDayOfWeek] = useState(student?.dayOfWeek ?? 1);
  const [timeOfDay, setTimeOfDay] = useState(student?.timeOfDay ?? "");
  const [location, setLocation] = useState(student?.location ?? "");

  useEffect(() => {
    if (student) {
      setEditing(false);
      setFirstName(student.firstName);
      setLastName(student.lastName);
      setDurationMinutes(student.durationMinutes);
      setRateDollars(String((student.rateCents / 100).toFixed(2)));
      setDayOfWeek(student.dayOfWeek);
      setTimeOfDay(student.timeOfDay);
      setLocation(student.location ?? "");
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
    setLocation(student.location ?? "");
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
    const rateCents = Math.round(parseFloat(rateDollars) * 100) || 0;
    const updates: Partial<Student> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      durationMinutes,
      rateCents,
      dayOfWeek,
      timeOfDay: trimmed || "—",
      location: location.trim() || undefined,
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
      <Link to="/students" style={{ display: "inline-flex", alignItems: "center", marginBottom: 16, color: "var(--text)", textDecoration: "none" }}>← Back</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{student.firstName} {student.lastName}</h1>
        {!editing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleStartEdit} className="btn btn-primary" style={{ padding: "10px 16px" }}>Edit</button>
            <button type="button" onClick={handleDelete} style={{ padding: "10px 16px", border: "1px solid #dc2626", borderRadius: 8, background: "transparent", color: "#dc2626", fontWeight: 600, cursor: "pointer" }}>Delete</button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={handleSaveEdit} className="card" style={{ marginBottom: 24 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>First name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Last name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Lesson duration</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDurationMinutes(m)}
                style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--border)", background: durationMinutes === m ? "var(--primary)" : "var(--card)", color: durationMinutes === m ? "white" : "var(--text)" }}
              >
                {m === 60 ? "1 hour" : m === 90 ? "1.5 hours" : m === 120 ? "2 hours" : `${m} min`}
              </button>
            ))}
          </div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Rate ($)</label>
          <input type="number" step="0.01" value={rateDollars} onChange={(e) => setRateDollars(e.target.value)} placeholder="70" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Day of week</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {DAYS_FULL.map((d, i) => (
              <button key={i} type="button" onClick={() => setDayOfWeek(i)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: dayOfWeek === i ? "var(--primary)" : "var(--card)", color: dayOfWeek === i ? "white" : "var(--text)", fontSize: 13 }}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Time (e.g. 5:00 PM) – include AM or PM</label>
          <input type="text" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} placeholder="5:00 PM" style={inputStyle} />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Location (optional)</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Pinehills" style={inputStyle} />
          {error ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" onClick={handleCancelEdit} style={{ padding: "10px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", cursor: "pointer" }}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="card">
                <div style={{ fontSize: 20, fontWeight: 700 }}>{thisMonthLessons.length}/{availableThisMonth}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{thisMonthLessons.length} of {availableThisMonth} lessons for {monthLabel}</div>
              </div>
              <div className="card">
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(earningsThisMonth)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Total earnings this month</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="card">
                <div style={{ fontSize: 20, fontWeight: 700 }}>{thisYearLessons.length}/{availableThisYear}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{thisYearLessons.length} lessons out of {availableThisYear} ({ytdLabel})</div>
              </div>
              <div className="card">
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(earningsYTD)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Total earnings YTD</div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
            <div className="card">
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatDuration(student.durationMinutes)}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Lesson time</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(student.rateCents)}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Rate per lesson</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 20, fontWeight: 700 }}>{DAYS_FULL[student.dayOfWeek]}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Day</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 20, fontWeight: 700 }}>{student.timeOfDay && student.timeOfDay !== "—" ? formatTimeRange(student.timeOfDay, student.durationMinutes) : "—"}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Scheduled time</div>
            </div>
          </div>
          {student.location && (
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>Location: {student.location}</div>
          )}
        </>
      )}

      {error && !editing ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}

      {!editing && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Lessons this year</h3>
          {thisYearLessons.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No lessons logged yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...thisYearLessons].reverse().map((l) => (
                <div key={l.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{l.date}</span>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(l.amountCents)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
