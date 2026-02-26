import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, getStudentsForDay, getEffectiveSchedule, getEffectiveDurationMinutes, getEffectiveRateCents, getLessonForStudentOnDate, getStudentIdsWithLessonOnDate, toDateKey, dedupeLessonsById, getWeekBounds, getSuppressedGeneratedSlotIds, computeLessonAmountCents, isStudentActive } from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import type { Lesson, Student } from "@/types";
import { IconButton } from "@/components/ui/Button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icons";
import "./calendar.css";

const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function Calendar() {
  const navigate = useNavigate();
  const { data, addLesson, updateLesson } = useStoreContext();
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [monthPickerView, setMonthPickerView] = useState(new Date());

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

  const gridYear = monthPickerView.getFullYear();
  const gridMonth = monthPickerView.getMonth();
  const gridFirst = new Date(gridYear, gridMonth, 1);
  const gridStart = new Date(gridFirst);
  gridStart.setDate(1 - gridFirst.getDay());
  const gridCells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < 28; i++) {
    const d = addDays(gridStart, i);
    gridCells.push({ date: d, isCurrentMonth: d.getMonth() === gridMonth });
  }

  return (
    <div className="calendar-page">
      <header className="calendar-page__header">
        <Link to="/" className="calendar-page__back">
          <ChevronLeftIcon /> {t("common.back")}
        </Link>
        <h1 className="calendar-page__title">{t("calendar.title")}</h1>
        <Link to="/add-student" className="calendar-page__add-btn" title={t("students.addStudent")} aria-label={t("students.addStudent")}>
          +
        </Link>
      </header>

      <div className="calendar-page__month-wrap">
        <button
          type="button"
          className="calendar-page__month-btn"
          onClick={() => setMonthPickerView(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))}
        >
          {monthPickerView.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </button>
      </div>

      <div className="calendar-page__grid-card">
        <div className="calendar-page__grid-header">
          <IconButton
            type="button"
            onClick={() => setMonthPickerView((d) => addDays(new Date(d.getFullYear(), d.getMonth(), 1), -1))}
            variant="ghost"
            size="sm"
            aria-label="Previous month"
          >
            <ChevronLeftIcon />
          </IconButton>
          <span className="calendar-page__grid-month">{monthPickerView.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
          <IconButton
            type="button"
            onClick={() => setMonthPickerView((d) => addDays(new Date(d.getFullYear(), d.getMonth() + 1, 0), 1))}
            variant="ghost"
            size="sm"
            aria-label="Next month"
          >
            <ChevronRightIcon />
          </IconButton>
        </div>
        <div className="calendar-page__weekdays">
          {DAYS_SHORT.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="calendar-page__dates">
          {gridCells.map(({ date, isCurrentMonth }) => {
            const key = toDateKey(date);
            const isSelected = key === dateKey;
            return (
              <button
                key={key}
                type="button"
                className={`calendar-page__date-cell ${!isCurrentMonth ? "calendar-page__date-cell--other-month" : ""} ${isSelected ? "calendar-page__date-cell--selected" : ""}`}
                onClick={() => {
                  setSelectedDate(date);
                  setMonthPickerView(new Date(date.getFullYear(), date.getMonth(), 1));
                }}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      <h2 className="calendar-page__schedule-title">Schedule</h2>
      <div className="calendar-page__earnings-card">
        <div className="calendar-page__earnings-label">Today&apos;s earnings</div>
        <div className="calendar-page__earnings-amount">{formatCurrency(todayEarnings)}</div>
      </div>
      {todaysStudents.length === 0 ? (
        <p className="calendar-page__empty">No lessons scheduled</p>
      ) : (
        todaysStudents.map((student) => {
          const lesson = getLessonForStudentOnDate(dedupedLessons, student.id, dateKey);
          const completed = lesson?.completed ?? false;
          const effectiveDuration = getEffectiveDurationMinutes(student, dateKey);
          const duration = lesson?.durationMinutes ?? effectiveDuration;
          const effectiveAmountCents = computeLessonAmountCents(student, lesson ?? undefined, dateKey);
          const display = duration >= 60 ? `${duration / 60} hour / ${formatCurrency(effectiveAmountCents)}` : `${duration} mins / ${formatCurrency(effectiveAmountCents)}`;
          return (
            <div key={student.id} className="calendar-page__lesson-card" onClick={() => handlePressLesson(student)}>
              <div className="calendar-page__lesson-avatar-wrap">
                <StudentAvatar student={student} size={48} />
              </div>
              <div className="calendar-page__lesson-body">
                <div className="calendar-page__lesson-name">{student.firstName} {student.lastName}</div>
                <div className="calendar-page__lesson-meta">{display}</div>
              </div>
              <div className="calendar-page__lesson-toggle-wrap" onClick={(e) => e.stopPropagation()}>
                <span className="calendar-page__lesson-amount">{formatCurrency(effectiveAmountCents)}</span>
                <label className="calendar-page__toggle-label">
                  <input
                    type="checkbox"
                    className="calendar-page__lesson-toggle"
                    checked={completed}
                    onChange={(e) => handleToggle(student.id, e.target.checked)}
                  />
                  <span className="calendar-page__lesson-toggle-track" aria-hidden />
                </label>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
