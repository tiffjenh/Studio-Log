import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, getStudentsForDay, getEffectiveDurationMinutes, getEffectiveRateCents, getLessonForStudentOnDate, toDateKey } from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import type { Student } from "@/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 5 days: 2 before center, center, 2 after */
function getFiveDays(center: Date): Date[] {
  return [-2, -1, 0, 1, 2].map((i) => addDays(center, i));
}

export default function Calendar() {
  const navigate = useNavigate();
  const { data, addLesson, updateLesson } = useStoreContext();
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewCenter, setViewCenter] = useState(new Date());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerView, setMonthPickerView] = useState(new Date());
  const monthPickerRef = useRef<HTMLDivElement>(null);

  const dateKey = toDateKey(selectedDate);
  const dayOfWeek = selectedDate.getDay();
  const todaysStudents = getStudentsForDay(data.students, dayOfWeek, dateKey);
  const todaysStudentIds = new Set(todaysStudents.map((s) => s.id));
  // Only count completed lessons for students who are on today's schedule (avoids orphan lessons and matches Schedule list)
  const todayEarnings = data.lessons
    .filter((l) => l.date === dateKey && l.completed && todaysStudentIds.has(l.studentId))
    .reduce((s, l) => s + l.amountCents, 0);
  const stripDates = getFiveDays(viewCenter);

  // Always center the 5-day strip on the selected date when it changes
  useEffect(() => {
    setViewCenter(selectedDate);
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
      addLesson({ studentId, date: dateKey, durationMinutes: getEffectiveDurationMinutes(student, dateKey), amountCents: getEffectiveRateCents(student, dateKey), completed: true });
    }
  };

  const handlePressLesson = async (student: Student) => {
    const existing = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
    if (existing) navigate(`/edit-lesson/${existing.id}`);
    else {
      const id = await addLesson({ studentId: student.id, date: dateKey, durationMinutes: getEffectiveDurationMinutes(student, dateKey), amountCents: getEffectiveRateCents(student, dateKey), completed: false });
      if (id) navigate(`/edit-lesson/${id}`);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, minHeight: 44 }}>
        <Link to="/" style={{ color: "var(--text)", textDecoration: "none", fontSize: 15, display: "inline-flex", alignItems: "center" }}>← {t("common.back")}</Link>
        <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0, lineHeight: 1 }}>{t("calendar.title")}</h1>
        <Link
          to="/add-student"
          title={t("students.addStudent")}
          style={{
            width: 40,
            height: 40,
            minWidth: 40,
            maxWidth: 40,
            minHeight: 40,
            maxHeight: 40,
            borderRadius: "50%",
            background: "var(--avatar-gradient)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 300,
            lineHeight: 1,
            textDecoration: "none",
            flexShrink: 0,
            padding: 0,
          }}
        >
          +
        </Link>
      </div>
      <div style={{ marginBottom: 16, position: "relative" }} ref={monthPickerRef}>
        <button
          type="button"
          onClick={() => { setMonthPickerOpen((o) => !o); setMonthPickerView(selectedDate); }}
          className="pill pill--active"
          style={{
            marginBottom: 12,
            minHeight: 48,
            padding: "12px 20px",
            border: "none",
            borderRadius: "var(--radius-pill)",
            background: "var(--avatar-gradient)",
            color: "white",
            fontSize: 16,
            fontWeight: 600,
            fontFamily: "var(--font-sans)",
            cursor: "pointer",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          {selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </button>

        {monthPickerOpen && (
          <div className="float-card" style={{ position: "absolute", left: 16, right: 16, maxWidth: 360, zIndex: 50, marginBottom: 16, padding: 16, boxShadow: "var(--shadow-elevated)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setMonthPickerView((d) => addDays(new Date(d.getFullYear(), d.getMonth(), 1), -1))}
                style={{
                  width: 36, height: 36, minWidth: 36, maxWidth: 36, minHeight: 36, maxHeight: 36, borderRadius: "50%",
                  border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)",
                }}
                aria-label="Previous month"
              >
                ‹
              </button>
              <span style={{ fontWeight: 600, fontSize: 16, fontFamily: "var(--font-sans)" }}>{monthPickerView.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              <button
                type="button"
                onClick={() => setMonthPickerView((d) => addDays(new Date(d.getFullYear(), d.getMonth() + 1, 0), 1))}
                style={{
                  width: 36, height: 36, minWidth: 36, maxWidth: 36, minHeight: 36, maxHeight: 36, borderRadius: "50%",
                  border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)",
                }}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", marginBottom: 8 }}>
              {DAYS_SHORT.map((label) => (
                <div key={label} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>{label}</div>
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
                        width: 36, minWidth: 36, height: 36, minHeight: 36, maxHeight: 36, padding: 0, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", justifyContent: "center",
                        background: isSelected ? "var(--primary)" : "transparent",
                        color: isSelected ? "white" : isCurrentMonth ? "var(--text)" : "var(--text-muted)",
                        opacity: isCurrentMonth ? 1 : 0.6,
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
            onClick={() => setViewCenter((prev) => addDays(prev, -5))}
            style={{ flexShrink: 0, width: 40, height: 40, minWidth: 40, minHeight: 40, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
          >
            ‹
          </button>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {stripDates.map((d) => {
              const isSelected = toDateKey(d) === dateKey;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  style={{
                    width: 56, minWidth: 56, height: 56, minHeight: 56, padding: 0, borderRadius: "50%", border: "1px solid var(--border)",
                    background: isSelected ? "var(--avatar-gradient)" : "var(--card)", color: isSelected ? "white" : "var(--text)", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? "rgba(255,255,255,0.9)" : "var(--text-muted)" }}>{DAYS[d.getDay()]}</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{d.getDate()}</div>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setViewCenter((prev) => addDays(prev, 5))}
            style={{ flexShrink: 0, width: 40, height: 40, minWidth: 40, minHeight: 40, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
          >
            ›
          </button>
        </div>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Schedule</h3>
      <div className="float-card" style={{ marginBottom: 20, padding: 18 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Today&apos;s earnings</div>
        <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(todayEarnings)}</div>
      </div>
      {todaysStudents.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", fontStyle: "italic" }}>No lessons scheduled</p>
      ) : (
        todaysStudents.map((student) => {
          const lesson = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
          const completed = lesson?.completed ?? false;
          const effectiveDuration = getEffectiveDurationMinutes(student, dateKey);
          const effectiveRate = getEffectiveRateCents(student, dateKey);
          const amount = lesson?.amountCents ?? effectiveRate;
          const duration = lesson?.durationMinutes ?? effectiveDuration;
          const display = duration >= 60 ? `${duration / 60} hour / ${formatCurrency(effectiveRate)}` : `${duration} mins ${formatCurrency(effectiveRate)}`;
          return (
            <div key={student.id} className="float-card" style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <div style={{ marginRight: 14, flexShrink: 0 }} onClick={() => handlePressLesson(student)}>
                <StudentAvatar student={student} size={48} />
              </div>
              <div style={{ flex: 1 }} onClick={() => handlePressLesson(student)}>
                <div style={{ fontWeight: 600 }}>{student.firstName} {student.lastName}</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{display}</div>
              </div>
              <label className="toggle-wrap">
                <input type="checkbox" checked={completed} onChange={(e) => handleToggle(student.id, e.target.checked)} />
                {completed && <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatCurrency(amount)}</span>}
              </label>
            </div>
          );
        })
      )}
    </>
  );
}
