import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  formatCurrency,
  earnedThisWeek,
  getWeekBounds,
  earnedInDateRange,
  getMonthBounds,
  getStudentsForDay,
  getEffectiveSchedule,
  getEffectiveSchedules,
  getEffectiveDurationMinutes,
  getEffectiveRateCents,
  getLessonForStudentOnDate,
  getStudentIdsWithLessonOnDate,
  toDateKey,
  dedupeLessons,
  dedupeLessonsById,
  getSuppressedGeneratedSlotIds,
  computeLessonAmountCents,
  isStudentActive,
  getDayOfWeekFromDateKey,
} from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import VoiceButton from "@/components/VoiceButton";
import type { Lesson, Student } from "@/types";
import "./dashboard.css";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MusicNoteIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const CheckIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

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
  const duration = lesson?.durationMinutes ?? effectiveDuration;
  const effectiveAmountCents = computeLessonAmountCents(student, lesson ?? undefined, dateKey);
  const rateText = duration >= 60 ? `${duration / 60} hour` : `${duration} mins`;
  const dateDow = getDayOfWeekFromDateKey(dateKey);
  const schedules = getEffectiveSchedules(student, dateKey);
  const schedForDay = schedules.find((s) => s.dayOfWeek === dateDow);
  const fallbackTime = schedules.map((s) => s.timeOfDay).find((t) => t != null && String(t).trim() !== "");
  const displayTime =
    (lesson?.timeOfDay != null && String(lesson.timeOfDay).trim() !== "" ? lesson.timeOfDay : null) ??
    (schedForDay?.timeOfDay != null && String(schedForDay.timeOfDay).trim() !== "" ? schedForDay.timeOfDay : null) ??
    (student.timeOfDay != null && String(student.timeOfDay).trim() !== "" ? student.timeOfDay : null) ??
    (fallbackTime != null ? fallbackTime : null);
  const timeAndDuration = displayTime ? `${displayTime.trim()} · ${rateText}` : `— · ${rateText}`;
  return (
    <div className={`dashboard-lesson-row ${completed ? "dashboard-lesson-row--attended" : ""}`} onClick={onEdit}>
      <div className="dashboard-avatar-wrap">
        <StudentAvatar student={student} size={48} />
      </div>
      <div className="dashboard-lesson-row__body">
        <div className="dashboard-lesson-row__name">{student.firstName} {student.lastName}</div>
        <div className="dashboard-lesson-row__meta">{timeAndDuration}</div>
        <div className="dashboard-lesson-row__amount">{formatCurrency(effectiveAmountCents)}</div>
      </div>
      <label className="dashboard-toggle" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={completed} onChange={(e) => onToggle(e.target.checked)} />
        <span className="dashboard-toggle__circle">{completed && <CheckIcon />}</span>
        <span className="dashboard-toggle__label">{completed ? "Attended" : "Pending"}</span>
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
  const location = useLocation();
  const { data, addLesson, updateLesson } = useStoreContext();
  const { t } = useLanguage();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // After reschedule, EditLesson navigates here with state.goToDate so we show the new date (avoids accidentally adding a lesson on the old date)
  useEffect(() => {
    const goTo = (location.state as { goToDate?: Date } | null)?.goToDate;
    if (goTo && !isNaN(goTo.getTime())) {
      setSelectedDate(goTo);
      navigate(".", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const dateKey = toDateKey(selectedDate);
  const dayOfWeek = selectedDate.getDay();
  // Safety net: dedupe by id so we never show the same lesson twice (e.g. after reschedule)
  const dedupedLessons = useMemo(() => dedupeLessonsById(data.lessons), [data.lessons]);
  // Include all completed lessons for overview (rescheduled lessons have date off recurring schedule)
  const countableLessons = dedupeLessons(dedupedLessons.filter((l) => l.completed));
  const earned = earnedThisWeek(countableLessons, today);

  const { start: monthStart, end: monthEnd } = getMonthBounds(today);
  const monthStartKey = toDateKey(monthStart);
  const monthEndKey = toDateKey(monthEnd);
  const earningsThisMonth = earnedInDateRange(countableLessons, monthStartKey, monthEndKey);

  const year = today.getFullYear();
  const ytdEndKey = toDateKey(today);
  const earningsYTD = earnedInDateRange(countableLessons, `${year}-01-01`, ytdEndKey);

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
  const isToday = toDateKey(selectedDate) === toDateKey(today);

  const earnedOnSelectedDay = useMemo(() => {
    return dedupedLessons
      .filter((l) => l.date === dateKey && l.completed)
      .reduce((sum, l) => sum + (l.amountCents ?? 0), 0);
  }, [dedupedLessons, dateKey]);
  const completedCountOnDay = useMemo(
    () => dedupedLessons.filter((l) => l.date === dateKey && l.completed).length,
    [dedupedLessons, dateKey]
  );
  const totalScheduledOnDay = todaysStudents.length;
  const heroAmountDollars = (earnedOnSelectedDay / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const heroAmountDecimals = (earnedOnSelectedDay % 100)
    .toString()
    .padStart(2, "0");
  const heroCentsDisplay = `.${heroAmountDecimals}`;

  const heroTitle = isToday ? "Today's Earnings" : `${DAY_NAMES[dayOfWeek]}, ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} Earnings`;
  const dateNavLabel = isToday ? "Today" : `${DAY_NAMES[dayOfWeek]}, ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // If the student has a lesson on another date this week (rescheduled), return it so we can edit it instead of creating a new one.
  const getLessonElsewhereThisWeek = (studentId: string): Lesson | undefined => {
    const { start, end } = getWeekBounds(selectedDate);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    const inWeek = dedupedLessons.filter((l) => l.studentId === studentId && l.date >= startKey && l.date <= endKey && l.date !== dateKey);
    return inWeek[0];
  };

  const [attendedToast, setAttendedToast] = useState(false);
  const attendedToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (attendedToastRef.current) clearTimeout(attendedToastRef.current);
    };
  }, []);

  const handleToggle = (studentId: string, completed: boolean) => {
    const existing = getLessonForStudentOnDate(dedupedLessons, studentId, dateKey);
    const student = data.students.find((s) => s.id === studentId);
    if (existing) {
      const amountCents = existing.amountCents || (student ? getEffectiveRateCents(student, dateKey) : 0);
      const updates: { completed: boolean; amountCents?: number } = { completed };
      if (completed && amountCents > 0 && existing.amountCents !== amountCents) updates.amountCents = amountCents;
      updateLesson(existing.id, updates);
      if (completed) {
        if (attendedToastRef.current) clearTimeout(attendedToastRef.current);
        setAttendedToast(true);
        attendedToastRef.current = setTimeout(() => {
          setAttendedToast(false);
          attendedToastRef.current = null;
        }, 3000);
      }
    } else {
      const elsewhere = getLessonElsewhereThisWeek(studentId);
      if (!elsewhere) {
        if (!student) return;
        addLesson({ studentId, date: dateKey, durationMinutes: getEffectiveDurationMinutes(student, dateKey), amountCents: getEffectiveRateCents(student, dateKey), completed: true });
        if (attendedToastRef.current) clearTimeout(attendedToastRef.current);
        setAttendedToast(true);
        attendedToastRef.current = setTimeout(() => {
          setAttendedToast(false);
          attendedToastRef.current = null;
        }, 3000);
      }
    }
  };

  const handleEdit = async (student: Student) => {
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
    <div className="dashboard">
      <div className="dashboard-hero">
        <h2 className="dashboard-hero__title">{heroTitle}</h2>
        <div className="dashboard-hero__amount-wrap">
          <span className="dashboard-hero__amount-dollar">$</span>
          <span className="dashboard-hero__amount-main">{heroAmountDollars}</span>
          <span className="dashboard-hero__amount-cents">{heroCentsDisplay}</span>
        </div>
        <div className="dashboard-hero__pills">
          <span className="dashboard-pill">
            <span className="dashboard-pill__icon" aria-hidden><MusicNoteIcon /></span>
            <span>{completedCountOnDay}/{totalScheduledOnDay} lessons</span>
          </span>
          <span className="dashboard-pill dashboard-pill--nav">
            <button
              type="button"
              className="dashboard-pill__nav-btn"
              onClick={() => setSelectedDate((d) => addDays(d, -1))}
              aria-label="Previous day"
            >
              ‹
            </button>
            <span className="dashboard-pill__label">{dateNavLabel}</span>
            <button
              type="button"
              className="dashboard-pill__nav-btn"
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
              aria-label="Next day"
            >
              ›
            </button>
          </span>
        </div>
      </div>

      <div className="dashboard-summary-row">
        <div className="dashboard-summary-card">
          <div className="dashboard-summary-card__label">{t("dashboard.thisWeek")}</div>
          <div className="dashboard-summary-card__value">{formatCurrency(earned)}</div>
        </div>
        <div className="dashboard-summary-card dashboard-summary-card--highlight">
          <div className="dashboard-summary-card__label">{t("dashboard.thisMonth")}</div>
          <div className="dashboard-summary-card__value">{formatCurrency(earningsThisMonth)}</div>
        </div>
        <div className="dashboard-summary-card">
          <div className="dashboard-summary-card__label">{t("dashboard.ytd")}</div>
          <div className="dashboard-summary-card__value">{formatCurrency(earningsYTD)}</div>
        </div>
      </div>

      <div className="dashboard-lessons-header">
        <div>
          <h3 className="dashboard-lessons-title">{isToday ? t("dashboard.todaysLessons") : t("dashboard.lessons")}</h3>
          <p className="dashboard-lessons-subtitle">{DAY_NAMES[dayOfWeek]}, {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</p>
        </div>
        <span className="dashboard-scheduled-pill">{totalScheduledOnDay} scheduled</span>
      </div>

      {todaysStudents.length === 0 ? (
        <div className="dashboard-lessons-container">
          <p style={{ padding: 28, textAlign: "center", fontStyle: "italic", color: "#5a6b65", fontSize: 15, margin: 0 }}>{t("dashboard.noLessonsScheduled")}</p>
        </div>
      ) : (
        <div className="dashboard-lessons-container">
          {todaysStudents.map((student) => {
            const lesson = getLessonForStudentOnDate(dedupedLessons, student.id, dateKey);
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
          })}
        </div>
      )}

      <div style={{ marginTop: 28, textAlign: "center" }}>
        <Link to="/calendar" className="dashboard-calendar-btn">{t("dashboard.viewCalendar")}</Link>
      </div>

      {attendedToast && (
        <div className="dashboard-toast" role="status" aria-live="polite">
          <span className="dashboard-toast__icon" aria-hidden>
            <CheckIcon />
          </span>
          <span>Lesson marked as attended</span>
        </div>
      )}

      <VoiceButton dateKey={dateKey} dayOfWeek={dayOfWeek} onDateChange={setSelectedDate} />
    </div>
  );
}
