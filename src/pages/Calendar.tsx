import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, getStudentsForDay, getEffectiveSchedule, getEffectiveDurationMinutes, getEffectiveRateCents, getLessonForStudentOnDate, getStudentIdsWithLessonOnDate, toDateKey, dedupeLessonsById, getWeekBounds, getSuppressedGeneratedSlotIds, computeLessonAmountCents, isStudentActive } from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import type { Lesson, Student } from "@/types";
import { Button, IconButton } from "@/components/ui/Button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icons";

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
  const dedupedLessons = useMemo(() => dedupeLessonsById(data.lessons), [data.lessons]);
  const { start: weekStart, end: weekEnd } = getWeekBounds(selectedDate);
  const weekStartKey = toDateKey(weekStart);
  const weekEndKey = toDateKey(weekEnd);
  // Suppress generated recurring slots for students whose lesson was rescheduled away this week
  const suppressedGeneratedIds = getSuppressedGeneratedSlotIds(dedupedLessons, data.students, dateKey, weekStartKey, weekEndKey);
  const scheduledForDay = getStudentsForDay(data.students, dayOfWeek, dateKey).filter((s) => !suppressedGeneratedIds.has(s.id));
  const studentIdsWithLessonOnDate = getStudentIdsWithLessonOnDate(dedupedLessons, dateKey);
  const scheduledIds = new Set(scheduledForDay.map((s) => s.id));
  const rescheduledOnly = data.students.filter(
    (s) => studentIdsWithLessonOnDate.has(s.id) && !scheduledIds.has(s.id) && isStudentActive(s, dateKey)
  );
  const todaysStudents = [...scheduledForDay, ...rescheduledOnly].sort((a, b) => {
    const lessonA = getLessonForStudentOnDate(dedupedLessons, a.id, dateKey);
    const lessonB = getLessonForStudentOnDate(dedupedLessons, b.id, dateKey);
    const timeA = lessonA?.timeOfDay ?? getEffectiveSchedule(a, dateKey)?.timeOfDay ?? a.timeOfDay ?? "";
    const timeB = lessonB?.timeOfDay ?? getEffectiveSchedule(b, dateKey)?.timeOfDay ?? b.timeOfDay ?? "";
    return timeA > timeB ? 1 : -1;
  });
  const todaysStudentIds = new Set(todaysStudents.map((s) => s.id));
  // Only count completed lessons for students who are on today's schedule (avoids orphan lessons and matches Schedule list)
  const todayEarnings = dedupedLessons
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

  // If the student has a lesson on another date this week (rescheduled), return it so we can edit it instead of creating a new one.
  const getLessonElsewhereThisWeek = (studentId: string): Lesson | undefined => {
    const { start, end } = getWeekBounds(selectedDate);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    const inWeek = dedupedLessons.filter((l) => l.studentId === studentId && l.date >= startKey && l.date <= endKey && l.date !== dateKey);
    return inWeek[0];
  };

  const handleToggle = (studentId: string, completed: boolean) => {
    const existing = getLessonForStudentOnDate(dedupedLessons, studentId, dateKey);
    if (existing) updateLesson(existing.id, { completed });
    else {
      const elsewhere = getLessonElsewhereThisWeek(studentId);
      if (!elsewhere) {
        const student = data.students.find((s) => s.id === studentId);
        if (!student) return;
        addLesson({ studentId, date: dateKey, durationMinutes: getEffectiveDurationMinutes(student, dateKey), amountCents: getEffectiveRateCents(student, dateKey), completed: true });
      }
    }
  };

  const handlePressLesson = async (student: Student) => {
    const existing = getLessonForStudentOnDate(dedupedLessons, student.id, dateKey);
    if (existing) {
      navigate(`/edit-lesson/${existing.id}`);
      return;
    }
    const elsewhere = getLessonElsewhereThisWeek(student.id);
    if (elsewhere) {
      navigate(`/edit-lesson/${elsewhere.id}`);
      return;
    }
    const id = await addLesson({ studentId: student.id, date: dateKey, durationMinutes: getEffectiveDurationMinutes(student, dateKey), amountCents: getEffectiveRateCents(student, dateKey), completed: false });
    if (id) navigate(`/edit-lesson/${id}`);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, minHeight: 44 }}>
        <Link to="/" style={{ color: "var(--text)", textDecoration: "none", fontSize: 15, display: "inline-flex", alignItems: "center" }}>← {t("common.back")}</Link>
        <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0, lineHeight: 1 }}>{t("calendar.title")}</h1>
        <Button
          to="/add-student"
          title={t("students.addStudent")}
          variant="primary"
          size="sm"
          iconOnly
          aria-label={t("students.addStudent")}
        >
          +
        </Button>
      </div>
      <div style={{ marginBottom: 16, position: "relative" }} ref={monthPickerRef}>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => { setMonthPickerOpen((o) => !o); setMonthPickerView(selectedDate); }}
          style={{
            marginBottom: 12,
          }}
        >
          {selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Button>

        {monthPickerOpen && (
          <div className="float-card" style={{ position: "absolute", left: 16, right: 16, maxWidth: 360, zIndex: 50, marginBottom: 16, padding: 16, boxShadow: "var(--shadow-elevated)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <IconButton
                type="button"
                onClick={() => setMonthPickerView((d) => addDays(new Date(d.getFullYear(), d.getMonth(), 1), -1))}
                variant="secondary"
                size="sm"
                aria-label="Previous month"
              >
                <ChevronLeftIcon />
              </IconButton>
              <span style={{ fontWeight: 600, fontSize: 16, fontFamily: "var(--font-sans)" }}>{monthPickerView.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              <IconButton
                type="button"
                onClick={() => setMonthPickerView((d) => addDays(new Date(d.getFullYear(), d.getMonth() + 1, 0), 1))}
                variant="secondary"
                size="sm"
                aria-label="Next month"
              >
                <ChevronRightIcon />
              </IconButton>
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
                    <Button
                      key={key}
                      type="button"
                      variant={isSelected ? "primary" : "ghost"}
                      size="sm"
                      iconOnly
                      onClick={() => { setSelectedDate(date); setMonthPickerOpen(false); }}
                      style={{
                        minWidth: 36,
                        minHeight: 36,
                        borderRadius: "50%",
                        color: isSelected ? "white" : isCurrentMonth ? "var(--text)" : "var(--text-muted)",
                        opacity: isCurrentMonth ? 1 : 0.6,
                      }}
                    >
                      {date.getDate()}
                    </Button>
                  );
                });
              })()}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconButton
            type="button"
            onClick={() => setViewCenter((prev) => addDays(prev, -5))}
            variant="secondary"
            size="sm"
            style={{ flexShrink: 0 }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {stripDates.map((d) => {
              const isSelected = toDateKey(d) === dateKey;
              const chipTypography = {
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                fontWeight: 500,
                color: isSelected ? "rgba(255,255,255,0.95)" : "var(--text-muted)",
                lineHeight: 1.1,
              };
              const monthDayLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <Button
                  key={d.toISOString()}
                  type="button"
                  variant={isSelected ? "primary" : "secondary"}
                  size="sm"
                  iconOnly
                  onClick={() => setSelectedDate(d)}
                  style={{
                    width: 74, minWidth: 74, height: 56, minHeight: 56, borderRadius: 999,
                    color: chipTypography.color,
                    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)",
                  }}
                >
                  <div style={chipTypography}>{monthDayLabel}</div>
                </Button>
              );
            })}
          </div>
          <IconButton
            type="button"
            onClick={() => setViewCenter((prev) => addDays(prev, 5))}
            variant="secondary"
            size="sm"
            style={{ flexShrink: 0 }}
          >
            <ChevronRightIcon />
          </IconButton>
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
          const lesson = getLessonForStudentOnDate(dedupedLessons, student.id, dateKey);
          const completed = lesson?.completed ?? false;
          const effectiveDuration = getEffectiveDurationMinutes(student, dateKey);
          const duration = lesson?.durationMinutes ?? effectiveDuration;
          const effectiveAmountCents = computeLessonAmountCents(student, lesson ?? undefined, dateKey);
          const display = duration >= 60 ? `${duration / 60} hour / ${formatCurrency(effectiveAmountCents)}` : `${duration} mins / ${formatCurrency(effectiveAmountCents)}`;
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
                {completed && <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatCurrency(effectiveAmountCents)}</span>}
              </label>
            </div>
          );
        })
      )}
    </>
  );
}
