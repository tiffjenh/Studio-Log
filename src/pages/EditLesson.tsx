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
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Reschedule to date</label>
        <div style={{ marginBottom: 20 }}>
          <DatePicker value={lessonDate} onChange={setLessonDate} placeholder="Select date" />
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
    </>
  );
}
