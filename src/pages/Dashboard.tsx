import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import LogoIcon from "@/components/LogoIcon";
import {
  formatCurrency,
  earnedThisWeek,
  getWeekBounds,
  earnedInDateRange,
  getMonthBounds,
  getStudentsForDay,
  getEffectiveSchedule,
  getEffectiveDurationMinutes,
  getEffectiveRateCents,
  getLessonForStudentOnDate,
  getStudentIdsWithLessonOnDate,
  toDateKey,
  dedupeLessons,
  dedupeLessonsById,
  filterLessonsOnScheduledDay,
  getSuppressedGeneratedSlotIds,
} from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import VoiceButton from "@/components/VoiceButton";
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
  const displayTime = lesson?.timeOfDay ?? getEffectiveSchedule(student, dateKey).timeOfDay;
  return (
    <div className="float-card" style={{ display: "flex", alignItems: "center", marginBottom: 12, cursor: "pointer", gap: 16 }} onClick={onEdit}>
      <StudentAvatar student={student} size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontFamily: "var(--font-sans)" }}>{student.firstName} {student.lastName}</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{rateText} / {formatCurrency(effectiveRate)}</div>
        {displayTime && displayTime !== "—" && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{displayTime}</div>
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
  const countableLessons = filterLessonsOnScheduledDay(
    dedupeLessons(dedupedLessons.filter((l) => l.completed)),
    data.students
  );
  const earned = earnedThisWeek(countableLessons, today);
  const studioOwnerName = data.user?.name?.trim().split(/\s+/)[0] ?? null;
  const dashboardTitle = studioOwnerName ? `${studioOwnerName}'s Studio Log` : "Studio Log";

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
  const rescheduledOnly = data.students.filter((s) => studentIdsWithLessonOnDate.has(s.id) && !scheduledIds.has(s.id));
  const todaysStudents = [...scheduledForDay, ...rescheduledOnly].sort((a, b) => {
    const lessonA = getLessonForStudentOnDate(dedupedLessons, a.id, dateKey);
    const lessonB = getLessonForStudentOnDate(dedupedLessons, b.id, dateKey);
    const timeA = lessonA?.timeOfDay ?? getEffectiveSchedule(a, dateKey)?.timeOfDay ?? a.timeOfDay ?? "";
    const timeB = lessonB?.timeOfDay ?? getEffectiveSchedule(b, dateKey)?.timeOfDay ?? b.timeOfDay ?? "";
    return timeA > timeB ? 1 : -1;
  });
  const isToday = toDateKey(selectedDate) === toDateKey(today);

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
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div className="logo-circle" style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <LogoIcon size={28} />
        </div>
        <h2 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0, color: "var(--text)" }}>{dashboardTitle}</h2>
      </div>
      <div className="hero-card" style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 16 }}>{t("earnings.overview")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("dashboard.thisWeek")}</div>
            <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earned)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("dashboard.thisMonth")}</div>
            <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earningsThisMonth)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("dashboard.ytd")}</div>
            <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earningsYTD)}</div>
          </div>
        </div>
      </div>
      <div className="float-card" style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 10, marginBottom: 16, padding: "12px 16px" }}>
        <h3 className="headline-serif" style={{ fontSize: 17, fontWeight: 400, margin: 0, flexShrink: 0 }}>
          {isToday ? t("dashboard.todaysLessons") : t("dashboard.lessons")}
        </h3>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 1, marginLeft: "auto", minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            className="pill"
            style={{ minWidth: 32, minHeight: 32, padding: "6px 8px", fontSize: 14 }}
            aria-label="Previous day"
          >
            ‹
          </button>
          <span style={{ minWidth: 88, textAlign: "center", fontSize: 13, color: "var(--text-muted)", flexShrink: 0 }}>
            {DAY_NAMES[dayOfWeek]}, {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="pill"
            style={{ minWidth: 32, minHeight: 32, padding: "6px 8px", fontSize: 14 }}
            aria-label="Next day"
          >
            ›
          </button>
        </span>
      </div>
      {todaysStudents.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: 28, fontSize: 15, textAlign: "center", fontStyle: "italic" }}>{t("dashboard.noLessonsScheduled")}</p>
      ) : (
        todaysStudents.map((student) => {
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
        })
      )}
      <div style={{ marginTop: 28, textAlign: "center" }}>
        <Link to="/calendar" className="btn btn-primary pill" style={{ textDecoration: "none", borderRadius: "var(--radius-pill)" }}>{t("dashboard.viewCalendar")}</Link>
      </div>
      <VoiceButton dateKey={dateKey} dayOfWeek={dayOfWeek} onDateChange={setSelectedDate} />
    </>
  );
}
