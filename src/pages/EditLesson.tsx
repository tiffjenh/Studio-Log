import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency } from "@/utils/earnings";
import DatePicker from "@/components/DatePicker";
import StudentAvatar from "@/components/StudentAvatar";
import type { Lesson } from "@/types";

const DURATIONS = [
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hour", minutes: 60 },
  { label: "1 hr 30 min", minutes: 90 },
  { label: "2 hours", minutes: 120 },
];

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

export default function EditLesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, updateLesson } = useStoreContext();
  const { t } = useLanguage();
  const lesson = data.lessons.find((l) => l.id === id);
  const student = lesson ? data.students.find((s) => s.id === lesson.studentId) : null;
  const [lessonDate, setLessonDate] = useState(lesson?.date ?? "");
  const [durationMinutes, setDurationMinutes] = useState(lesson?.durationMinutes ?? 60);
  const [note, setNote] = useState(lesson?.note ?? "");

  // Time picker state
  const initTime = parseTimeOfDay(student?.timeOfDay ?? "5:00 PM");
  const [lessonTime, setLessonTime] = useState(student?.timeOfDay ?? "5:00 PM");
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerHour, setTimePickerHour] = useState(initTime.hour);
  const [timePickerMinute, setTimePickerMinute] = useState(initTime.minute);
  const [timePickerAmPm, setTimePickerAmPm] = useState<"AM" | "PM">(initTime.amPm);

  const openTimePicker = () => {
    const p = parseTimeOfDay(lessonTime);
    setTimePickerHour(p.hour);
    setTimePickerMinute(p.minute);
    setTimePickerAmPm(p.amPm);
    setTimePickerOpen(true);
  };
  const applyTime = () => {
    setLessonTime(`${timePickerHour}:${String(timePickerMinute).padStart(2, "0")} ${timePickerAmPm}`);
    setTimePickerOpen(false);
  };

  useEffect(() => {
    if (lesson) setLessonDate(lesson.date);
    if (lesson) setDurationMinutes(lesson.durationMinutes);
    if (lesson) setNote(lesson.note ?? "");
  }, [lesson?.id, student?.id]);

  if (!lesson || !student) return <p style={{ padding: 24 }}>Lesson not found</p>;

  const ratePerHour = student.rateCents / (student.durationMinutes / 60);
  const amountCents = Math.round((ratePerHour * durationMinutes) / 60);
  const [y, m, d] = lessonDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dateFormatted = isNaN(date.getTime()) ? lessonDate : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeStr = student.timeOfDay ? ` - ${student.timeOfDay}` : "";

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Partial<Lesson> = { durationMinutes, amountCents, note: note.trim() || undefined };
    if (/^\d{4}-\d{2}-\d{2}$/.test(lessonDate)) updates.date = lessonDate;
    updateLesson(lesson.id, updates);
    navigate(-1);
  };

  return (
    <>
      <Link to="/" style={{ display: "inline-flex", marginBottom: 24, color: "var(--text)", textDecoration: "none" }}>← {t("common.back")}</Link>
      <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, marginBottom: 24 }}>{t("editLesson.title")}</h1>
      <form onSubmit={handleSave}>
        <div className="float-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: 14, flexShrink: 0 }}><StudentAvatar student={student} size={48} /></span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{student.firstName} {student.lastName}</div>
              <div style={{ color: "var(--text-muted)" }}>{dateFormatted}{timeStr}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Reschedule to date</label>
            <DatePicker value={lessonDate} onChange={setLessonDate} placeholder="Select date" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Reschedule time</label>
            <button type="button" onClick={openTimePicker} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
              {lessonTime || "5:00 PM"}
            </button>
          </div>
        </div>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Duration</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {DURATIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              onClick={() => setDurationMinutes(opt.minutes)}
              className={durationMinutes === opt.minutes ? "pill pill--active" : "pill"}
              style={{ padding: "10px 16px" }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="float-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span>Lesson Rate</span>
          <span style={{ color: "var(--text-muted)" }}>{formatCurrency(student.rateCents)} &gt;</span>
        </div>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Notes</label>
        <textarea
          placeholder="e.g. Updated today's lesson to 1 hr 30 mins for $105."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%", minHeight: 80, padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 24, fontSize: 16 }}
        />
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>{t("common.save")}</button>
      </form>

      {timePickerOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setTimePickerOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", fontFamily: "var(--font-sans)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button type="button" onClick={() => setTimePickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>&times;</button>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>Select time</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <select value={timePickerHour} onChange={(e) => setTimePickerHour(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                  {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (<option key={h} value={h}>{h}</option>))}
                </select>
                <span style={{ fontSize: 18, fontWeight: 600 }}>:</span>
                <select value={timePickerMinute} onChange={(e) => setTimePickerMinute(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}</option>))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button type="button" onClick={() => setTimePickerAmPm("AM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: timePickerAmPm === "AM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "var(--font-sans)" }}>AM</button>
                <button type="button" onClick={() => setTimePickerAmPm("PM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: timePickerAmPm === "PM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "var(--font-sans)" }}>PM</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setTimePickerOpen(false)} style={{ padding: "10px 20px", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>Cancel</button>
              <button type="button" onClick={applyTime} style={{ padding: "10px 24px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
