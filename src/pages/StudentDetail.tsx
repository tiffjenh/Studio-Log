import { useState, useEffect, useMemo, Fragment } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, getEffectiveSchedules, getAllScheduledDays, getDayOfWeekFromDateKey, getLessonForStudentOnDate, getEffectiveDurationMinutes, getEffectiveRateCents, toDateKey, computeLessonAmountCents, isStudentActive } from "@/utils/earnings";
import { getCurrencyByCode, getStoredCurrencyCode } from "@/utils/currencies";
import DatePicker from "@/components/DatePicker";
import StudentAvatar from "@/components/StudentAvatar";
import { hasSupabase } from "@/lib/supabase";
import { fetchStudentChangeEvents, insertStudentChangeEvent } from "@/store/supabaseSync";
import type { DaySchedule, Student, StudentChangeEvent } from "@/types";
import { Button, IconButton } from "@/components/ui/Button";
import { PencilIcon, ClockIcon, DollarIcon, CalendarIcon, ChevronDownIcon, TrashIcon, CloseIcon, RefreshIcon } from "@/components/ui/Icons";
import "./student-detail.mock.css";

const DURATIONS = [30, 45, 60, 90, 120];
const DURATION_LABELS: Record<number, string> = { 30: "30 min", 45: "45 min", 60: "1 hr", 90: "1.5 hr", 120: "2 hr" };
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseTimeOfDay(s: string): { hour: number; minute: number; amPm: "AM" | "PM" } {
  const t = s.trim();
  if (!t || t === "—") return { hour: 5, minute: 0, amPm: "PM" };
  const match = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return { hour: 5, minute: 0, amPm: "PM" };
  let hour = parseInt(match[1]!, 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const period = (match[3] || "").toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const amPm = hour < 12 ? "AM" : "PM";
  return { hour: displayHour, minute: Math.min(59, Math.max(0, minute)), amPm };
}

function formatDuration(mins: number): string {
  return mins === 60 ? "1 hour" : mins === 90 ? "1.5 hours" : mins === 120 ? "2 hours" : `${mins} min`;
}

function formatHistoryEventSentence(event: StudentChangeEvent): string {
  const { eventType, effectiveFromDate, oldValue, newValue } = event;
  const fmt = (c: number) => formatCurrency(c);
  const day = (dow: number) => DAYS_FULL[dow] ?? "";
  const dur = (m: number) => (m === 60 ? "1 hr" : m === 90 ? "1.5 hr" : `${m} min`);
  switch (eventType) {
    case "schedule_change_saved": {
      const sc = (newValue?.scheduleChange as Record<string, unknown>) ?? newValue;
      const from = (sc?.fromDate ?? effectiveFromDate) as string;
      const oldSc = (oldValue?.scheduleChange as Record<string, unknown>) ?? oldValue?.scheduleChange;
      const base = (oldValue?.base as Record<string, unknown>) ?? {};
      const oldStr = oldSc
        ? `${day((oldSc.dayOfWeek as number) ?? 0)}s ${(oldSc.timeOfDay as string) ?? "—"} (${dur((oldSc.durationMinutes as number) ?? 0)}, ${fmt((oldSc.rateCents as number) ?? 0)})`
        : `${day((base.dayOfWeek as number) ?? 0)}s ${(base.timeOfDay as string) ?? "—"} (${dur((base.durationMinutes as number) ?? 0)}, ${fmt((base.rateCents as number) ?? 0)})`;
      const newStr = sc ? `${day((sc.dayOfWeek as number) ?? 0)}s ${(sc.timeOfDay as string) ?? "—"} (${dur((sc.durationMinutes as number) ?? 0)}, ${fmt((sc.rateCents as number) ?? 0)})` : "";
      return from ? `Schedule change saved: Starting ${from}, lessons move from ${oldStr} to ${newStr}.` : `Schedule change saved: ${newStr}`;
    }
    case "schedule_change_canceled":
      return "Schedule change canceled.";
    case "schedule_change_applied": {
      const o = oldValue as Record<string, unknown> | undefined;
      const n = newValue as Record<string, unknown> | undefined;
      if (!o || !n) return "Schedule change applied.";
      const oldStr = `${day((o.dayOfWeek as number) ?? 0)}s ${(o.timeOfDay as string) ?? "—"} (${dur((o.durationMinutes as number) ?? 0)}, ${fmt((o.rateCents as number) ?? 0)})`;
      const newStr = `${day((n.dayOfWeek as number) ?? 0)}s ${(n.timeOfDay as string) ?? "—"} (${dur((n.durationMinutes as number) ?? 0)}, ${fmt((n.rateCents as number) ?? 0)})`;
      return `Schedule change applied: ${oldStr} → ${newStr}.`;
    }
    case "termination_saved":
      return effectiveFromDate ? `Termination scheduled: Last lesson ${effectiveFromDate}.` : "Termination scheduled.";
    case "termination_canceled":
      return "Termination canceled.";
    case "rate_changed": {
      const oldC = (oldValue?.rateCents ?? newValue?.rateCents) as number | undefined;
      const newC = (newValue?.rateCents ?? oldValue?.rateCents) as number | undefined;
      if (oldC != null && newC != null) return `Rate changed: ${fmt(oldC)} → ${fmt(newC)}`;
      return "Rate changed.";
    }
    case "duration_changed":
      return "Duration changed.";
    case "additional_schedule_changed":
      return "Frequency changed.";
    default:
      return eventType.replace(/_/g, " ") + ".";
  }
}

/** Parse "5:00pm" / "5:00 PM" style to minutes from midnight; return null if unparseable. */
function parseTimeToMinutes(t: string): number | null {
  if (!t || t.trim() === "" || t === "—") return null;
  const s = t.trim().toLowerCase();
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1]!, 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3];
  if (period === "pm" && hours !== 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  if (!period && hours < 12) hours += 12;
  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h >= 12 ? "pm" : "am";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m > 0 ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
}

/** Compact range e.g. "5-6pm". */
function formatCompactTimeRange(startTimeStr: string, durationMinutes: number): string {
  const startMins = parseTimeToMinutes(startTimeStr);
  if (startMins == null) return "—";
  const endMins = startMins + durationMinutes;
  const h1 = Math.floor(startMins / 60) % 24;
  const h2 = Math.floor(endMins / 60) % 24;
  const period = h1 >= 12 ? "pm" : "am";
  const hour1 = h1 === 0 ? 12 : h1 > 12 ? h1 - 12 : h1;
  const hour2 = h2 === 0 ? 12 : h2 > 12 ? h2 - 12 : h2;
  const m1 = startMins % 60;
  const m2 = endMins % 60;
  if (m1 === 0 && m2 === 0) return `${hour1}-${hour2}${period}`;
  return `${formatMinutesToTime(startMins)} - ${formatMinutesToTime(endMins)}`;
}

/** Count how many times a given day of week (0–6) appears between start and end (inclusive). */
function countDaysWithDayOfWeek(start: Date, end: Date, dayOfWeek: number): number {
  const startCopy = new Date(start);
  startCopy.setHours(0, 0, 0, 0);
  const endCopy = new Date(end);
  endCopy.setHours(23, 59, 59, 999);
  let count = 0;
  const d = new Date(startCopy);
  while (d <= endCopy) {
    if (d.getDay() === dayOfWeek) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** All dates in the month when the student was scheduled for a lesson (respects schedule change, termination, and multi-day). */
function getScheduledDateKeysInMonth(student: Student, year: number, month: number): string[] {
  const result: string[] = [];
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const dateKey = toDateKey(d);
    if (!isStudentActive(student, dateKey)) continue;
    const dayOfWeek = d.getDay();
    const schedules = getEffectiveSchedules(student, dateKey);
    if (schedules.some((s) => s.dayOfWeek === dayOfWeek)) result.push(dateKey);
  }
  return result;
}

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, updateStudent, deleteStudent, addLesson, updateLesson, reload } = useStoreContext();
  const { t } = useLanguage();
  const student = data.students.find((s) => s.id === id);
  const completedForStudent = data.lessons.filter((l) => l.studentId === id && l.completed);
  const studentLessons =
    student == null
      ? completedForStudent
      : completedForStudent.filter(
          (l) => {
            const lessonDay = getDayOfWeekFromDateKey(l.date);
            return getEffectiveSchedules(student, l.date).some((s) => s.dayOfWeek === lessonDay);
          }
        );
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonthPrefix = `${thisYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisYearLessons = studentLessons.filter((l) => l.date.startsWith(String(thisYear)));
  const thisMonthLessons = studentLessons.filter((l) => l.date.startsWith(thisMonthPrefix));
  const earningsThisMonth = thisMonthLessons.reduce((sum, l) => sum + l.amountCents, 0);
  const earningsYTD = studentLessons.reduce((sum, l) => sum + l.amountCents, 0);
  const monthLabel = now.toLocaleDateString("en-US", { month: "short" });
  const availableThisMonth =
    student != null
      ? getAllScheduledDays(student).reduce((sum, sched) =>
          sum + countDaysWithDayOfWeek(
            new Date(now.getFullYear(), now.getMonth(), 1),
            new Date(now.getFullYear(), now.getMonth() + 1, 0),
            sched.dayOfWeek
          ), 0)
      : 0;
  const availableThisYear =
    student != null
      ? getAllScheduledDays(student).reduce((sum, sched) =>
          sum + countDaysWithDayOfWeek(new Date(thisYear, 0, 1), now, sched.dayOfWeek), 0)
      : 0;

  const [editing, setEditing] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [selectedLessonYear, setSelectedLessonYear] = useState<number>(() => new Date().getFullYear());
  const lessonLogYears = useMemo(() => {
    const currentYear = now.getFullYear();
    const yearsWithLessons = [...new Set(studentLessons.map((l) => l.date.slice(0, 4)))];
    return [...new Set([String(currentYear), ...yearsWithLessons])].map(Number).sort((a, b) => b - a);
  }, [studentLessons]);
  useEffect(() => {
    if (lessonLogYears.length > 0 && !lessonLogYears.includes(selectedLessonYear)) setSelectedLessonYear(lessonLogYears[0]);
  }, [lessonLogYears, selectedLessonYear]);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState(student?.firstName ?? "");
  const [lastName, setLastName] = useState(student?.lastName ?? "");

  // Schedule entries (replaces multi-day selectedDays/perDay)
  const buildInitialEntries = (s: Student) => {
    const entries: { id: number; dayOfWeek: number; durationMinutes: number; rateDollars: string; timeOfDay: string }[] = [
      { id: 1, dayOfWeek: s.dayOfWeek, durationMinutes: s.durationMinutes, rateDollars: String((s.rateCents / 100).toFixed(2)), timeOfDay: s.timeOfDay },
    ];
    s.additionalSchedules?.forEach((as, i) => {
      entries.push({ id: i + 2, dayOfWeek: as.dayOfWeek, durationMinutes: as.durationMinutes, rateDollars: String((as.rateCents / 100).toFixed(2)), timeOfDay: as.timeOfDay });
    });
    return entries;
  };
  const [scheduleEntries, setScheduleEntries] = useState(() => student ? buildInitialEntries(student) : [{ id: 1, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" }]);
  let nextEntryId = scheduleEntries.length > 0 ? Math.max(...scheduleEntries.map((e) => e.id)) + 1 : 1;
  const addScheduleEntry = () => {
    setScheduleEntries((prev) => [...prev, { id: nextEntryId, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" }]);
  };
  const removeScheduleEntry = (entryId: number) => {
    setScheduleEntries((prev) => prev.length <= 1 ? prev : prev.filter((e) => e.id !== entryId));
  };
  const updateEntry = (entryId: number, field: string, value: string | number) => {
    setScheduleEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, [field]: value } : e));
  };
  const [perDayRateModalOpen, setPerDayRateModalOpen] = useState(false);
  const [perDayRateModalDay, setPerDayRateModalDay] = useState(0);
  const [perDayRateKeypadValue, setPerDayRateKeypadValue] = useState("");
  const [perDayTimePickerOpen, setPerDayTimePickerOpen] = useState(false);
  const [perDayTimePickerDay, setPerDayTimePickerDay] = useState(0);
  const [perDayTimePickerHour, setPerDayTimePickerHour] = useState(5);
  const [perDayTimePickerMinute, setPerDayTimePickerMinute] = useState(0);
  const [perDayTimePickerAmPm, setPerDayTimePickerAmPm] = useState<"AM" | "PM">("PM");

  const openPerDayRateModal = (entryId: number) => { setPerDayRateModalDay(entryId); const entry = scheduleEntries.find((e) => e.id === entryId); setPerDayRateKeypadValue(entry?.rateDollars || ""); setPerDayRateModalOpen(true); };
  const applyPerDayRate = () => { const v = perDayRateKeypadValue.trim(); if (v !== "" && !Number.isNaN(Number(v))) updateEntry(perDayRateModalDay, "rateDollars", v); setPerDayRateModalOpen(false); };
  const openPerDayTimePicker = (entryId: number) => { setPerDayTimePickerDay(entryId); const entry = scheduleEntries.find((e) => e.id === entryId); const p = parseTimeOfDay(entry?.timeOfDay || ""); setPerDayTimePickerHour(p.hour); setPerDayTimePickerMinute(p.minute); setPerDayTimePickerAmPm(p.amPm); setPerDayTimePickerOpen(true); };
  const applyPerDayTime = () => { updateEntry(perDayTimePickerDay, "timeOfDay", `${perDayTimePickerHour}:${String(perDayTimePickerMinute).padStart(2, "0")} ${perDayTimePickerAmPm}`); setPerDayTimePickerOpen(false); };
  const [scheduleChangeFromDate, setScheduleChangeFromDate] = useState(student?.scheduleChangeFromDate ?? "");
  // Schedule change entries (multi-day)
  type SchedEntry = { id: number; dayOfWeek: number; durationMinutes: number; rateDollars: string; timeOfDay: string };
  const buildInitialSchedChangeEntries = (s: Student): SchedEntry[] => {
    if (s.scheduleChangeDayOfWeek == null) return [{ id: 1, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" }];
    const entries: SchedEntry[] = [
      { id: 1, dayOfWeek: s.scheduleChangeDayOfWeek, durationMinutes: s.scheduleChangeDurationMinutes ?? s.durationMinutes, rateDollars: s.scheduleChangeRateCents != null ? String((s.scheduleChangeRateCents / 100).toFixed(2)) : String((s.rateCents / 100).toFixed(2)), timeOfDay: s.scheduleChangeTimeOfDay ?? "" },
    ];
    s.scheduleChangeAdditionalSchedules?.forEach((as, i) => {
      entries.push({ id: i + 2, dayOfWeek: as.dayOfWeek, durationMinutes: as.durationMinutes, rateDollars: String((as.rateCents / 100).toFixed(2)), timeOfDay: as.timeOfDay });
    });
    return entries;
  };
  const [schedChangeEntries, setSchedChangeEntries] = useState<SchedEntry[]>(() => student ? buildInitialSchedChangeEntries(student) : [{ id: 1, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" }]);
  let nextSchedChangeId = schedChangeEntries.length > 0 ? Math.max(...schedChangeEntries.map((e) => e.id)) + 1 : 1;
  const addSchedChangeEntry = () => {
    setSchedChangeEntries((prev) => [...prev, { id: nextSchedChangeId, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" }]);
  };
  const removeSchedChangeEntry = (entryId: number) => {
    setSchedChangeEntries((prev) => prev.length <= 1 ? prev : prev.filter((e) => e.id !== entryId));
  };
  const updateSchedChangeEntry = (entryId: number, field: string, value: string | number) => {
    setSchedChangeEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, [field]: value } : e));
  };
  const [schedChangeRateModalOpen, setSchedChangeRateModalOpen] = useState(false);
  const [schedChangeRateModalDay, setSchedChangeRateModalDay] = useState(0);
  const [schedChangeRateKeypadValue, setSchedChangeRateKeypadValue] = useState("");
  const [schedChangeTimePickerOpen, setSchedChangeTimePickerOpen] = useState(false);
  const [schedChangeTimePickerDay, setSchedChangeTimePickerDay] = useState(0);
  const [schedChangeTimePickerHour, setSchedChangeTimePickerHour] = useState(5);
  const [schedChangeTimePickerMinute, setSchedChangeTimePickerMinute] = useState(0);
  const [schedChangeTimePickerAmPm, setSchedChangeTimePickerAmPm] = useState<"AM" | "PM">("PM");
  const openSchedChangeRateModal = (entryId: number) => { setSchedChangeRateModalDay(entryId); const entry = schedChangeEntries.find((e) => e.id === entryId); setSchedChangeRateKeypadValue(entry?.rateDollars || ""); setSchedChangeRateModalOpen(true); };
  const applySchedChangeRate = () => { const v = schedChangeRateKeypadValue.trim(); if (v !== "" && !Number.isNaN(Number(v))) updateSchedChangeEntry(schedChangeRateModalDay, "rateDollars", v); setSchedChangeRateModalOpen(false); };
  const openSchedChangeTimePicker = (entryId: number) => { setSchedChangeTimePickerDay(entryId); const entry = schedChangeEntries.find((e) => e.id === entryId); const p = parseTimeOfDay(entry?.timeOfDay || ""); setSchedChangeTimePickerHour(p.hour); setSchedChangeTimePickerMinute(p.minute); setSchedChangeTimePickerAmPm(p.amPm); setSchedChangeTimePickerOpen(true); };
  const applySchedChangeTime = () => { updateSchedChangeEntry(schedChangeTimePickerDay, "timeOfDay", `${schedChangeTimePickerHour}:${String(schedChangeTimePickerMinute).padStart(2, "0")} ${schedChangeTimePickerAmPm}`); setSchedChangeTimePickerOpen(false); };
  const [terminatedFromDate, setTerminatedFromDate] = useState(student?.terminatedFromDate ?? "");
  const [changeScheduleModalOpen, setChangeScheduleModalOpen] = useState(false);
  const [endLessonsModalOpen, setEndLessonsModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [scheduleChangeSaveMessage, setScheduleChangeSaveMessage] = useState("");
  const [scheduleChangeCancelMessage, setScheduleChangeCancelMessage] = useState("");
  const [scheduleChangeError, setScheduleChangeError] = useState("");
  const [terminationSaveMessage, setTerminationSaveMessage] = useState("");
  const [terminationCancelMessage, setTerminationCancelMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<StudentChangeEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (student) {
      setEditing(false);
      setFirstName(student.firstName);
      setLastName(student.lastName);
      setScheduleEntries(buildInitialEntries(student));
      setScheduleChangeFromDate(student.scheduleChangeFromDate ?? "");
      setSchedChangeEntries(buildInitialSchedChangeEntries(student));
      setTerminatedFromDate(student.terminatedFromDate ?? "");
    }
  }, [id]);

  useEffect(() => {
    if (!historyOpen || !student || !data.user || !hasSupabase()) return;
    setHistoryLoading(true);
    fetchStudentChangeEvents(data.user.id, student.id)
      .then(setHistoryEvents)
      .catch(() => setHistoryEvents([]))
      .finally(() => setHistoryLoading(false));
  }, [historyOpen, student?.id, data.user?.id]);

  if (!student) return <p style={{ padding: 24 }}>Student not found</p>;

  const syncFormFromStudent = () => {
    setFirstName(student.firstName);
    setLastName(student.lastName);
    setScheduleEntries(buildInitialEntries(student));
    setScheduleChangeFromDate(student.scheduleChangeFromDate ?? "");
    setSchedChangeEntries(buildInitialSchedChangeEntries(student));
    setTerminatedFromDate(student.terminatedFromDate ?? "");
  };

  const handleStartEdit = () => {
    syncFormFromStudent();
    setError("");
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) return;

    // Build from schedule entries
    for (let i = 0; i < scheduleEntries.length; i++) {
      if (!scheduleEntries[i].rateDollars.trim()) { setError(`Please set a rate for lesson ${i + 1}.`); return; }
    }

    const primary = scheduleEntries[0];
    const primaryDay = primary.dayOfWeek;
    const primaryRateCents = Math.round(parseFloat(primary.rateDollars) * 100) || 0;
    const primaryTime = primary.timeOfDay.trim() || "\u2014";

    const additionalSchedules: DaySchedule[] = scheduleEntries.slice(1).map((entry) => ({
      dayOfWeek: entry.dayOfWeek,
      timeOfDay: entry.timeOfDay.trim() || "\u2014",
      durationMinutes: entry.durationMinutes,
      rateCents: Math.round(parseFloat(entry.rateDollars) * 100) || 0,
    }));

    const fromDateTrimmed = scheduleChangeFromDate.trim();
    // Schedule change entries validation
    if (fromDateTrimmed) {
      const firstSce = schedChangeEntries[0];
      if (!firstSce || !firstSce.timeOfDay.trim()) {
        setError("If you set a \"From date\" for schedule change, please set at least the time for the first day.");
        return;
      }
      for (let i = 0; i < schedChangeEntries.length; i++) {
        const sce = schedChangeEntries[i];
        const t = sce.timeOfDay.trim();
        if (t && t !== "\u2014" && !/am|pm/i.test(t)) {
          setError(`Schedule change time for ${DAYS_FULL[sce.dayOfWeek]} must include AM or PM (e.g. 5:00 PM).`);
          return;
        }
      }
    }
    const scePrimary = schedChangeEntries[0];
    const sceRateCents = scePrimary.rateDollars.trim() ? Math.round(parseFloat(scePrimary.rateDollars) * 100) || undefined : undefined;
    const sceAdditional: DaySchedule[] = schedChangeEntries.slice(1).map((sce) => ({
      dayOfWeek: sce.dayOfWeek,
      timeOfDay: sce.timeOfDay.trim() || "\u2014",
      durationMinutes: sce.durationMinutes,
      rateCents: sce.rateDollars.trim() ? Math.round(parseFloat(sce.rateDollars) * 100) || 0 : 0,
    }));
    const updates: Partial<Student> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      durationMinutes: primary.durationMinutes,
      rateCents: primaryRateCents,
      dayOfWeek: primaryDay,
      timeOfDay: primaryTime,
      additionalSchedules: additionalSchedules.length > 0 ? additionalSchedules : undefined,
      scheduleChangeFromDate: fromDateTrimmed || undefined,
      scheduleChangeDayOfWeek: fromDateTrimmed ? scePrimary.dayOfWeek : undefined,
      scheduleChangeTimeOfDay: fromDateTrimmed && scePrimary.timeOfDay.trim() ? (scePrimary.timeOfDay.trim() === "\u2014" ? "\u2014" : scePrimary.timeOfDay.trim()) : undefined,
      scheduleChangeDurationMinutes: fromDateTrimmed ? scePrimary.durationMinutes : undefined,
      scheduleChangeRateCents: fromDateTrimmed && sceRateCents != null ? sceRateCents : undefined,
      scheduleChangeAdditionalSchedules: fromDateTrimmed && sceAdditional.length > 0 ? sceAdditional : undefined,
      terminatedFromDate: terminatedFromDate.trim() || undefined,
    };
    try {
      await updateStudent(student.id, updates);
      setEditing(false);
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not save. Try again.";
      setError(msg);
    }
  };

  const handleSaveScheduleChange = async () => {
    setScheduleChangeError("");
    const fromDateTrimmed = scheduleChangeFromDate.trim();
    if (!fromDateTrimmed) {
      setScheduleChangeError(t("studentDetail.fromDateRequired"));
      return;
    }
    const first = schedChangeEntries[0];
    if (!first) {
      setScheduleChangeError(t("studentDetail.scheduleChangeFirstEntryRequired"));
      return;
    }
    if (!first.timeOfDay.trim() || first.timeOfDay.trim() === "\u2014") {
      setScheduleChangeError(t("studentDetail.scheduleChangeTimeRequired"));
      return;
    }
    if (!/am|pm/i.test(first.timeOfDay.trim())) {
      setScheduleChangeError(t("studentDetail.scheduleChangeTimeAmPm"));
      return;
    }
    const rateCents = first.rateDollars.trim() ? Math.round(parseFloat(first.rateDollars) * 100) : undefined;
    if (rateCents == null || rateCents < 0) {
      setScheduleChangeError(t("studentDetail.scheduleChangeRateRequired"));
      return;
    }
    const additionalSched: DaySchedule[] = schedChangeEntries.slice(1).map((sce) => ({
      dayOfWeek: sce.dayOfWeek,
      timeOfDay: sce.timeOfDay.trim() || "\u2014",
      durationMinutes: sce.durationMinutes,
      rateCents: sce.rateDollars.trim() ? Math.round(parseFloat(sce.rateDollars) * 100) || 0 : 0,
    }));
    const updates: Partial<Student> = {
      scheduleChangeFromDate: fromDateTrimmed,
      scheduleChangeDayOfWeek: first.dayOfWeek,
      scheduleChangeTimeOfDay: first.timeOfDay.trim(),
      scheduleChangeDurationMinutes: first.durationMinutes,
      scheduleChangeRateCents: rateCents,
      scheduleChangeAdditionalSchedules: additionalSched.length > 0 ? additionalSched : undefined,
    };
    try {
      const oldValue = {
        base: { dayOfWeek: student.dayOfWeek, timeOfDay: student.timeOfDay, durationMinutes: student.durationMinutes, rateCents: student.rateCents, additionalSchedules: student.additionalSchedules ?? null },
        scheduleChange: student.scheduleChangeFromDate ? { fromDate: student.scheduleChangeFromDate, dayOfWeek: student.scheduleChangeDayOfWeek, timeOfDay: student.scheduleChangeTimeOfDay, durationMinutes: student.scheduleChangeDurationMinutes, rateCents: student.scheduleChangeRateCents, additionalSchedules: student.scheduleChangeAdditionalSchedules ?? null } : null,
      };
      const newValue = { scheduleChange: { fromDate: fromDateTrimmed, dayOfWeek: first.dayOfWeek, timeOfDay: first.timeOfDay.trim(), durationMinutes: first.durationMinutes, rateCents: rateCents!, additionalSchedules: additionalSched.length > 0 ? additionalSched : null } };
      await updateStudent(student.id, updates);
      if (data.user && hasSupabase()) {
        await insertStudentChangeEvent(data.user.id, student.id, { eventType: "schedule_change_saved", effectiveFromDate: fromDateTrimmed, oldValue, newValue });
      }
      setScheduleChangeSaveMessage(t("studentDetail.scheduleChangeSaved"));
      setTimeout(() => setScheduleChangeSaveMessage(""), 2500);
      await reload();
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not save. Try again.";
      setScheduleChangeError(msg);
    }
  };

  const handleCancelUpcomingChange = async () => {
    try {
      const oldValue = student.scheduleChangeFromDate ? { scheduleChange: { fromDate: student.scheduleChangeFromDate, dayOfWeek: student.scheduleChangeDayOfWeek, timeOfDay: student.scheduleChangeTimeOfDay, durationMinutes: student.scheduleChangeDurationMinutes, rateCents: student.scheduleChangeRateCents, additionalSchedules: student.scheduleChangeAdditionalSchedules ?? null } } : null;
      await updateStudent(student.id, {
        scheduleChangeFromDate: undefined,
        scheduleChangeDayOfWeek: undefined,
        scheduleChangeTimeOfDay: undefined,
        scheduleChangeDurationMinutes: undefined,
        scheduleChangeRateCents: undefined,
        scheduleChangeAdditionalSchedules: undefined,
      });
      if (data.user && hasSupabase() && oldValue) {
        await insertStudentChangeEvent(data.user.id, student.id, { eventType: "schedule_change_canceled", oldValue, newValue: null });
      }
      setScheduleChangeCancelMessage(t("studentDetail.upcomingChangeCanceled"));
      setTimeout(() => setScheduleChangeCancelMessage(""), 2500);
      await reload();
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not cancel. Try again.";
      setScheduleChangeCancelMessage(msg);
    }
  };

  const handleSaveTermination = async () => {
    const dateTrimmed = terminatedFromDate.trim();
    if (!dateTrimmed) return;
    try {
      await updateStudent(student.id, { terminatedFromDate: dateTrimmed });
      if (data.user && hasSupabase()) {
        await insertStudentChangeEvent(data.user.id, student.id, { eventType: "termination_saved", effectiveFromDate: dateTrimmed });
      }
      setTerminationSaveMessage(t("studentDetail.terminationScheduled"));
      setTimeout(() => setTerminationSaveMessage(""), 2500);
      await reload();
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not save. Try again.";
      setTerminationSaveMessage(msg);
    }
  };

  const handleCancelTermination = async () => {
    try {
      await updateStudent(student.id, { terminatedFromDate: undefined });
      if (data.user && hasSupabase()) {
        await insertStudentChangeEvent(data.user.id, student.id, { eventType: "termination_canceled" });
      }
      setTerminationCancelMessage(t("studentDetail.terminationCanceled"));
      setTimeout(() => setTerminationCancelMessage(""), 2500);
      await reload();
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not cancel. Try again.";
      setTerminationCancelMessage(msg);
    }
  };

  const handleDelete = async () => {
    setDeleteConfirmOpen(false);
    setError("");
    try {
      await deleteStudent(student.id);
      navigate("/students");
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not delete. Try again.";
      setError(msg);
    }
  };

  const fontStyle = { fontFamily: "var(--font-sans)" };
  // (schedule change rate/time modals are handled via openSchedChangeRateModal / openSchedChangeTimePicker above)

  return (
    <div className="studentDetailPage">
      <div className="studentDetailPage__topBar">
        <Link to="/students" className="studentDetailPage__backCircle" aria-label={t("common.back")}>←</Link>
        <h1 className="studentDetailPage__name">{student.firstName} {student.lastName}</h1>
        {!editing ? (
          <Button type="button" variant="tab" size="sm" active onClick={handleStartEdit} className="studentDetailPage__editCircle" aria-label={t("common.edit")} title={t("common.edit")}>
            <PencilIcon size={20} />
          </Button>
        ) : (
          <Button type="button" variant="danger" size="sm" onClick={() => setDeleteConfirmOpen(true)} className="studentDetailPage__editCircle studentDetailPage__deletePill">{t("common.delete")}</Button>
        )}
      </div>

      {!editing && student.scheduleChangeFromDate && (
        <div className="float-card" style={{ marginBottom: 20, padding: "14px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, ...fontStyle }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>
              {student.scheduleChangeDayOfWeek != null && student.scheduleChangeTimeOfDay
                ? t("studentDetail.upcomingChangesText", {
                    fromDate: student.scheduleChangeFromDate,
                    weekday: DAYS_FULL[student.scheduleChangeDayOfWeek],
                    time: student.scheduleChangeTimeOfDay,
                    duration: student.scheduleChangeDurationMinutes ?? student.durationMinutes,
                    rate: ((student.scheduleChangeRateCents ?? student.rateCents) / 100).toFixed(2),
                  })
                : t("studentDetail.upcomingChangesTextShort", { fromDate: student.scheduleChangeFromDate })}
            </p>
            {scheduleChangeCancelMessage ? <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--success, #16a34a)" }}>{scheduleChangeCancelMessage}</p> : null}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleCancelUpcomingChange}>{t("common.cancel")}</Button>
        </div>
      )}

      {!editing && student.terminatedFromDate && student.terminatedFromDate >= toDateKey(new Date()) && (
        <div className="float-card" style={{ marginBottom: 20, padding: "14px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, ...fontStyle }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>
              {t("studentDetail.upcomingTerminationText", { date: student.terminatedFromDate })}
            </p>
            {terminationCancelMessage ? <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--success, #16a34a)" }}>{terminationCancelMessage}</p> : null}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleCancelTermination}>{t("common.cancel")}</Button>
        </div>
      )}

      {editing ? (
        <>
        <div className="studentDetailPage__editModalBackdrop" onClick={handleCancelEdit} role="presentation">
          <div className="studentDetailPage__editModalCard" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-student-title">
            <div className="studentDetailPage__editModalHeader">
              <h2 id="edit-student-title" className="studentDetailPage__editModalTitle">{t("studentDetail.editStudent")}</h2>
              <button type="button" className="studentDetailPage__editModalClose" onClick={handleCancelEdit} aria-label={t("common.cancel")}>
                <CloseIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} style={fontStyle}>
              <div className="studentDetailPage__editGrid2">
                <div>
                  <label className="studentDetailPage__editFieldLabel" htmlFor="edit-first-name">{t("studentDetail.firstName")}</label>
                  <input id="edit-first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("studentDetail.firstName")} className="studentDetailPage__editFieldInput" required />
                </div>
                <div>
                  <label className="studentDetailPage__editFieldLabel" htmlFor="edit-last-name">{t("studentDetail.lastName")}</label>
                  <input id="edit-last-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("studentDetail.lastName")} className="studentDetailPage__editFieldInput" required />
                </div>
              </div>
              <div className="studentDetailPage__editGrid2">
                <div>
                  <label className="studentDetailPage__editFieldLabel" htmlFor="edit-default-duration">{t("studentDetail.defaultDuration")}</label>
                  <select id="edit-default-duration" className="studentDetailPage__editFieldInput" value={scheduleEntries[0]?.durationMinutes ?? 45} onChange={(e) => scheduleEntries[0] && updateEntry(scheduleEntries[0].id, "durationMinutes", parseInt(e.target.value, 10))}>
                    {DURATIONS.map((m) => (
                      <option key={m} value={m}>{DURATION_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="studentDetailPage__editFieldLabel">{t("studentDetail.ratePerHour")}</label>
                  <button type="button" className="studentDetailPage__editFieldInput" onClick={() => scheduleEntries[0] && openPerDayRateModal(scheduleEntries[0].id)}>
                    {(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{scheduleEntries[0]?.rateDollars ?? "0"}
                  </button>
                </div>
              </div>
              <div className="studentDetailPage__weeklyHeaderRow">
                <span className="studentDetailPage__editFieldLabel">{t("studentDetail.weeklyScheduleLabel")}</span>
                <button type="button" className="studentDetailPage__addDayBtn" onClick={addScheduleEntry}>{t("studentDetail.addDay")}</button>
              </div>
              {scheduleEntries.map((entry) => (
                <div key={entry.id} className="studentDetailPage__scheduleCard">
                  <div className="studentDetailPage__scheduleCardTopRow">
                    <select className="studentDetailPage__scheduleDaySelect" value={entry.dayOfWeek} onChange={(e) => updateEntry(entry.id, "dayOfWeek", parseInt(e.target.value, 10))} aria-label="Day">
                      {DAYS_FULL.map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                    <button type="button" className="studentDetailPage__scheduleRemoveBtn" onClick={() => removeScheduleEntry(entry.id)} disabled={scheduleEntries.length <= 1} aria-label={t("common.delete")}>
                      <CloseIcon size={18} />
                    </button>
                  </div>
                  <div className="studentDetailPage__scheduleTwoCol">
                    <div>
                      <label className="studentDetailPage__editFieldLabel">{t("studentDetail.time")}</label>
                      <button type="button" className="studentDetailPage__editFieldInput" onClick={() => openPerDayTimePicker(entry.id)}>
                        <span>{entry.timeOfDay || "5:00 PM"}</span>
                        <ClockIcon size={16} />
                      </button>
                    </div>
                    <div>
                      <label className="studentDetailPage__editFieldLabel">{t("studentDetail.duration")}</label>
                      <select className="studentDetailPage__editFieldInput" value={entry.durationMinutes} onChange={(e) => updateEntry(entry.id, "durationMinutes", parseInt(e.target.value, 10))}>
                        {DURATIONS.map((m) => (
                          <option key={m} value={m}>{DURATION_LABELS[m]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {scheduleEntries.length > 1 && (
                    <div style={{ marginTop: 10 }}>
                      <label className="studentDetailPage__editFieldLabel">{t("studentDetail.rate")}</label>
                      <button type="button" className="studentDetailPage__editFieldInput" onClick={() => openPerDayRateModal(entry.id)}>
                        {(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{entry.rateDollars ?? "0"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {error ? <p style={{ color: "#dc2626", marginBottom: 16, marginTop: 12, ...fontStyle }}>{error}</p> : null}
              <div className="studentDetailPage__editActionRow">
                <Button type="button" variant="primary" size="sm" className="studentDetailPage__changeSchedulePill" onClick={() => { setChangeScheduleModalOpen(true); setEndLessonsModalOpen(false); }} leftIcon={<RefreshIcon size={14} />} style={{ flex: "1 1 0", minWidth: 0 }}>
                  {t("studentDetail.changeScheduleShort")}
                </Button>
                <Button type="button" variant="danger" size="sm" onClick={() => { setEndLessonsModalOpen(true); setChangeScheduleModalOpen(false); }} leftIcon={<CalendarIcon size={14} />} style={{ flex: "1 1 0", minWidth: 0 }}>
                  {t("studentDetail.endLessons")}
                </Button>
              </div>
              <div className="studentDetailPage__editBottomRow">
                <button type="button" className="studentDetailPage__secondaryCancel" onClick={handleCancelEdit}>{t("common.cancel")}</button>
                <button type="submit" className="studentDetailPage__primarySave">{t("studentDetail.saveChanges")}</button>
              </div>
            </form>
          </div>
        </div>

        {changeScheduleModalOpen && (
          <div className="studentDetailPage__overlayBackdrop" onClick={() => setChangeScheduleModalOpen(false)} role="presentation">
            <div className="studentDetailPage__overlayCard" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="change-schedule-title">
              <div className="studentDetailPage__overlayHeader">
                <h2 id="change-schedule-title" className="studentDetailPage__overlayTitle">{t("studentDetail.changeScheduleShort")}</h2>
                <button type="button" className="studentDetailPage__overlayClose" onClick={() => setChangeScheduleModalOpen(false)} aria-label={t("common.cancel")}>
                  <CloseIcon size={20} />
                </button>
              </div>
              <div className="studentDetailPage__overlayHint">
                <p>{t("studentDetail.scheduleChangeHint")}</p>
              </div>
              <label className="studentDetailPage__editFieldLabel" htmlFor="sched-change-from">{t("studentDetail.effectiveDate")}</label>
              <div className="studentDetailPage__dateFieldWrap">
                <DatePicker value={scheduleChangeFromDate} onChange={setScheduleChangeFromDate} placeholder="mm/dd/yyyy" id="sched-change-from" />
              </div>
              <div className="studentDetailPage__weeklyHeaderRow">
                <span className="studentDetailPage__editFieldLabel">{t("studentDetail.weeklyScheduleLabel")}</span>
                <button type="button" className="studentDetailPage__addDayBtn" onClick={addSchedChangeEntry}>{t("studentDetail.addDay")}</button>
              </div>
              {schedChangeEntries.map((entry) => (
                <div key={entry.id} className="studentDetailPage__scheduleCard">
                  <div className="studentDetailPage__scheduleCardTopRow">
                    <select className="studentDetailPage__scheduleDaySelect" value={entry.dayOfWeek} onChange={(e) => updateSchedChangeEntry(entry.id, "dayOfWeek", Number(e.target.value))} aria-label="Day">
                      {DAYS_FULL.map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                    {schedChangeEntries.length > 1 && (
                      <button type="button" className="studentDetailPage__scheduleRemoveBtn" onClick={() => removeSchedChangeEntry(entry.id)} aria-label={t("common.delete")}>
                        <CloseIcon size={18} />
                      </button>
                    )}
                  </div>
                  <div className="studentDetailPage__scheduleTwoCol">
                    <div>
                      <label className="studentDetailPage__editFieldLabel">{t("studentDetail.time")}</label>
                      <button type="button" className="studentDetailPage__editFieldInput" onClick={() => openSchedChangeTimePicker(entry.id)}>
                        <span>{entry.timeOfDay || "5:00 PM"}</span>
                        <ClockIcon size={16} />
                      </button>
                    </div>
                    <div>
                      <label className="studentDetailPage__editFieldLabel">{t("studentDetail.duration")}</label>
                      <select className="studentDetailPage__editFieldInput" value={entry.durationMinutes} onChange={(e) => updateSchedChangeEntry(entry.id, "durationMinutes", Number(e.target.value))}>
                        {DURATIONS.map((m) => (
                          <option key={m} value={m}>{DURATION_LABELS[m]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label className="studentDetailPage__editFieldLabel">{t("studentDetail.newRate")}</label>
                    <button type="button" className="studentDetailPage__editFieldInput" onClick={() => openSchedChangeRateModal(entry.id)}>
                      {(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{entry.rateDollars ?? "0"}
                    </button>
                  </div>
                </div>
              ))}
              {scheduleChangeError ? <p style={{ color: "#dc2626", marginBottom: 12, ...fontStyle }}>{scheduleChangeError}</p> : null}
              {scheduleChangeSaveMessage ? <p style={{ color: "var(--success, #16a34a)", marginBottom: 12, ...fontStyle }}>{scheduleChangeSaveMessage}</p> : null}
              <div className="studentDetailPage__editBottomRow">
                <button type="button" className="studentDetailPage__secondaryCancel" onClick={() => setChangeScheduleModalOpen(false)}>{t("common.cancel")}</button>
                <button type="button" className="studentDetailPage__primarySave" onClick={handleSaveScheduleChange}>{t("studentDetail.saveChanges")}</button>
              </div>
            </div>
          </div>
        )}

        {endLessonsModalOpen && (
          <div className="studentDetailPage__overlayBackdrop" onClick={() => setEndLessonsModalOpen(false)} role="presentation">
            <div className="studentDetailPage__overlayCard" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="end-lessons-title">
              <div className="studentDetailPage__overlayHeader">
                <h2 id="end-lessons-title" className="studentDetailPage__overlayTitle">{t("studentDetail.endLessons")}</h2>
                <button type="button" className="studentDetailPage__overlayClose" onClick={() => setEndLessonsModalOpen(false)} aria-label={t("common.cancel")}>
                  <CloseIcon size={20} />
                </button>
              </div>
              <div className="studentDetailPage__overlayHint">
                <p>{t("studentDetail.terminateHint")}</p>
              </div>
              <label className="studentDetailPage__editFieldLabel" htmlFor="end-lessons-date">{t("studentDetail.lastLessonDate")}</label>
              <div className="studentDetailPage__dateFieldWrap">
                <DatePicker value={terminatedFromDate} onChange={setTerminatedFromDate} placeholder="mm/dd/yyyy" id="end-lessons-date" />
              </div>
              {terminationSaveMessage ? <p style={{ color: "var(--success, #16a34a)", marginBottom: 12, ...fontStyle }}>{terminationSaveMessage}</p> : null}
              <div className="studentDetailPage__editBottomRow">
                <button type="button" className="studentDetailPage__secondaryCancel" onClick={() => setEndLessonsModalOpen(false)}>{t("common.cancel")}</button>
                <button type="button" className="studentDetailPage__endLessonsSave" onClick={handleSaveTermination} disabled={!terminatedFromDate.trim()}>{t("common.save")}</button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirmOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteConfirmOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 340, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>{t("common.areYouSure")}</h3>
              <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--text-muted)" }}>{t("common.deleteStudentConfirm")}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteConfirmOpen(false)}>{t("common.cancel")}</Button>
                <Button type="button" variant="danger" size="sm" onClick={handleDelete}>{t("common.delete")}</Button>
              </div>
            </div>
          </div>
        )}

        {perDayRateModalOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setPerDayRateModalOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <IconButton type="button" variant="ghost" size="sm" onClick={() => setPerDayRateModalOpen(false)} aria-label="Close">&times;</IconButton>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>{scheduleEntries.length > 1 ? `${DAY_SHORT[scheduleEntries.find((e) => e.id === perDayRateModalDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}Rate</p>
              <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>{(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{perDayRateKeypadValue || "0"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <Button key={n} type="button" variant="secondary" size="sm" onClick={() => setPerDayRateKeypadValue((v) => v + n)}>{n}</Button>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={() => setPerDayRateKeypadValue((v) => (v.includes(".") ? v : v + "."))}>.</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setPerDayRateKeypadValue((v) => v + "0")}>0</Button>
                <Button type="button" variant="tab" size="sm" onClick={() => setPerDayRateKeypadValue((v) => v.slice(0, -1))}>&larr;</Button>
              </div>
              <Button type="button" variant="primary" size="md" onClick={applyPerDayRate} fullWidth>Set rate</Button>
            </div>
          </div>
        )}
        {perDayTimePickerOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setPerDayTimePickerOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <IconButton type="button" variant="ghost" size="sm" onClick={() => setPerDayTimePickerOpen(false)} aria-label="Close">&times;</IconButton>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>{scheduleEntries.length > 1 ? `${DAY_SHORT[scheduleEntries.find((e) => e.id === perDayTimePickerDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}Select time</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <select value={perDayTimePickerHour} onChange={(e) => setPerDayTimePickerHour(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                    {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (<option key={h} value={h}>{h}</option>))}
                  </select>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>:</span>
                  <select value={perDayTimePickerMinute} onChange={(e) => setPerDayTimePickerMinute(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}</option>))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Button type="button" variant="tab" size="sm" active={perDayTimePickerAmPm === "AM"} onClick={() => setPerDayTimePickerAmPm("AM")}>AM</Button>
                  <Button type="button" variant="tab" size="sm" active={perDayTimePickerAmPm === "PM"} onClick={() => setPerDayTimePickerAmPm("PM")}>PM</Button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setPerDayTimePickerOpen(false)}>Cancel</Button>
                <Button type="button" variant="primary" size="sm" className="studentDetailPage__timeModalOk" onClick={applyPerDayTime}>OK</Button>
              </div>
            </div>
          </div>
        )}
        {schedChangeRateModalOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setSchedChangeRateModalOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <IconButton type="button" variant="ghost" size="sm" onClick={() => setSchedChangeRateModalOpen(false)} aria-label="Close">&times;</IconButton>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>{schedChangeEntries.length > 1 ? `${DAY_SHORT[schedChangeEntries.find((e) => e.id === schedChangeRateModalDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}New rate</p>
              <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>{(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{schedChangeRateKeypadValue || "0"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <Button key={n} type="button" variant="secondary" size="sm" onClick={() => setSchedChangeRateKeypadValue((v) => v + n)}>{n}</Button>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={() => setSchedChangeRateKeypadValue((v) => (v.includes(".") ? v : v + "."))}>.</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setSchedChangeRateKeypadValue((v) => v + "0")}>0</Button>
                <Button type="button" variant="tab" size="sm" onClick={() => setSchedChangeRateKeypadValue((v) => v.slice(0, -1))}>&larr;</Button>
              </div>
              <Button type="button" variant="primary" size="md" onClick={applySchedChangeRate} fullWidth>Set rate</Button>
            </div>
          </div>
        )}
        {schedChangeTimePickerOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setSchedChangeTimePickerOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <IconButton type="button" variant="ghost" size="sm" onClick={() => setSchedChangeTimePickerOpen(false)} aria-label="Close">&times;</IconButton>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>{schedChangeEntries.length > 1 ? `${DAY_SHORT[schedChangeEntries.find((e) => e.id === schedChangeTimePickerDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}New time</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <select value={schedChangeTimePickerHour} onChange={(e) => setSchedChangeTimePickerHour(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                    {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (<option key={h} value={h}>{h}</option>))}
                  </select>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>:</span>
                  <select value={schedChangeTimePickerMinute} onChange={(e) => setSchedChangeTimePickerMinute(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, ...fontStyle }}>
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}</option>))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Button type="button" variant="tab" size="sm" active={schedChangeTimePickerAmPm === "AM"} onClick={() => setSchedChangeTimePickerAmPm("AM")}>AM</Button>
                  <Button type="button" variant="tab" size="sm" active={schedChangeTimePickerAmPm === "PM"} onClick={() => setSchedChangeTimePickerAmPm("PM")}>PM</Button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setSchedChangeTimePickerOpen(false)}>Cancel</Button>
                <Button type="button" variant="primary" size="sm" className="studentDetailPage__timeModalOk" onClick={applySchedChangeTime}>OK</Button>
              </div>
            </div>
          </div>
        )}
        </>
      ) : (
        <>
          <div className="studentDetailPage__hero">
            <div className="studentDetailPage__heroHeader">
              <div className="studentDetailPage__heroAvatarWrap">
                <StudentAvatar student={student} size={56} variant="green" />
              </div>
              <div className="studentDetailPage__heroHeaderText">
                <span className="studentDetailPage__heroName">{student.firstName} {student.lastName}</span>
                <span className="studentDetailPage__heroRate">{formatCurrency(student.rateCents)}/hr · {formatDuration(student.durationMinutes)}</span>
              </div>
            </div>
            <div className="studentDetailPage__heroTiles" data-month={monthLabel} data-available-month={availableThisMonth} data-earnings-month={earningsThisMonth} data-available-year={availableThisYear}>
              <div className="studentDetailPage__heroTile">
                <span className="studentDetailPage__heroTileValue">{thisYearLessons.length}</span>
                <span className="studentDetailPage__heroTileLabel">{t("studentDetail.ytd")}</span>
              </div>
              <div className="studentDetailPage__heroTile">
                <span className="studentDetailPage__heroTileValue">{formatCurrency(earningsYTD)}</span>
                <span className="studentDetailPage__heroTileLabel">{t("studentDetail.ytdEarnings")}</span>
              </div>
            </div>
          </div>
          {/* DETAILS + WEEKLY SCHEDULE in one card */}
          <div className="float-card studentDetailPage__detailsAndScheduleCard">
            <h3 className="studentDetailPage__detailsTitle">{t("studentDetail.detailsLabel")}</h3>
            <div className="studentDetailPage__detailsRow">
              <span className="studentDetailPage__detailsIcon" aria-hidden><ClockIcon size={18} /></span>
              <span className="studentDetailPage__detailsLabel">{t("studentDetail.lessonDuration")}</span>
              <span className="studentDetailPage__detailsValue">{formatDuration(student.durationMinutes)}</span>
            </div>
            <div className="studentDetailPage__detailsRow">
              <span className="studentDetailPage__detailsIcon" aria-hidden><DollarIcon size={18} /></span>
              <span className="studentDetailPage__detailsLabel">{t("studentDetail.hourlyRate")}</span>
              <span className="studentDetailPage__detailsValue">{formatCurrency(student.rateCents)}/hr</span>
            </div>
            <div className="studentDetailPage__detailsRow">
              <span className="studentDetailPage__detailsIcon" aria-hidden><DollarIcon size={18} /></span>
              <span className="studentDetailPage__detailsLabel">{t("studentDetail.perLesson")}</span>
              <span className="studentDetailPage__detailsValue studentDetailPage__detailsValue--green">{formatCurrency(Math.round((student.rateCents * student.durationMinutes) / 60))}</span>
            </div>

            <div className="studentDetailPage__scheduleLabel">{t("studentDetail.weeklyScheduleLabel")}</div>
            {getAllScheduledDays(student).map((sched, i) => {
              const timeStr = sched.timeOfDay && sched.timeOfDay !== "\u2014" ? sched.timeOfDay : "";
              return (
                <div key={i} className="studentDetailPage__schedulePill" style={{ marginBottom: i < getAllScheduledDays(student).length - 1 ? 10 : 0 }}>
                  <span className="studentDetailPage__schedulePillIcon" aria-hidden><CalendarIcon size={18} /></span>
                  <div className="studentDetailPage__schedulePillText">
                    <span className="studentDetailPage__schedulePillDay">{DAYS_FULL[sched.dayOfWeek]}</span>
                    <span className="studentDetailPage__schedulePillTime">{timeStr ? `${timeStr} · ${formatDuration(sched.durationMinutes)}, ${formatCurrency(sched.rateCents)}` : formatDuration(sched.durationMinutes) + ", " + formatCurrency(sched.rateCents)}</span>
                  </div>
                </div>
              );
            })}
            {student.scheduleChangeFromDate && (() => {
              const allSchedChangeDays: DaySchedule[] = [];
              if (student.scheduleChangeDayOfWeek != null && student.scheduleChangeTimeOfDay != null) {
                allSchedChangeDays.push({ dayOfWeek: student.scheduleChangeDayOfWeek, timeOfDay: student.scheduleChangeTimeOfDay, durationMinutes: student.scheduleChangeDurationMinutes ?? student.durationMinutes, rateCents: student.scheduleChangeRateCents ?? student.rateCents });
              }
              (student.scheduleChangeAdditionalSchedules ?? []).forEach((s) => allSchedChangeDays.push(s));
              return (
                <div className="studentDetailPage__scheduleMeta" style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
                  <div style={{ marginBottom: 2 }}>From {new Date(student.scheduleChangeFromDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}:</div>
                  {allSchedChangeDays.map((sc, i) => {
                    const timeRange = sc.timeOfDay && sc.timeOfDay !== "\u2014" ? ` @ ${formatCompactTimeRange(sc.timeOfDay, sc.durationMinutes)}` : "";
                    return (
                      <div key={i} style={{ marginLeft: 8 }}>
                        {DAYS_FULL[sc.dayOfWeek]}s{timeRange} · {formatDuration(sc.durationMinutes)}, {formatCurrency(sc.rateCents)}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {student.terminatedFromDate && (
              <div className="studentDetailPage__scheduleMeta" style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>Last lesson: {new Date(student.terminatedFromDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            )}
          </div>
        </>
      )}

      {error && !editing ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}

      {!editing && student && (
        <>
          {lessonLogYears.length > 0 && student && (() => {
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;
            const yearSummaries = lessonLogYears.map((y) => {
              const yearLessons = studentLessons.filter((l) => l.date.startsWith(String(y)));
              const totalEarned = yearLessons.reduce((sum, l) => sum + l.amountCents, 0);
              return { year: y, lessonCount: yearLessons.length, totalEarned };
            });
            function getMonthRowsForYear(effectiveYear: number, s: Student) {
              const rows: { monthKey: string; monthName: string; scheduledDateKeys: string[]; completedCount: number; totalEarned: number }[] = [];
              const monthEnd = effectiveYear === currentYear ? currentMonth : 12;
              for (let month = 1; month <= monthEnd; month++) {
                const scheduledDateKeys = getScheduledDateKeysInMonth(s, effectiveYear, month);
                if (scheduledDateKeys.length === 0) continue;
                let completedCount = 0;
                let totalEarned = 0;
                for (const dateKey of scheduledDateKeys) {
                  const lesson = getLessonForStudentOnDate(data.lessons, s.id, dateKey);
                  if (lesson?.completed) {
                    completedCount++;
                    totalEarned += lesson.amountCents;
                  }
                }
                const first = new Date(effectiveYear, month - 1, 1);
                const monthName = first.toLocaleDateString("en-US", { month: "long" });
                const monthKey = `${effectiveYear}-${String(month).padStart(2, "0")}`;
                rows.push({ monthKey, monthName, scheduledDateKeys: scheduledDateKeys.sort((a, b) => b.localeCompare(a)), completedCount, totalEarned });
              }
              return rows;
            }
            return (
              <div className="studentDetailPage__historyCard">
                <div className="studentDetailPage__historyCardHeader">
                  <div>
                    <h3 className="studentDetailPage__historyCardTitle">{t("studentDetail.lessonHistory")}</h3>
                    <button type="button" onClick={() => setHistoryOpen(true)} className="studentDetailPage__historyLink">{t("studentDetail.history")}</button>
                  </div>
                </div>
                <div className="studentDetailPage__historyList">
                  {yearSummaries.map(({ year, lessonCount, totalEarned }) => {
                    const isYearExpanded = expandedYear === year;
                    const monthRows = isYearExpanded ? getMonthRowsForYear(year, student) : [];
                    return (
                      <Fragment key={year}>
                        <div
                          className="studentDetailPage__historyYearRow"
                          onClick={() => {
                            setExpandedYear((prev) => (prev === year ? null : year));
                            setExpandedMonth(null);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setExpandedYear((prev) => (prev === year ? null : year));
                              setExpandedMonth(null);
                            }
                          }}
                          aria-expanded={isYearExpanded}
                        >
                          <span className="studentDetailPage__historyYearSummary">{lessonCount} lessons · {formatCurrency(totalEarned)}</span>
                          <span className="studentDetailPage__historyYearPill">
                            {year}
                            <span className={isYearExpanded ? "studentDetailPage__historyYearPillChevron studentDetailPage__historyYearPillChevron--open" : "studentDetailPage__historyYearPillChevron"}>
                              <ChevronDownIcon size={14} />
                            </span>
                          </span>
                        </div>
                        {isYearExpanded && (
                          <>
                            {monthRows.length === 0 ? (
                              <p style={{ color: "var(--text-muted)", margin: 0, padding: 16 }}>{t("studentDetail.lessonsLogged")} {year} — no lessons</p>
                            ) : (
                              monthRows.map(({ monthKey, monthName, scheduledDateKeys, completedCount, totalEarned }) => (
                                <Fragment key={monthKey}>
                                  <div
                                    className="studentDetailPage__historyMonthRow"
                                    onClick={() => setExpandedMonth((prev) => (prev === monthKey ? null : monthKey))}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedMonth((prev) => (prev === monthKey ? null : monthKey)); } }}
                                    aria-expanded={expandedMonth === monthKey}
                                  >
                                    <span>{expandedMonth === monthKey ? "▼ " : "▶ "}{monthName}</span>
                                    <span className="studentDetailPage__historyMonthMeta">{completedCount}/{scheduledDateKeys.length} · {formatCurrency(totalEarned)}</span>
                                  </div>
                                  <div className={`studentDetailPage__historyMonthContent ${expandedMonth === monthKey ? "open" : "closed"}`}>
                                    {scheduledDateKeys.map((dateKey) => {
                                      const lesson = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
                                      const attended = lesson?.completed ?? false;
                                      const handleToggle = async () => {
                                        if (attended) {
                                          if (lesson) await updateLesson(lesson.id, { completed: false });
                                        } else {
                                          const duration = getEffectiveDurationMinutes(student, dateKey);
                                          const amount = getEffectiveRateCents(student, dateKey);
                                          if (lesson) {
                                            await updateLesson(lesson.id, { completed: true, durationMinutes: duration, amountCents: amount });
                                          } else {
                                            await addLesson({ studentId: student.id, date: dateKey, durationMinutes: duration, amountCents: amount, completed: true });
                                          }
                                        }
                                      };
                                      const displayDate = new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                                      const durationMins = lesson?.durationMinutes ?? getEffectiveDurationMinutes(student, dateKey);
                                      return (
                                        <button
                                          key={dateKey}
                                          type="button"
                                          className="studentDetailPage__historyRow"
                                          onClick={handleToggle}
                                        >
                                          <span className="studentDetailPage__historyDot" />
                                          <div className="studentDetailPage__historyRowText">
                                            <span className="studentDetailPage__historyRowDate">{displayDate}</span>
                                            <span className="studentDetailPage__historyRowDuration">{durationMins} minutes</span>
                                          </div>
                                          <span className="studentDetailPage__historyAmount">{attended && lesson ? formatCurrency(computeLessonAmountCents(student, lesson, dateKey)) : "—"}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </Fragment>
                              ))
                            )}
                          </>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {!editing && student && (
        <div className="studentDetailPage__bottomActions">
          <button
            type="button"
            className="studentDetailPage__actionPill studentDetailPage__actionPill--orange"
            onClick={() => { setEditing(true); setEndLessonsModalOpen(true); }}
          >
            {t("studentDetail.markInactive")}
          </button>
          <button
            type="button"
            className="studentDetailPage__actionPill studentDetailPage__actionPill--red"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <TrashIcon size={14} />
            {t("studentDetail.deleteStudent")}
          </button>
        </div>
      )}

      {historyOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(0,0,0,0.3)" }}
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="float-card"
            style={{ maxHeight: "70vh", display: "flex", flexDirection: "column", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 18, ...fontStyle }}>{t("studentDetail.history")}</span>
              <IconButton type="button" variant="ghost" size="sm" onClick={() => setHistoryOpen(false)} aria-label="Close">×</IconButton>
            </div>
            <div style={{ overflow: "auto", padding: 16 }}>
              {historyLoading ? (
                <p style={{ color: "var(--text-muted)", ...fontStyle }}>Loading…</p>
              ) : historyEvents.length === 0 ? (
                <p style={{ color: "var(--text-muted)", ...fontStyle }}>No changes yet.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {historyEvents.map((ev) => (
                    <li key={ev.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                        {new Date(ev.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })} {new Date(ev.createdAt).toLocaleTimeString(undefined, { timeStyle: "short" })}
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text)", ...fontStyle }}>{formatHistoryEventSentence(ev)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
