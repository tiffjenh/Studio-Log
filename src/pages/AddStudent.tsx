import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import type { Student } from "@/types";

const DURATIONS = [30, 45, 60, 90, 120];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function AddStudent() {
  const { addStudent } = useStoreContext();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [rateDollars, setRateDollars] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("");
  const [error, setError] = useState("");

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

  const inputStyle: React.CSSProperties = { width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16 };

  return (
    <>
      <Link to="/students" style={{ display: "inline-flex", marginBottom: 24, color: "var(--text)", textDecoration: "none" }}>← Back</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Add Student</h1>
      <form onSubmit={handleSave}>
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
          {DAYS.map((d, i) => (
            <button key={i} type="button" onClick={() => setDayOfWeek(i)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: dayOfWeek === i ? "var(--primary)" : "var(--card)", color: dayOfWeek === i ? "white" : "var(--text)", fontSize: 13 }}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Time (e.g. 5:00 PM) – include AM or PM</label>
        <input type="text" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} placeholder="5:00 PM" style={inputStyle} />
        {error ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}
        <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 24 }}>Save</button>
      </form>
    </>
  );
}
