import { useState, useEffect, useContext, createContext } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCurrency, getEffectiveRateCents, getEffectiveDurationMinutes, toDateKey } from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import MonthCalendarGrid from "@/components/MonthCalendarGrid";
import type { Lesson } from "@/types";
import { Button, IconButton } from "@/components/ui/Button";
import { ClockIcon, CalendarIcon } from "@/components/ui/Icons";
import "./EditLesson.css";

export const EditLessonModalContext = createContext(false);

const DURATIONS = [
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hour", minutes: 60 },
  { label: "1 hr 30 min", minutes: 90 },
  { label: "2 hours", minutes: 120 },
];

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

export default function EditLesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const asModal = useContext(EditLessonModalContext);
  const { data, updateLesson, deleteLesson } = useStoreContext();
  const { t } = useLanguage();
  const lesson = data.lessons.find((l) => l.id === id);
  const student = lesson ? data.students.find((s) => s.id === lesson.studentId) : null;
  const [lessonDate, setLessonDate] = useState(lesson?.date ?? "");
  const [durationMinutes, setDurationMinutes] = useState(lesson?.durationMinutes ?? 60);
  const [note, setNote] = useState(lesson?.note ?? "");

  // Time picker state: per-lesson time if set, else student default
  const defaultTime = lesson?.timeOfDay ?? student?.timeOfDay ?? "5:00 PM";
  const initTime = parseTimeOfDay(defaultTime);
  const [lessonTime, setLessonTime] = useState(defaultTime);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerHour, setTimePickerHour] = useState(initTime.hour);
  const [timePickerMinute, setTimePickerMinute] = useState(initTime.minute);
  const [timePickerAmPm, setTimePickerAmPm] = useState<"AM" | "PM">(initTime.amPm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState<Date>(() => {
    if (lesson?.date && /^\d{4}-\d{2}-\d{2}$/.test(lesson.date)) {
      const [y, m] = lesson.date.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });

  const openTimePicker = () => {
    const p = parseTimeOfDay(lessonTime);
    setTimePickerHour(p.hour);
    setTimePickerMinute(p.minute);
    setTimePickerAmPm(p.amPm);
    setTimePickerOpen(true);
  };
  const applyTime = () => {
    setLessonTime(`${timePickerHour}:${String(timePickerMinute).padStart(2, "0")} ${timePickerAmPm}`);
    setTimePickerOpen(false);
  };

  useEffect(() => {
    if (lesson) {
      setLessonDate(lesson.date);
      setDurationMinutes(lesson.durationMinutes);
      setNote(lesson.note ?? "");
      setLessonTime(lesson.timeOfDay ?? student?.timeOfDay ?? "5:00 PM");
    }
  }, [lesson?.id, lesson?.date, lesson?.durationMinutes, lesson?.note, lesson?.timeOfDay, student?.id, student?.timeOfDay]);

  if (!lesson || !student) return <p style={{ padding: 24 }}>Lesson not found</p>;

  const defaultRate = getEffectiveRateCents(student, lessonDate);
  const defaultDuration = getEffectiveDurationMinutes(student, lessonDate);
  const amountCents = defaultDuration <= 0 ? defaultRate : Math.round((defaultRate * durationMinutes) / defaultDuration);
  const [y, m, d] = lessonDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dateFormatted = isNaN(date.getTime()) ? lessonDate : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeStr = lessonTime ? ` - ${lessonTime}` : "";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(lessonDate) ? lessonDate : lesson.date;

      // Update the existing lesson in place (date, time, duration, amount, note). No new row; no duplicate.
      const updates: Partial<Lesson> = {
        date: normalizedDate,
        durationMinutes,
        amountCents,
        note: note.trim() || undefined,
        timeOfDay: lessonTime.trim() || undefined,
      };
      await updateLesson(lesson.id, updates);
      // After rescheduling, go back to dashboard with the new date selected
      if (normalizedDate && normalizedDate !== lesson.date) {
        const [y, m, d] = normalizedDate.split("-").map(Number);
        navigate("/", { state: { goToDate: new Date(y, m - 1, d) } });
      } else {
        navigate(-1);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("editLesson.deleteConfirm"))) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await deleteLesson(lesson.id);
      navigate("/");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const closeModal = () => navigate(-1);
  const titleDateStr = [y, m, d].every(Number) ? `${m}/${d}` : lessonDate;
  const subtitleDateStr = !isNaN(date.getTime()) ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : lessonDate;
  const originalTimeSubtext = `${dateFormatted} · ${lessonTime || "—"}`;
  const selectedDateObj = lessonDate && /^\d{4}-\d{2}-\d{2}$/.test(lessonDate)
    ? (() => { const [yr, mo, day] = lessonDate.split("-").map(Number); return new Date(yr, mo - 1, day); })()
    : null;
  const dateDisplayStr = selectedDateObj ? selectedDateObj.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "Select date";

  useEffect(() => {
    if (!asModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [asModal]);

  if (asModal) {
    return (
      <div className="editLessonModal__backdrop" onClick={closeModal} role="presentation">
        <div className="editLessonModal__card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-lesson-modal-title">
          {calendarOpen && <div className="editLessonModal__datePopoverBackdrop" onClick={() => setCalendarOpen(false)} aria-hidden />}
          <div className="editLessonModal__header">
            <div>
              <h2 id="edit-lesson-modal-title" className="editLessonModal__title">Edit {titleDateStr} Lesson</h2>
              <p className="editLessonModal__subtitle">{subtitleDateStr}</p>
            </div>
            <button type="button" className="editLessonModal__close" onClick={closeModal} aria-label={t("common.cancel")}>×</button>
          </div>
          <div className="editLessonModal__studentCard">
            <StudentAvatar student={student} size={48} variant="green" />
            <div>
              <div className="editLessonModal__studentName">{student.firstName} {student.lastName}</div>
              <div className="editLessonModal__studentTime">{originalTimeSubtext}</div>
            </div>
          </div>
          <div className="editLessonModal__infoBanner">
            <span className="editLessonModal__infoIcon" aria-hidden>i</span>
            <p className="editLessonModal__infoText">This edits this lesson only — not {student.firstName}&apos;s regular weekly schedule.</p>
          </div>
          <form onSubmit={handleSave}>
            <div className="editLessonModal__rescheduleRow">
              <div className="editLessonModal__field editLessonModal__field--date">
                <label className="editLessonModal__label">Reschedule date</label>
                <button
                  type="button"
                  className="editLessonModal__pillWrap editLessonModal__pillButton"
                  onClick={() => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(lessonDate)) {
                      const [y, m] = lessonDate.split("-").map(Number);
                      setCalendarViewMonth(new Date(y, m - 1, 1));
                    } else {
                      setCalendarViewMonth(new Date());
                    }
                    setCalendarOpen(true);
                  }}
                >
                  <span>{dateDisplayStr}</span>
                  <span className="editLessonModal__pillIcon" aria-hidden><CalendarIcon size={18} /></span>
                </button>
                {calendarOpen && (
                  <div className="editLessonModal__datePopover">
                      <MonthCalendarGrid
                        month={calendarViewMonth}
                        selectedDate={selectedDateObj}
                        onSelectDate={(date) => {
                          setLessonDate(toDateKey(date));
                          setCalendarOpen(false);
                        }}
                        onPrevMonth={() => setCalendarViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                        onNextMonth={() => setCalendarViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                      />
                    </div>
                )}
              </div>
              <div className="editLessonModal__field">
                <label className="editLessonModal__label">Reschedule time</label>
                <button type="button" className="editLessonModal__pillWrap editLessonModal__pillButton" onClick={openTimePicker}>
                  <span>{lessonTime || "5:00 PM"}</span>
                  <span className="editLessonModal__pillIcon" aria-hidden><ClockIcon size={18} /></span>
                </button>
              </div>
            </div>
            <div className="editLessonModal__durationSection">
            <label className="editLessonModal__label">Duration</label>
            <div className="editLessonModal__durationPills">
              {DURATIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  className={`editLessonModal__durationPill ${durationMinutes === opt.minutes ? "editLessonModal__durationPill--active" : ""}`}
                  onClick={() => setDurationMinutes(opt.minutes)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            </div>
            <div className="editLessonModal__rateRow">
              <label className="editLessonModal__label">Lesson Rate</label>
              <div className="editLessonModal__rateWrap">
                <span className="editLessonModal__rateInput">${Math.round(defaultRate / 100)}</span>
                <span className="editLessonModal__rateTotal">= {formatCurrency(amountCents)}</span>
              </div>
            </div>
            {saveError && <p className="editLessonModal__error">{saveError}</p>}
            <div className="editLessonModal__footer">
              <button type="button" className="editLessonModal__cancelBtn" onClick={closeModal}>{t("common.cancel")}</button>
              <Button type="submit" variant="primary" size="md" disabled={saving} loading={saving} className="editLessonModal__saveBtn">
                {t("common.save")}
              </Button>
            </div>
            <button type="button" className="editLessonModal__deleteLink" onClick={handleDelete} disabled={saving || deleting}>
              {t("editLesson.deleteLesson")}
            </button>
          </form>
          {timePickerOpen && (
            <div className="editLessonModal__timePickerBackdrop" onClick={() => setTimePickerOpen(false)}>
              <div className="editLessonModal__timePickerCard" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                  <IconButton type="button" variant="ghost" size="sm" onClick={() => setTimePickerOpen(false)} aria-label="Close">&times;</IconButton>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>Select time</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <select value={timePickerHour} onChange={(e) => setTimePickerHour(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (<option key={h} value={h}>{h}</option>))}
                    </select>
                    <span style={{ fontSize: 18, fontWeight: 600 }}>:</span>
                    <select value={timePickerMinute} onChange={(e) => setTimePickerMinute(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                      {Array.from({ length: 60 }, (_, i) => i).map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}</option>))}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Button type="button" variant="tab" size="sm" active={timePickerAmPm === "AM"} onClick={() => setTimePickerAmPm("AM")}>AM</Button>
                    <Button type="button" variant="tab" size="sm" active={timePickerAmPm === "PM"} onClick={() => setTimePickerAmPm("PM")}>PM</Button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setTimePickerOpen(false)}>Cancel</Button>
                  <Button type="button" variant="primary" size="sm" onClick={applyTime}>OK</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Link to="/" style={{ display: "inline-flex", marginBottom: 24, color: "var(--text)", textDecoration: "none" }}>← {t("common.back")}</Link>
      <h1 className="headline-serif" style={{ fontSize: 26, fontWeight: 400, marginBottom: 24 }}>{t("editLesson.title")}</h1>
      <form onSubmit={handleSave}>
        <div className="float-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: 14, flexShrink: 0 }}><StudentAvatar student={student} size={48} /></span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{student.firstName} {student.lastName}</div>
              <div style={{ color: "var(--text-muted)" }}>{dateFormatted}{timeStr}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Reschedule to date</label>
            <DatePicker id="edit-lesson-date" value={lessonDate} onChange={setLessonDate} placeholder="Select date" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Reschedule time</label>
            <Button type="button" variant="secondary" size="md" onClick={openTimePicker} fullWidth style={{ textAlign: "left", justifyContent: "flex-start" }}>
              {lessonTime || "5:00 PM"}
            </Button>
          </div>
        </div>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Duration</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {DURATIONS.map((opt) => (
            <Button
              key={opt.minutes}
              type="button"
              variant="tab"
              size="sm"
              active={durationMinutes === opt.minutes}
              onClick={() => setDurationMinutes(opt.minutes)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="float-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span>Lesson Rate</span>
          <span style={{ color: "var(--text-muted)" }}>{formatCurrency(student.rateCents)} &gt;</span>
        </div>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Notes</label>
        <textarea
          className="notesTextarea"
          placeholder="e.g. Updated today's lesson to 1 hr 30 mins for $105."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%", minHeight: 80, padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 24, fontSize: 16 }}
        />
        {saveError && <p style={{ color: "var(--error, #c00)", marginBottom: 16 }}>{saveError}</p>}
        <Button type="submit" variant="secondary" size="sm" fullWidth disabled={saving} loading={saving}>
          {t("common.save")}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="md"
          onClick={handleDelete}
          disabled={saving || deleting}
          loading={deleting}
          fullWidth
          style={{ marginTop: 16 }}
        >
          {t("editLesson.deleteLesson")}
        </Button>
      </form>

      {timePickerOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setTimePickerOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", padding: 24, boxShadow: "var(--shadow-elevated)", maxWidth: 320, width: "90%", fontFamily: "var(--font-sans)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <IconButton type="button" variant="ghost" size="sm" onClick={() => setTimePickerOpen(false)} aria-label="Close">&times;</IconButton>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>Select time</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <select value={timePickerHour} onChange={(e) => setTimePickerHour(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                  {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (<option key={h} value={h}>{h}</option>))}
                </select>
                <span style={{ fontSize: 18, fontWeight: 600 }}>:</span>
                <select value={timePickerMinute} onChange={(e) => setTimePickerMinute(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}</option>))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Button type="button" variant="tab" size="sm" active={timePickerAmPm === "AM"} onClick={() => setTimePickerAmPm("AM")}>AM</Button>
                <Button type="button" variant="tab" size="sm" active={timePickerAmPm === "PM"} onClick={() => setTimePickerAmPm("PM")}>PM</Button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" size="sm" onClick={() => setTimePickerOpen(false)}>Cancel</Button>
              <Button type="button" variant="primary" size="sm" onClick={applyTime}>OK</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
