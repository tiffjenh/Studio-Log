import { useState, useEffect, Fragment } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, getEffectiveSchedules, getAllScheduledDays, getDayOfWeekFromDateKey, getLessonForStudentOnDate, getEffectiveDurationMinutes, getEffectiveRateCents, toDateKey } from "@/utils/earnings";
import { getCurrencyByCode, getStoredCurrencyCode } from "@/utils/currencies";
import DatePicker from "@/components/DatePicker";
import StudentAvatar from "@/components/StudentAvatar";
import type { DaySchedule, Student } from "@/types";

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
    if (student.terminatedFromDate && dateKey > student.terminatedFromDate) continue;
    const dayOfWeek = d.getDay();
    const schedules = getEffectiveSchedules(student, dateKey);
    if (schedules.some((s) => s.dayOfWeek === dayOfWeek)) result.push(dateKey);
  }
  return result;
}

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, updateStudent, deleteStudent, addLesson, updateLesson } = useStoreContext();
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
  const [changeScheduleOpen, setChangeScheduleOpen] = useState(false);
  const [terminateStudentOpen, setTerminateStudentOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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
  const inputStyle: React.CSSProperties = { width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, ...fontStyle };
  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 8, fontWeight: 600, ...fontStyle };
  const rowStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, minWidth: 0 };

  // (schedule change rate/time modals are handled via openSchedChangeRateModal / openSchedChangeTimePicker above)

  return (
    <>
      <Link to="/students" style={{ display: "inline-flex", alignItems: "center", marginBottom: 20, color: "var(--text)", textDecoration: "none", fontSize: 15 }}>← Back</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <StudentAvatar student={student} size={48} />
          <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0 }}>{student.firstName} {student.lastName}</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!editing ? (
            <button type="button" onClick={handleStartEdit} className="pill pill--active" style={{ padding: "10px 18px" }}>{t("common.edit")}</button>
          ) : (
            <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="btn" style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600, border: "1px solid rgba(220,38,38,0.4)", background: "transparent", color: "#dc2626", ...fontStyle }}>{t("common.delete")}</button>
          )}
        </div>
      </div>

      {editing ? (
        <div>
        <form onSubmit={handleSaveEdit} className="float-card" style={{ marginBottom: 28, ...fontStyle }}>
          <label style={labelStyle}>First name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} required />
          <label style={labelStyle}>Last name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} required />
          {/* Schedule entries */}
          {scheduleEntries.map((entry) => (
            <div key={entry.id} style={{ marginBottom: 20, padding: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 15, ...fontStyle }}>{DAYS_FULL[entry.dayOfWeek]} Lesson</span>
                {scheduleEntries.length > 1 && (
                  <button type="button" onClick={() => removeScheduleEntry(entry.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#dc2626", padding: "4px 8px", fontWeight: 600, ...fontStyle }}>Delete Day</button>
                )}
              </div>
              <label style={labelStyle}>Day of week</label>
              <div style={rowStyle}>
                {DAY_SHORT.map((label, i) => (
                  <button key={i} type="button" onClick={() => updateEntry(entry.id, "dayOfWeek", i)} className={entry.dayOfWeek === i ? "pill pill--active" : "pill"} style={{ padding: "8px 10px", fontSize: 13, flexShrink: 0, ...fontStyle }}>{label}</button>
                ))}
              </div>
              <label style={labelStyle}>Lesson duration</label>
              <div style={rowStyle}>
                {DURATIONS.map((m) => (
                  <button key={m} type="button" onClick={() => updateEntry(entry.id, "durationMinutes", m)} className={entry.durationMinutes === m ? "pill pill--active" : "pill"} style={{ padding: "8px 12px", fontSize: 14, flexShrink: 0, ...fontStyle }}>
                    {DURATION_LABELS[m]}
                  </button>
                ))}
              </div>
              <label style={labelStyle}>Rate</label>
              <button type="button" onClick={() => openPerDayRateModal(entry.id)} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
                {entry.rateDollars ? `${getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$"}${entry.rateDollars}` : (getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$") + "0"}
              </button>
              <label style={labelStyle}>Time</label>
              <button type="button" onClick={() => openPerDayTimePicker(entry.id)} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 0, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
                {entry.timeOfDay || "5:00 PM"}
              </button>
            </div>
          ))}
          <button type="button" onClick={addScheduleEntry} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 16, ...fontStyle }}>
            + Day
          </button>

          {error ? <p style={{ color: "#dc2626", marginBottom: 16, ...fontStyle }}>{error}</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" style={fontStyle}>{t("common.save")}</button>
            <button type="button" onClick={handleCancelEdit} className="btn" style={{ border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", ...fontStyle }}>{t("common.cancel")}</button>
          </div>
        </form>

        {/* Change Schedule / Terminate — outside the card so it expands full width */}
        <div style={{ marginTop: 20, marginBottom: 28 }}>
          {/* Buttons row - always side by side */}
          <div style={{ display: "flex", gap: 8, marginBottom: (changeScheduleOpen || terminateStudentOpen) ? 12 : 0 }}>
            <button
              type="button"
              onClick={() => { setChangeScheduleOpen((o) => !o); setTerminateStudentOpen(false); }}
              style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-start", padding: "12px 14px", background: changeScheduleOpen ? "rgba(201, 123, 148, 0.1)" : "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", fontSize: "clamp(12px, 2.5vw, 16px)", fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text-muted)", textAlign: "left" }}
            >
              <span style={{ fontSize: 14 }}>{changeScheduleOpen ? "\u25BC" : "\u25B6"}</span>
              {t("studentDetail.changeSchedule")}
            </button>
            <button
              type="button"
              onClick={() => { setTerminateStudentOpen((o) => !o); setChangeScheduleOpen(false); }}
              style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-start", padding: "12px 14px", background: terminateStudentOpen ? "rgba(201, 123, 148, 0.1)" : "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", fontSize: "clamp(12px, 2.5vw, 16px)", fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text-muted)", textAlign: "left" }}
            >
              <span style={{ fontSize: 14 }}>{terminateStudentOpen ? "\u25BC" : "\u25B6"}</span>
              {t("studentDetail.terminateStudent")}
            </button>
          </div>
          {/* Expanded content - full width below */}
          {changeScheduleOpen && (
            <div className="float-card" style={{ padding: "16px 20px 20px" }}>
              <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 12px" }}>{t("studentDetail.scheduleChangeHint")}</p>
              <label style={labelStyle}>{t("studentDetail.fromDate")}</label>
              <div style={{ marginBottom: 16 }}>
                <DatePicker value={scheduleChangeFromDate} onChange={setScheduleChangeFromDate} placeholder="Select date" />
              </div>
              {schedChangeEntries.map((entry) => (
                <div key={entry.id} style={{ marginBottom: 20, padding: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, ...fontStyle }}>{DAYS_FULL[entry.dayOfWeek]} Lesson</span>
                    {schedChangeEntries.length > 1 && (
                      <button type="button" onClick={() => removeSchedChangeEntry(entry.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#dc2626", padding: "4px 8px", fontWeight: 600, ...fontStyle }}>Delete Day</button>
                    )}
                  </div>
                  <label style={labelStyle}>{t("studentDetail.newDayOfWeek")}</label>
                  <div style={rowStyle}>
                    {DAY_SHORT.map((label, i) => (
                      <button key={i} type="button" onClick={() => updateSchedChangeEntry(entry.id, "dayOfWeek", i)} className={entry.dayOfWeek === i ? "pill pill--active" : "pill"} style={{ padding: "8px 10px", fontSize: 13, flexShrink: 0, ...fontStyle }}>{label}</button>
                    ))}
                  </div>
                  <label style={labelStyle}>{t("studentDetail.newLessonDuration")}</label>
                  <div style={rowStyle}>
                    {DURATIONS.map((m) => (
                      <button key={m} type="button" onClick={() => updateSchedChangeEntry(entry.id, "durationMinutes", m)} className={entry.durationMinutes === m ? "pill pill--active" : "pill"} style={{ padding: "8px 12px", fontSize: 14, flexShrink: 0, ...fontStyle }}>
                        {DURATION_LABELS[m]}
                      </button>
                    ))}
                  </div>
                  <label style={labelStyle}>{t("studentDetail.newRate")}</label>
                  <button type="button" onClick={() => openSchedChangeRateModal(entry.id)} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
                    {entry.rateDollars ? `${getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$"}${entry.rateDollars}` : (getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$") + "0"}
                  </button>
                  <label style={labelStyle}>{t("common.newTime")}</label>
                  <button type="button" onClick={() => openSchedChangeTimePicker(entry.id)} style={{ width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 0, fontSize: 16, textAlign: "left", background: "var(--card)", cursor: "pointer", ...fontStyle }}>
                    {entry.timeOfDay || "5:00 PM"}
                  </button>
                </div>
              ))}
              <button type="button" onClick={addSchedChangeEntry} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text-muted)", ...fontStyle }}>
                + Day
              </button>
            </div>
          )}
          {terminateStudentOpen && (
            <div className="float-card" style={{ padding: "16px 20px 20px" }}>
              <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 12px" }}>{t("studentDetail.terminateHint")}</p>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>{t("studentDetail.lastLessonDate")}</label>
              <div style={{ marginBottom: 16 }}>
                <DatePicker value={terminatedFromDate} onChange={setTerminatedFromDate} placeholder="Select date" />
              </div>
            </div>
          )}
        </div>

        {deleteConfirmOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteConfirmOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 340, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>{t("common.areYouSure")}</h3>
              <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--text-muted)" }}>{t("common.deleteStudentConfirm")}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setDeleteConfirmOpen(false)} className="btn" style={{ border: "1px solid var(--border)", background: "var(--card)", ...fontStyle }}>{t("common.cancel")}</button>
                <button type="button" onClick={handleDelete} className="btn" style={{ border: "1px solid rgba(220,38,38,0.4)", background: "transparent", color: "#dc2626", ...fontStyle }}>{t("common.delete")}</button>
              </div>
            </div>
          </div>
        )}

        {perDayRateModalOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setPerDayRateModalOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button type="button" onClick={() => setPerDayRateModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>&times;</button>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>{scheduleEntries.length > 1 ? `${DAY_SHORT[scheduleEntries.find((e) => e.id === perDayRateModalDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}Rate</p>
              <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>{(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{perDayRateKeypadValue || "0"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} type="button" onClick={() => setPerDayRateKeypadValue((v) => v + n)} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>{n}</button>
                ))}
                <button type="button" onClick={() => setPerDayRateKeypadValue((v) => (v.includes(".") ? v : v + "."))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, cursor: "pointer", ...fontStyle }}>.</button>
                <button type="button" onClick={() => setPerDayRateKeypadValue((v) => v + "0")} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>0</button>
                <button type="button" onClick={() => setPerDayRateKeypadValue((v) => v.slice(0, -1))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(180, 160, 180, 0.12)", fontSize: 18, cursor: "pointer", ...fontStyle }}>&larr;</button>
              </div>
              <button type="button" onClick={applyPerDayRate} className="btn btn-primary" style={{ width: "100%", ...fontStyle }}>Set rate</button>
            </div>
          </div>
        )}
        {perDayTimePickerOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setPerDayTimePickerOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button type="button" onClick={() => setPerDayTimePickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>&times;</button>
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
                  <button type="button" onClick={() => setPerDayTimePickerAmPm("AM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: perDayTimePickerAmPm === "AM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>AM</button>
                  <button type="button" onClick={() => setPerDayTimePickerAmPm("PM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: perDayTimePickerAmPm === "PM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>PM</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setPerDayTimePickerOpen(false)} style={{ padding: "10px 20px", background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", ...fontStyle }}>Cancel</button>
                <button type="button" onClick={applyPerDayTime} className="btn btn-primary" style={{ padding: "10px 20px", ...fontStyle }}>OK</button>
              </div>
            </div>
          </div>
        )}
        {schedChangeRateModalOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setSchedChangeRateModalOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button type="button" onClick={() => setSchedChangeRateModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>&times;</button>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)" }}>{schedChangeEntries.length > 1 ? `${DAY_SHORT[schedChangeEntries.find((e) => e.id === schedChangeRateModalDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}New rate</p>
              <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>{(getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$")}{schedChangeRateKeypadValue || "0"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} type="button" onClick={() => setSchedChangeRateKeypadValue((v) => v + n)} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>{n}</button>
                ))}
                <button type="button" onClick={() => setSchedChangeRateKeypadValue((v) => (v.includes(".") ? v : v + "."))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, cursor: "pointer", ...fontStyle }}>.</button>
                <button type="button" onClick={() => setSchedChangeRateKeypadValue((v) => v + "0")} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, cursor: "pointer", ...fontStyle }}>0</button>
                <button type="button" onClick={() => setSchedChangeRateKeypadValue((v) => v.slice(0, -1))} style={{ padding: "14px", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(180, 160, 180, 0.12)", fontSize: 18, cursor: "pointer", ...fontStyle }}>&larr;</button>
              </div>
              <button type="button" onClick={applySchedChangeRate} className="btn btn-primary" style={{ width: "100%", ...fontStyle }}>Set rate</button>
            </div>
          </div>
        )}
        {schedChangeTimePickerOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setSchedChangeTimePickerOpen(false)}>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", ...fontStyle }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button type="button" onClick={() => setSchedChangeTimePickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>&times;</button>
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
                  <button type="button" onClick={() => setSchedChangeTimePickerAmPm("AM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: schedChangeTimePickerAmPm === "AM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>AM</button>
                  <button type="button" onClick={() => setSchedChangeTimePickerAmPm("PM")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: schedChangeTimePickerAmPm === "PM" ? "rgba(201, 123, 148, 0.2)" : "var(--card)", fontWeight: 600, cursor: "pointer", fontSize: 14, ...fontStyle }}>PM</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setSchedChangeTimePickerOpen(false)} style={{ padding: "10px 20px", background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", ...fontStyle }}>Cancel</button>
                <button type="button" onClick={applySchedChangeTime} className="btn btn-primary" style={{ padding: "10px 20px", ...fontStyle }}>OK</button>
              </div>
            </div>
          </div>
        )}
        </div>
      ) : (
        <>
          <div className="hero-card" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12 }}>{t("studentDetail.progressEarnings")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.3, whiteSpace: "nowrap" }}>{thisMonthLessons.length} out of {availableThisMonth} lessons</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{monthLabel}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="headline-serif" style={{ fontSize: 24, fontWeight: 400 }}>{formatCurrency(earningsThisMonth)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t("studentDetail.thisMonth")}</div>
              </div>
              <div>
                <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.3, whiteSpace: "nowrap" }}>{thisYearLessons.length} out of {availableThisYear} lessons</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t("studentDetail.ytd")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="headline-serif" style={{ fontSize: 24, fontWeight: 400 }}>{formatCurrency(earningsYTD)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t("studentDetail.ytdEarnings")}</div>
              </div>
            </div>
          </div>
          <div className="float-card" style={{ padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, display: "flex", flexDirection: "column", gap: 6 }}>
              {getAllScheduledDays(student).map((sched, i) => {
                const timeRange = sched.timeOfDay && sched.timeOfDay !== "\u2014" ? ` @ ${formatCompactTimeRange(sched.timeOfDay, sched.durationMinutes)}` : "";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{DAYS_FULL[sched.dayOfWeek]}s{timeRange}</span>
                    <span style={{ color: "var(--text-muted)" }}>|</span>
                    <span>{formatDuration(sched.durationMinutes)}, {formatCurrency(sched.rateCents)}</span>
                  </div>
                );
              })}
            </div>
            {student.scheduleChangeFromDate && (() => {
              const allSchedChangeDays: DaySchedule[] = [];
              if (student.scheduleChangeDayOfWeek != null && student.scheduleChangeTimeOfDay != null) {
                allSchedChangeDays.push({ dayOfWeek: student.scheduleChangeDayOfWeek, timeOfDay: student.scheduleChangeTimeOfDay, durationMinutes: student.scheduleChangeDurationMinutes ?? student.durationMinutes, rateCents: student.scheduleChangeRateCents ?? student.rateCents });
              }
              (student.scheduleChangeAdditionalSchedules ?? []).forEach((s) => allSchedChangeDays.push(s));
              return (
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                  <div style={{ marginBottom: 2 }}>From {new Date(student.scheduleChangeFromDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}:</div>
                  {allSchedChangeDays.map((sc, i) => {
                    const timeRange = sc.timeOfDay && sc.timeOfDay !== "\u2014" ? ` @ ${formatCompactTimeRange(sc.timeOfDay, sc.durationMinutes)}` : "";
                    return (
                      <div key={i} style={{ marginLeft: 8 }}>
                        {DAYS_FULL[sc.dayOfWeek]}s{timeRange} &middot; {formatDuration(sc.durationMinutes)}, {formatCurrency(sc.rateCents)}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {student.terminatedFromDate && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>Last lesson: {new Date(student.terminatedFromDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            )}
          </div>
        </>
      )}

      {error && !editing ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}

      {!editing && student && (
        <>
          {(() => {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;
            const yearsWithLessons = [...new Set(studentLessons.map((l) => l.date.slice(0, 4)))];
            const years = [...new Set([String(currentYear), ...yearsWithLessons])].map(Number).sort((a, b) => b - a);

            return years.map((year) => {
              const monthRows: { monthKey: string; monthName: string; scheduledDateKeys: string[]; completedCount: number; totalEarned: number }[] = [];
              const monthEnd = year === currentYear ? currentMonth : 12;
              for (let month = 1; month <= monthEnd; month++) {
                const scheduledDateKeys = getScheduledDateKeysInMonth(student, year, month);
                if (scheduledDateKeys.length === 0) continue;
                let completedCount = 0;
                let totalEarned = 0;
                for (const dateKey of scheduledDateKeys) {
                  const lesson = getLessonForStudentOnDate(data.lessons, student.id, dateKey);
                  if (lesson?.completed) {
                    completedCount++;
                    totalEarned += lesson.amountCents;
                  }
                }
                const first = new Date(year, month - 1, 1);
                const monthName = first.toLocaleDateString("en-US", { month: "long" });
                const monthKey = `${year}-${String(month).padStart(2, "0")}`;
                monthRows.push({ monthKey, monthName, scheduledDateKeys: scheduledDateKeys.sort((a, b) => b.localeCompare(a)), completedCount, totalEarned });
              }
              if (monthRows.length === 0) return null;

              return (
                <div key={year} style={{ marginBottom: 28 }}>
                  <h3 className="headline-serif" style={{ fontSize: 20, fontWeight: 400, marginBottom: 14 }}>{t("studentDetail.lessonsLogged")} {year}</h3>
                  <div className="float-card" style={{ overflow: "hidden", padding: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {monthRows.map(({ monthKey, monthName, scheduledDateKeys, completedCount, totalEarned }) => (
                        <Fragment key={monthKey}>
                          <div
                            onClick={() => setExpandedMonth((prev) => (prev === monthKey ? null : monthKey))}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "14px 20px",
                              cursor: "pointer",
                              background: expandedMonth === monthKey ? "var(--hero-gradient-subtle)" : undefined,
                              borderBottom: "1px solid rgba(201, 123, 148, 0.08)",
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{expandedMonth === monthKey ? "▼ " : "▶ "}{monthName}</span>
                            <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{completedCount}/{scheduledDateKeys.length} · {formatCurrency(totalEarned)}</span>
                          </div>
                          {expandedMonth === monthKey && (
                            <div style={{ padding: "12px 20px 16px", background: "var(--hero-gradient-subtle)" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                                  return (
                                    <div
                                      key={dateKey}
                                      role="button"
                                      tabIndex={0}
                                      onClick={handleToggle}
                                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } }}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: 12,
                                        margin: 0,
                                        borderRadius: 12,
                                        background: attended ? "var(--card)" : "rgba(0,0,0,0.06)",
                                        color: attended ? "var(--text)" : "var(--text-muted)",
                                        cursor: "pointer",
                                        border: attended ? "1px solid var(--border)" : "1px solid transparent",
                                      }}
                                    >
                                      <span style={{ fontSize: 14 }}>{dateKey}</span>
                                      <span style={{ fontWeight: 600 }}>{attended ? formatCurrency(lesson!.amountCents) : "—"}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </>
      )}
    </>
  );
}
