import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { formatCurrency } from "@/utils/earnings";
import type { Student } from "@/types";

const DURATIONS = [30, 45, 60, 90, 120];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, updateStudent, deleteStudent } = useStoreContext();
  const student = data.students.find((s) => s.id === id);
  const studentLessons = data.lessons.filter((l) => l.studentId === id && l.completed);
  const thisYear = new Date().getFullYear();
  const thisYearLessons = studentLessons.filter((l) => l.date.startsWith(String(thisYear)));
  const totalEarnings = studentLessons.reduce((sum, l) => sum + l.amountCents, 0);

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div className="card">
              <div style={{ fontSize: 20, fontWeight: 700 }}>{thisYearLessons.length}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Lessons this year</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(totalEarnings)}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Total earnings</div>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 4 }}>{student.durationMinutes === 60 ? "1 hour" : `${student.durationMinutes} min`} / {formatCurrency(student.rateCents)}</div>
            <div style={{ marginBottom: 4 }}>{DAYS_SHORT[student.dayOfWeek]} at {student.timeOfDay}</div>
            {student.location && <div>{student.location}</div>}
          </div>
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
