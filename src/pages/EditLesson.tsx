import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { formatCurrency } from "@/utils/earnings";

const DURATIONS = [
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hour", minutes: 60 },
  { label: "1 hr 30 min", minutes: 90 },
  { label: "2 hours", minutes: 120 },
];

export default function EditLesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, updateLesson, updateStudent } = useStoreContext();
  const lesson = data.lessons.find((l) => l.id === id);
  const student = lesson ? data.students.find((s) => s.id === lesson.studentId) : null;
  const [durationMinutes, setDurationMinutes] = useState(lesson?.durationMinutes ?? 60);
  const [note, setNote] = useState(lesson?.note ?? "");
  const [location, setLocation] = useState(student?.location ?? "");

  useEffect(() => {
    if (lesson) setDurationMinutes(lesson.durationMinutes);
    if (lesson) setNote(lesson.note ?? "");
    if (student) setLocation(student.location ?? "");
  }, [lesson?.id, student?.id]);

  if (!lesson || !student) return <p style={{ padding: 24 }}>Lesson not found</p>;

  const ratePerHour = student.rateCents / (student.durationMinutes / 60);
  const amountCents = Math.round((ratePerHour * durationMinutes) / 60);
  const dateStr = lesson.date;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dateFormatted = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeStr = student.timeOfDay ? ` - ${student.timeOfDay}` : "";

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateLesson(lesson.id, { durationMinutes, amountCents, note: note.trim() || undefined });
    if (location.trim() !== (student.location ?? "")) updateStudent(student.id, { location: location.trim() || undefined });
    navigate(-1);
  };

  return (
    <>
      <Link to="/" style={{ display: "inline-flex", marginBottom: 24, color: "var(--text)", textDecoration: "none" }}>← Back</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Edit Lesson</h1>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <span style={{ marginRight: 8 }}>←</span>
        <span>{dateFormatted}{timeStr}</span>
        <span style={{ marginLeft: 8 }}>→</span>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: "var(--primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, marginRight: 12 }}>
            {student.firstName[0]}{student.lastName[0]}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{student.firstName} {student.lastName}</div>
            <div style={{ color: "var(--text-muted)" }}>
              {durationMinutes >= 60 ? `${durationMinutes / 60} hr ${durationMinutes % 60 ? ` ${durationMinutes % 60} mins` : ""}` : `${durationMinutes} mins`} &gt; {formatCurrency(amountCents)}
            </div>
            {note && <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>{note}</div>}
          </div>
        </div>
      </div>
      <form onSubmit={handleSave}>
        <textarea
          placeholder="e.g. Updated today's lesson to 1 hr 30 mins for $105."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%", minHeight: 80, padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 24, fontSize: 16 }}
        />
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Duration</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {DURATIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              onClick={() => setDurationMinutes(opt.minutes)}
              style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--border)", background: durationMinutes === opt.minutes ? "var(--primary)" : "var(--card)", color: durationMinutes === opt.minutes ? "white" : "var(--text)" }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span>Lesson Rate</span>
          <span style={{ color: "var(--text-muted)" }}>{formatCurrency(student.rateCents)} &gt;</span>
        </div>
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span>Location</span>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Pinehills" style={{ border: "none", background: "none", fontSize: 16, textAlign: "right" }} />
          <span style={{ color: "var(--text-muted)" }}>&gt;</span>
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>Save</button>
      </form>
    </>
  );
}
