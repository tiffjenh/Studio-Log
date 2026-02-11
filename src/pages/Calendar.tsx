import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { formatCurrency, getStudentsForDay, getLessonForStudentOnDate, toDateKey } from "@/utils/earnings";
import type { Student } from "@/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Thursday of the week containing d (matches existing 7-day strip: Thu–Wed) */
function getStripStart(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const sunDate = x.getDate() - day;
  x.setDate(sunDate + 4);
  return x;
}

function getWeekDatesFromStripStart(stripStart: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) dates.push(addDays(stripStart, i));
  return dates;
}

export default function Calendar() {
  const navigate = useNavigate();
  const { data, addLesson, updateLesson } = useStoreContext();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewWeekStart, setViewWeekStart] = useState(() => getStripStart(new Date()));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerView, setMonthPickerView] = useState(new Date());
  const monthPickerRef = useRef<HTMLDivElement>(null);

  const dateKey = toDateKey(selectedDate);
  const dayOfWeek = selectedDate.getDay();
  const todaysStudents = getStudentsForDay(data.students, dayOfWeek);
  const todayEarnings = data.lessons.filter((l) => l.date === dateKey && l.completed).reduce((s, l) => s + l.amountCents, 0);
  const weekDates = getWeekDatesFromStripStart(viewWeekStart);

  // Keep view week in sync when selected date changes (e.g. from dropdown)
  useEffect(() => {
    setViewWeekStart((prev) => {
      const selStart = getStripStart(selectedDate);
      const prevStart = getStripStart(prev);
      return toDateKey(selStart) === toDateKey(prevStart) ? prev : selStart;
    });
  }, [selectedDate]);

  // Click outside to close month picker
  useEffect(() => {
    if (!monthPickerOpen) return;
    const handle = (e: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) setMonthPickerOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [monthPickerOpen]);

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
      <div style={{ marginBottom: 16, position: "relative" }} ref={monthPickerRef}>
        <button
          type="button"
          onClick={() => { setMonthPickerOpen((o) => !o); setMonthPickerView(selectedDate); }}
          className="btn btn-primary"
          style={{ marginBottom: 12 }}
        >
          {selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </button>

        {monthPickerOpen && (
          <div className="card" style={{ position: "absolute", left: 16, right: 16, maxWidth: 360, padding: 16, boxShadow: "0 10px 40px rgba(0,0,0,0.15)", zIndex: 50, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button type="button" onClick={() => setMonthPickerView((d) => addDays(new Date(d.getFullYear(), d.getMonth(), 1), -1))} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}>‹</button>
              <span style={{ fontWeight: 600 }}>{monthPickerView.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              <button type="button" onClick={() => setMonthPickerView((d) => addDays(new Date(d.getFullYear(), d.getMonth() + 1, 0), 1))} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", marginBottom: 8 }}>
              {DAYS_SHORT.map((label) => (
                <div key={label} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{label}</div>
              ))}
              {(() => {
                const year = monthPickerView.getFullYear();
                const month = monthPickerView.getMonth();
                const first = new Date(year, month, 1);
                const start = new Date(first);
                start.setDate(1 - first.getDay());
                const cells: { date: Date; isCurrentMonth: boolean }[] = [];
                for (let i = 0; i < 42; i++) {
                  const d = addDays(start, i);
                  cells.push({ date: d, isCurrentMonth: d.getMonth() === month });
                }
                return cells.map(({ date, isCurrentMonth }) => {
                  const key = toDateKey(date);
                  const isSelected = key === dateKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setSelectedDate(date); setMonthPickerOpen(false); }}
                      style={{
                        width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 14,
                        background: isSelected ? "var(--primary)" : "transparent",
                        color: isSelected ? "white" : isCurrentMonth ? "var(--text)" : "var(--text-muted)",
                        opacity: isCurrentMonth ? 1 : 0.5,
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setViewWeekStart((prev) => addDays(prev, -7))}
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
          >
            ‹
          </button>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
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
          <button
            type="button"
            onClick={() => setViewWeekStart((prev) => addDays(prev, 7))}
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
          >
            ›
          </button>
        </div>
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
