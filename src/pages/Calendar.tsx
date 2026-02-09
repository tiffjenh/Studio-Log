import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { formatCurrency, getStudentsForDay, getLessonForStudentOnDate, toDateKey } from "@/utils/earnings";
import type { Student } from "@/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekDates(ref: Date): Date[] {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const dates: Date[] = [];
  for (let i = -3; i <= 3; i++) {
    const x = new Date(d);
    x.setDate(diff + i);
    dates.push(x);
  }
  return dates;
}

export default function Calendar() {
  const navigate = useNavigate();
  const { data, addLesson, updateLesson } = useStoreContext();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateKey = toDateKey(selectedDate);
  const dayOfWeek = selectedDate.getDay();
  const todaysStudents = getStudentsForDay(data.students, dayOfWeek);
  const todayEarnings = data.lessons.filter((l) => l.date === dateKey && l.completed).reduce((s, l) => s + l.amountCents, 0);
  const weekDates = getWeekDates(selectedDate);

  const handleToggle = (studentId: string, completed: boolean) => {
    const existing = getLessonForStudentOnDate(data.lessons, studentId, dateKey);
    if (existing) updateLesson(existing.id, { completed });
    else {
      const student = data.students.find((s) => s.id === studentId);
      if (!student) return;
      addLesson({ studentId, date: dateKey, durationMinutes: student.durationMinutes, amountCents: student.rateCents, completed: true });
    }
  };

  const handlePressLesson = async (student: Student) => {
    const existing = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
    if (existing) navigate(`/edit-lesson/${existing.id}`);
    else {
      const id = await addLesson({ studentId: student.id, date: dateKey, durationMinutes: student.durationMinutes, amountCents: student.rateCents, completed: false });
      if (id) navigate(`/edit-lesson/${id}`);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Link to="/" style={{ color: "var(--text)", textDecoration: "none" }}>← Back</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Calendar</h1>
        <Link to="/add-student" style={{ color: "var(--text)", textDecoration: "none", fontSize: 24 }}>+</Link>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 16, marginBottom: 16 }}>
        {weekDates.map((d) => {
          const isSelected = toDateKey(d) === dateKey;
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => setSelectedDate(d)}
              style={{ minWidth: 56, padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: isSelected ? "var(--primary)" : "var(--card)", color: isSelected ? "white" : "var(--text)", cursor: "pointer" }}
            >
              <div style={{ fontSize: 12, color: isSelected ? "rgba(255,255,255,0.8)" : "var(--text-muted)" }}>{DAYS[d.getDay()]}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{d.getDate()}</div>
            </button>
          );
        })}
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Schedule</h3>
      {todaysStudents.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No lessons scheduled</p>
      ) : (
        todaysStudents.map((student) => {
          const lesson = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
          const completed = lesson?.completed ?? false;
          const amount = lesson?.amountCents ?? student.rateCents;
          const duration = lesson?.durationMinutes ?? student.durationMinutes;
          const display = duration >= 60 ? `${duration / 60} hour / ${formatCurrency(student.rateCents)}` : `${duration} mins ${formatCurrency(student.rateCents)}`;
          return (
            <div key={student.id} className="card" style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: "var(--primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, marginRight: 12 }} onClick={() => handlePressLesson(student)}>
                {student.firstName[0]}{student.lastName[0]}
              </div>
              <div style={{ flex: 1 }} onClick={() => handlePressLesson(student)}>
                <div style={{ fontWeight: 600 }}>{student.firstName} {student.lastName}</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{student.location ? `${student.location} · ${display}` : display}</div>
              </div>
              <label className="toggle-wrap">
                <input type="checkbox" checked={completed} onChange={(e) => handleToggle(student.id, e.target.checked)} />
                {completed && <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatCurrency(amount)}</span>}
              </label>
            </div>
          );
        })
      )}
      <div style={{ marginTop: 24, padding: 16, background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)" }}>
        <strong>Today&apos;s Earnings {formatCurrency(todayEarnings)}</strong>
      </div>
    </>
  );
}
