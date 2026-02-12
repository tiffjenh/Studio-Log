import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import LogoIcon from "@/components/LogoIcon";
import {
  formatCurrency,
  earnedThisWeek,
  earnedInDateRange,
  getMonthBounds,
  getStudentsForDay,
  getEffectiveSchedule,
  getEffectiveDurationMinutes,
  getEffectiveRateCents,
  getLessonForStudentOnDate,
  toDateKey,
} from "@/utils/earnings";
import type { Lesson, Student } from "@/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function LessonRow({
  student,
  lesson,
  dateKey,
  onToggle,
  onEdit,
}: {
  student: Student;
  lesson: Lesson | undefined;
  dateKey: string;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
}) {
  const completed = lesson?.completed ?? false;
  const effectiveDuration = getEffectiveDurationMinutes(student, dateKey);
  const effectiveRate = getEffectiveRateCents(student, dateKey);
  const duration = lesson?.durationMinutes ?? effectiveDuration;
  const amount = lesson?.amountCents ?? effectiveRate;
  const rateText = duration >= 60 ? `${duration / 60} hour` : `${duration} mins`;
  const { timeOfDay } = getEffectiveSchedule(student, dateKey);
  return (
    <div className="float-card" style={{ display: "flex", alignItems: "center", marginBottom: 12, cursor: "pointer", gap: 16 }} onClick={onEdit}>
      <div style={{ width: 48, height: 48, minWidth: 48, maxWidth: 48, minHeight: 48, maxHeight: 48, borderRadius: "50%", background: "var(--accent-gradient)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 15, flexShrink: 0 }}>
        {student.firstName[0]}{student.lastName[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontFamily: "var(--font-sans)" }}>{student.firstName} {student.lastName}</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{rateText} / {formatCurrency(effectiveRate)}</div>
        {timeOfDay && timeOfDay !== "—" && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{timeOfDay}</div>
        )}
      </div>
      <label className="toggle-wrap" onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
        <input type="checkbox" checked={completed} onChange={(e) => onToggle(e.target.checked)} />
        {completed && <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatCurrency(amount)}</span>}
      </label>
    </div>
  );
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, addLesson, updateLesson } = useStoreContext();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const dateKey = toDateKey(selectedDate);
  const dayOfWeek = selectedDate.getDay();
  const earned = earnedThisWeek(data.lessons, today);
  const studioOwnerName = data.user?.name?.trim().split(/\s+/)[0] ?? null;
  const dashboardTitle = studioOwnerName ? `${studioOwnerName}'s Studio Log` : "Studio Log";

  const { start: monthStart, end: monthEnd } = getMonthBounds(today);
  const monthStartKey = toDateKey(monthStart);
  const monthEndKey = toDateKey(monthEnd);
  const earningsThisMonth = earnedInDateRange(data.lessons, monthStartKey, monthEndKey);

  const year = today.getFullYear();
  const ytdEndKey = toDateKey(today);
  const earningsYTD = earnedInDateRange(data.lessons, `${year}-01-01`, ytdEndKey);

  const todaysStudents = getStudentsForDay(data.students, dayOfWeek, dateKey);
  const isToday = toDateKey(selectedDate) === toDateKey(today);

  const handleToggle = (studentId: string, completed: boolean) => {
    const existing = getLessonForStudentOnDate(data.lessons, studentId, dateKey);
    if (existing) updateLesson(existing.id, { completed });
    else {
      const student = data.students.find((s) => s.id === studentId);
      if (!student) return;
      addLesson({ studentId, date: dateKey, durationMinutes: getEffectiveDurationMinutes(student, dateKey), amountCents: getEffectiveRateCents(student, dateKey), completed: true });
    }
  };

  const handleEdit = async (student: Student) => {
    const existing = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
    if (existing) navigate(`/edit-lesson/${existing.id}`);
    else {
      const id = await addLesson({ studentId: student.id, date: dateKey, durationMinutes: getEffectiveDurationMinutes(student, dateKey), amountCents: getEffectiveRateCents(student, dateKey), completed: false });
      if (id) navigate(`/edit-lesson/${id}`);
    }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div className="logo-gradient" style={{ width: 52, height: 52, borderRadius: 16, color: "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <LogoIcon size={28} />
        </div>
        <h2 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0, color: "var(--text)" }}>{dashboardTitle}</h2>
      </div>
      <div className="hero-card" style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 16 }}>Earnings overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>This week</div>
            <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earned)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>This month</div>
            <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earningsThisMonth)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>YTD</div>
            <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earningsYTD)}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <h3 className="headline-serif" style={{ fontSize: 22, fontWeight: 400, margin: 0 }}>
          {isToday ? "Today's lessons" : "Lessons"}
        </h3>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            className="pill"
            style={{ minWidth: 36, minHeight: 36, padding: "8px 12px" }}
            aria-label="Previous day"
          >
            ‹
          </button>
          <span style={{ minWidth: 100, textAlign: "center", fontSize: 14, color: "var(--text-muted)" }}>
            {DAY_NAMES[dayOfWeek]}, {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="pill"
            style={{ minWidth: 36, minHeight: 36, padding: "8px 12px" }}
            aria-label="Next day"
          >
            ›
          </button>
        </span>
      </div>
      {todaysStudents.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: 28, fontSize: 15 }}>No lessons scheduled for this day</p>
      ) : (
        todaysStudents.map((student) => {
          const lesson = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
          return (
            <LessonRow
              key={student.id}
              student={student}
              lesson={lesson}
              dateKey={dateKey}
              onToggle={(v) => handleToggle(student.id, v)}
              onEdit={() => handleEdit(student)}
            />
          );
        })
      )}
      <div style={{ marginTop: 28, textAlign: "center" }}>
        <Link to="/calendar" className="btn btn-primary" style={{ textDecoration: "none" }}>View Calendar</Link>
      </div>
    </>
  );
}
