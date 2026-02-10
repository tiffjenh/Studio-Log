import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import {
  formatCurrency,
  earnedThisWeek,
  getMonthBounds,
  getStudentsForDay,
  getLessonForStudentOnDate,
  toDateKey,
} from "@/utils/earnings";
import type { Lesson, Student } from "@/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function LessonRow({
  student,
  lesson,
  onToggle,
  onEdit,
}: {
  student: Student;
  lesson: Lesson | undefined;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
}) {
  const completed = lesson?.completed ?? false;
  const duration = lesson?.durationMinutes ?? student.durationMinutes;
  const amount = lesson?.amountCents ?? student.rateCents;
  const rateText = duration >= 60 ? `${duration / 60} hour` : `${duration} mins`;
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", marginBottom: 8, cursor: "pointer" }} onClick={onEdit}>
      <div style={{ width: 44, height: 44, borderRadius: 22, background: "var(--primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, marginRight: 12 }}>
        {student.firstName[0]}{student.lastName[0]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{student.firstName} {student.lastName}</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{rateText} / {formatCurrency(student.rateCents)}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{student.timeOfDay && student.timeOfDay !== "—" ? student.timeOfDay : ""}</div>
      </div>
      <label className="toggle-wrap" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={completed} onChange={(e) => onToggle(e.target.checked)} />
        {completed && <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatCurrency(amount)}</span>}
      </label>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, addLesson, updateLesson } = useStoreContext();
  const today = new Date();
  const dateKey = toDateKey(today);
  const dayOfWeek = today.getDay();
  const earned = earnedThisWeek(data.lessons, today);
  const firstName = data.user?.name?.split(" ")[0] ?? "there";

  const { start: monthStart, end: monthEnd } = getMonthBounds(today);
  const monthStartKey = toDateKey(monthStart);
  const monthEndKey = toDateKey(monthEnd);
  const earningsThisMonth = data.lessons
    .filter((l) => l.completed && l.date >= monthStartKey && l.date <= monthEndKey)
    .reduce((sum, l) => sum + l.amountCents, 0);

  const year = today.getFullYear();
  const ytdEndKey = toDateKey(today);
  const earningsYTD = data.lessons
    .filter((l) => l.completed && l.date >= `${year}-01-01` && l.date <= ytdEndKey)
    .reduce((sum, l) => sum + l.amountCents, 0);

  const todaysStudents = getStudentsForDay(data.students, dayOfWeek);

  const handleToggle = (studentId: string, completed: boolean) => {
    const existing = getLessonForStudentOnDate(data.lessons, studentId, dateKey);
    if (existing) updateLesson(existing.id, { completed });
    else {
      const student = data.students.find((s) => s.id === studentId);
      if (!student) return;
      addLesson({ studentId, date: dateKey, durationMinutes: student.durationMinutes, amountCents: student.rateCents, completed: true });
    }
  };

  const handleEdit = async (student: Student) => {
    const existing = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
    if (existing) navigate(`/edit-lesson/${existing.id}`);
    else {
      const id = await addLesson({ studentId: student.id, date: dateKey, durationMinutes: student.durationMinutes, amountCents: student.rateCents, completed: false });
      if (id) navigate(`/edit-lesson/${id}`);
    }
  };

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div className="logo-gradient" style={{ width: 48, height: 48, borderRadius: 12, color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 24, marginBottom: 8 }}>P</div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Welcome back, {firstName}</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <div className="card">
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Earned This Week</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{formatCurrency(earned)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Earnings This Month</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{formatCurrency(earningsThisMonth)}</div>
        </div>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Earnings YTD</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{formatCurrency(earningsYTD)}</div>
        </div>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Today&apos;s lessons ({DAY_NAMES[dayOfWeek]}, {today.toLocaleDateString("en-US", { month: "short", day: "numeric" })})
      </h3>
      {todaysStudents.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: 24 }}>No lessons scheduled for today</p>
      ) : (
        todaysStudents.map((student) => {
          const lesson = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
          return (
            <LessonRow
              key={student.id}
              student={student}
              lesson={lesson}
              onToggle={(v) => handleToggle(student.id, v)}
              onEdit={() => handleEdit(student)}
            />
          );
        })
      )}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link to="/calendar" className="btn btn-primary" style={{ textDecoration: "none" }}>View Calendar</Link>
      </div>
    </>
  );
}
