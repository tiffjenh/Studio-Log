import { useRef, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { isSupabaseTableError } from "@/store/useStore";
import { useLanguage } from "@/context/LanguageContext";
import { parseStudentCSV, rowToStudentWithError } from "@/utils/csvImport";
import { downloadCsv, getStudentTemplateCsv } from "@/utils/importTemplates";
import { getCurrencyByCode, getStoredCurrencyCode } from "@/utils/currencies";
import type { DaySchedule, Student } from "@/types";
import { Button } from "@/components/ui/Button";
import { DownloadIcon } from "@/components/ui/Icons";
import "./add-student.mock.css";
import "./add-student.modals.css";

/** Upload/import icon for dropdown (arrow up into tray). */
function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

const DURATIONS = [30, 45, 60, 90, 120];
const DURATION_LABELS: Record<number, string> = { 30: "30 min", 45: "45 min", 60: "1 hr", 90: "1.5 hr", 120: "2 hr" };
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

export default function AddStudent() {
  const { data, addStudent, addStudentsBulk } = useStoreContext();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  // Schedule entries: each entry has its own day, duration, rate, time
  const [scheduleEntries, setScheduleEntries] = useState<{ id: number; dayOfWeek: number; durationMinutes: number; rateDollars: string; timeOfDay: string }[]>([
    { id: 1, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" },
  ]);
  let nextEntryId = scheduleEntries.length > 0 ? Math.max(...scheduleEntries.map((e) => e.id)) + 1 : 1;

  // Rate modal
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateModalDay, setRateModalDay] = useState(0);
  const [rateKeypadValue, setRateKeypadValue] = useState("");

  // Time picker
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerDay, setTimePickerDay] = useState(0);
  const [timePickerHour, setTimePickerHour] = useState(5);
  const [timePickerMinute, setTimePickerMinute] = useState(0);
  const [timePickerAmPm, setTimePickerAmPm] = useState<"AM" | "PM">("PM");
  const [importDropdownOpen, setImportDropdownOpen] = useState(false);
  const importDropdownRef = useRef<HTMLDivElement>(null);
  const timePickerHourColRef = useRef<HTMLDivElement>(null);
  const timePickerMinuteColRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!timePickerOpen) return;
    const t = setTimeout(() => {
      timePickerHourColRef.current?.querySelector(".addStudent-timePickerRowSelected")?.scrollIntoView({ block: "nearest", behavior: "auto" });
      timePickerMinuteColRef.current?.querySelector(".addStudent-timePickerRowSelected")?.scrollIntoView({ block: "nearest", behavior: "auto" });
    }, 50);
    return () => clearTimeout(t);
  }, [timePickerOpen, timePickerHour, timePickerMinute]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target as Node)) setImportDropdownOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImportDropdownOpen(false);
    };
    if (importDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [importDropdownOpen]);

  const addScheduleEntry = () => {
    setScheduleEntries((prev) => [...prev, { id: nextEntryId, dayOfWeek: 1, durationMinutes: 60, rateDollars: "", timeOfDay: "" }]);
  };
  const removeScheduleEntry = (id: number) => {
    setScheduleEntries((prev) => prev.length <= 1 ? prev : prev.filter((e) => e.id !== id));
  };
  const updateEntry = (id: number, field: string, value: string | number) => {
    setScheduleEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) return;

    for (let i = 0; i < scheduleEntries.length; i++) {
      if (!scheduleEntries[i].rateDollars.trim()) {
        setError(`Please set a rate for lesson ${i + 1}.`);
        return;
      }
    }

    const primary = scheduleEntries[0];
    const primaryRateCents = Math.round(parseFloat(primary.rateDollars) * 100) || 0;
    const primaryTime = primary.timeOfDay.trim() || "\u2014";

    const additionalSchedules: DaySchedule[] = scheduleEntries.slice(1).map((entry) => ({
      dayOfWeek: entry.dayOfWeek,
      timeOfDay: entry.timeOfDay.trim() || "\u2014",
      durationMinutes: entry.durationMinutes,
      rateCents: Math.round(parseFloat(entry.rateDollars) * 100) || 0,
    }));

    const student: Student = {
      id: `s_${Date.now()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      durationMinutes: primary.durationMinutes,
      rateCents: primaryRateCents,
      dayOfWeek: primary.dayOfWeek,
      timeOfDay: primaryTime,
      additionalSchedules: additionalSchedules.length > 0 ? additionalSchedules : undefined,
    };
    try {
      await addStudent(student);
      navigate("/students");
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not add student. Try again.";
      if (isSupabaseTableError(msg)) {
        setError(
          "Database schema isn’t loaded for this environment. In Supabase Dashboard → SQL Editor, run the script in supabase/bootstrap-schema.sql (it ends with “reload schema”), then try again."
        );
      } else {
        setError(msg);
      }
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);
    setImportProgress(null);
    try {
      const text = await file.text();
      const parsed = parseStudentCSV(text);
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        setImportProgress(null);
        e.target.value = "";
        return;
      }
      const total = parsed.rows.length;
      setImportProgress({ current: 0, total });
      const existing = new Set(data.students.map((s) => `${s.firstName.toLowerCase()}|${s.lastName.toLowerCase()}`));
      const toAdd: Omit<Student, "id">[] = [];
      let skipped = 0;
      const errors: string[] = [];
      for (let i = 0; i < total; i++) {
        setImportProgress({ current: i + 1, total });
        const result = rowToStudentWithError(parsed.rows[i]);
        if (!result.ok) {
          skipped++;
          errors.push(`Row ${i + 2}: ${result.error}`);
          continue;
        }
        const studentData = result.data;
        const key = `${studentData.first_name.toLowerCase()}|${studentData.last_name.toLowerCase()}`;
        if (existing.has(key)) {
          skipped++;
          errors.push(`Row ${i + 2}: ${studentData.first_name} ${studentData.last_name} already exists`);
          continue;
        }
        toAdd.push({
          firstName: studentData.first_name,
          lastName: studentData.last_name,
          durationMinutes: studentData.duration_minutes,
          rateCents: studentData.rate_cents,
          dayOfWeek: studentData.day_of_week,
          timeOfDay: studentData.time_of_day,
        });
        existing.add(key);
      }
      let imported = 0;
      if (toAdd.length > 0) {
        try {
          setImportProgress({ current: 0, total: toAdd.length });
          const { addedCount, chunkErrors } = await addStudentsBulk(toAdd, (inserted, total) => {
            setImportProgress({ current: inserted, total });
          });
          imported = addedCount;
          errors.push(...chunkErrors);
          if (addedCount < toAdd.length) {
            if (chunkErrors.length > 0) {
              errors.push(`${addedCount} of ${toAdd.length} students saved. See errors below.`);
            } else {
              errors.push(`Only ${addedCount} of ${toAdd.length} students were saved.`);
            }
            errors.push("To allow more students: Supabase Dashboard → SQL Editor → run: ALTER ROLE \"postgres\" SET \"pgrst.db_max_rows\" = '2000';");
          } else if (chunkErrors.length > 0) {
            errors.push(`${addedCount} of ${toAdd.length} students saved. Some rows failed.`);
          }
        } catch (err: unknown) {
          console.error("Bulk import failed:", err);
          let msg = "Failed to save";
          if (err instanceof Error) msg = err.message;
          else if (typeof err === "object" && err !== null && "message" in err) msg = String((err as Record<string, unknown>).message);
          else if (typeof err === "string") msg = err;
          else msg = JSON.stringify(err) ?? "Unknown error";
          errors.push(msg);
          skipped += toAdd.length;
        }
      }
      setImportResult({ imported, skipped, errors });
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
      setImportProgress(null);
      e.target.value = "";
    }
  };

  const fontStyle = { fontFamily: "var(--font-sans)" };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16, ...fontStyle };
  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 8, fontWeight: 600, ...fontStyle };
  const currencySymbol = getCurrencyByCode(getStoredCurrencyCode())?.symbol ?? "$";

  // rateModalDay / timePickerDay now store the entry ID (not day index)
  const openRateModal = (entryId: number) => {
    setRateModalDay(entryId);
    const entry = scheduleEntries.find((e) => e.id === entryId);
    setRateKeypadValue(entry?.rateDollars || "");
    setRateModalOpen(true);
  };
  const applyRate = () => {
    const v = rateKeypadValue.trim();
    if (v !== "" && !Number.isNaN(Number(v))) updateEntry(rateModalDay, "rateDollars", v);
    setRateModalOpen(false);
  };
  const openTimePicker = (entryId: number) => {
    setTimePickerDay(entryId);
    const entry = scheduleEntries.find((e) => e.id === entryId);
    const parsed = parseTimeOfDay(entry?.timeOfDay || "");
    setTimePickerHour(parsed.hour);
    setTimePickerMinute(parsed.minute);
    setTimePickerAmPm(parsed.amPm);
    setTimePickerOpen(true);
  };
  const applyTime = () => {
    updateEntry(timePickerDay, "timeOfDay", `${timePickerHour}:${String(timePickerMinute).padStart(2, "0")} ${timePickerAmPm}`);
    setTimePickerOpen(false);
  };

  return (
    <div className="addStudentPage">
      <header className="addStudentPage__header">
        <Link to="/students" className="addStudentPage__backBtn" aria-label={t("common.back")}>&larr;</Link>
        <div className="addStudentPage__titleBlock">
          <h1 className="addStudentPage__title">{t("addStudent.title")}</h1>
        </div>
        <div className="addStudentPage__importWrap" ref={importDropdownRef}>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} />
          <div className="addStudentPage__importPill">
            <button type="button" className="addStudentPage__importLeft" onClick={() => fileInputRef.current?.click()} disabled={importing} aria-label="Import students CSV">
              <span className="addStudentPage__importLeftInner">
                <UploadIcon size={14} />
                <span>Import</span>
              </span>
            </button>
            <span className="addStudentPage__importDivider" aria-hidden />
            <button
              type="button"
              className="addStudentPage__importCaret"
              onClick={() => setImportDropdownOpen((o) => !o)}
              disabled={importing}
              aria-expanded={importDropdownOpen}
              aria-haspopup="menu"
              aria-label={importDropdownOpen ? "Close menu" : "Open menu"}
            >
              <span className="addStudentPage__importBtnChevron" aria-hidden>{importDropdownOpen ? "\u25B2" : "\u25BC"}</span>
            </button>
          </div>
          {importDropdownOpen && (
            <div className="addStudentPage__dropdown" role="menu">
              <button type="button" role="menuitem" className="addStudentPage__dropdownItem" onClick={() => { setImportDropdownOpen(false); fileInputRef.current?.click(); }} disabled={importing}>
                <UploadIcon size={20} />
                <span>Import Students CSV</span>
              </button>
              <div className="addStudentPage__dropdownDivider" />
              <button type="button" role="menuitem" className="addStudentPage__dropdownItem" onClick={() => { setImportDropdownOpen(false); downloadCsv("students-template.csv", getStudentTemplateCsv()); }}>
                <DownloadIcon size={20} />
                <span>Download Template</span>
              </button>
            </div>
          )}
        </div>
      </header>
      {importing && importProgress && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, background: "var(--card)", border: "1px solid var(--border)", fontSize: 14, ...fontStyle }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>Importing students... {importProgress.current} of {importProgress.total}</p>
          <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`, height: "100%", borderRadius: 4, background: "#c97b94", transition: "width 0.2s ease" }} />
          </div>
        </div>
      )}
      {importResult && !importing && (() => {
        const success = importResult.imported > 0 && importResult.errors.length === 0;
        const partial = importResult.imported > 0 && importResult.errors.length > 0;
        const fail = importResult.imported === 0 && importResult.errors.length > 0;
        return (
          <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, fontSize: 14, ...fontStyle, background: success ? "#f0fdf4" : fail ? "#fef2f2" : "#fffbeb", border: `1px solid ${success ? "#bbf7d0" : fail ? "#fecaca" : "#fde68a"}` }}>
            <p style={{ margin: 0, fontWeight: 700, color: success ? "#166534" : fail ? "#991b1b" : "#92400e" }}>
              {success ? `Success! Imported ${importResult.imported} student${importResult.imported !== 1 ? "s" : ""}.` : partial ? `Partially imported: ${importResult.imported} added, ${importResult.skipped} skipped.` : `Import failed — ${importResult.skipped} student${importResult.skipped !== 1 ? "s" : ""} skipped.`}
            </p>
            {importResult.errors.length > 0 && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: fail ? "#991b1b" : "#92400e", maxHeight: 120, overflowY: "auto", fontSize: 13 }}>
                {importResult.errors.slice(0, 8).map((err, i) => (<li key={i} style={{ marginBottom: 2 }}>{err}</li>))}
                {importResult.errors.length > 8 && <li>...and {importResult.errors.length - 8} more</li>}
              </ul>
            )}
          </div>
        );
      })()}
      <form onSubmit={handleSave}>
        <div className="addStudentPage__card addStudentPage__card--info">
          <h2 className="addStudentPage__cardTitle">Student Information</h2>
          <div className="addStudentPage__inputGrid">
            <div>
              <label style={labelStyle} className="addStudentPage__label">{t("addStudent.firstName")}</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" style={inputStyle} className="addStudentPage__input" required />
            </div>
            <div>
              <label style={labelStyle} className="addStudentPage__label">{t("addStudent.lastName")}</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" style={inputStyle} className="addStudentPage__input" required />
            </div>
          </div>
        </div>

        {/* Schedule entries */}
        {scheduleEntries.map((entry) => (
          <div key={entry.id} className="addStudentPage__card addStudentPage__card--lesson">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 16, ...fontStyle }}>{DAYS_FULL[entry.dayOfWeek]} Lesson</span>
              {scheduleEntries.length > 1 && (
                <Button type="button" variant="danger" size="sm" onClick={() => removeScheduleEntry(entry.id)}>Delete Day</Button>
              )}
            </div>
            <label className="addStudentPage__fieldLabel">{t("addStudent.dayOfWeek")}</label>
            <div className="addStudentPage__dayPills">
              {DAY_SHORT.map((label, i) => (
                <button key={i} type="button" className={`addStudentPage__dayPill ${entry.dayOfWeek === i ? "addStudentPage__dayPillActive" : ""}`} onClick={() => updateEntry(entry.id, "dayOfWeek", i)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="addStudentPage__fieldLabel">{t("addStudent.lessonDuration")}</label>
            <div className="addStudentPage__durationPills">
              {DURATIONS.map((m) => (
                <button key={m} type="button" className={`addStudentPage__durationPill ${entry.durationMinutes === m ? "addStudentPage__durationPillActive" : ""}`} onClick={() => updateEntry(entry.id, "durationMinutes", m)}>
                  {DURATION_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="addStudentPage__rateTimeRow">
              <div>
                <label className="addStudentPage__fieldLabel">Rate (per hour)</label>
                <button type="button" className="addStudentPage__fieldBtn" onClick={() => openRateModal(entry.id)}>
                  <span className={!entry.rateDollars ? "addStudentPage__fieldBtnPlaceholder" : ""}>
                    {entry.rateDollars ? `${currencySymbol}${entry.rateDollars}` : "Tap to set"}
                  </span>
                </button>
              </div>
              <div>
                <label className="addStudentPage__fieldLabel">{t("common.time")}</label>
                <button type="button" className="addStudentPage__fieldBtn" onClick={() => openTimePicker(entry.id)}>
                  {entry.timeOfDay || "3:00 PM"}
                </button>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addScheduleEntry} className="addStudentPage__addDayBtn">+ Add Day</button>

        {error ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: "#dc2626", ...fontStyle }}>{error}</p>
            {isSupabaseTableError(error) || /schema isn't loaded|bootstrap-schema/i.test(error) ? (
              <button type="button" onClick={() => setError("")} className="addStudentPage__retrySchemaBtn" style={{ marginTop: 8 }}>
                Dismiss & try again
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="addStudentPage__bottomRow">
          <button type="button" onClick={() => navigate("/students")} className="addStudentPage__cancelBtn">{t("common.cancel")}</button>
          <button type="submit" className="addStudentPage__submitBtn">{t("addStudent.title")}</button>
        </div>
      </form>

      {rateModalOpen && (
        <div className="addStudent-rateBackdrop" onClick={() => setRateModalOpen(false)}>
          <div className="addStudent-rateCard" onClick={(e) => e.stopPropagation()}>
            <div className="addStudent-rateHeader">
              <p className="addStudent-rateTitle">
                {scheduleEntries.length > 1 ? `${DAYS_FULL[scheduleEntries.find((e) => e.id === rateModalDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}{t("common.rate")}
              </p>
              <button type="button" className="addStudent-rateClose" onClick={() => setRateModalOpen(false)} aria-label="Close">&times;</button>
            </div>
            <div className="addStudent-rateDisplay">
              <div className="addStudent-rateDisplayInner">
                <span className="addStudent-rateDisplaySymbol">{currencySymbol}</span>
                <span className="addStudent-rateDisplayNumber">{rateKeypadValue || "0"}</span>
              </div>
            </div>
            <div className="addStudent-rateKeypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} type="button" className="addStudent-rateKey" onClick={() => setRateKeypadValue((v) => v + n)}>{n}</button>
              ))}
              <button type="button" className="addStudent-rateKey" onClick={() => setRateKeypadValue((v) => (v.includes(".") ? v : v + "."))}>.</button>
              <button type="button" className="addStudent-rateKey" onClick={() => setRateKeypadValue((v) => v + "0")}>0</button>
              <button type="button" className="addStudent-rateKey addStudent-rateKeyBackspace" onClick={() => setRateKeypadValue((v) => v.slice(0, -1))} aria-label="Backspace">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M10 11l4 4"/><path d="M14 11l-4 4"/></svg>
              </button>
            </div>
            <div className="addStudent-rateChips">
              {DURATIONS.map((d) => {
                const hourly = parseFloat(rateKeypadValue) || 0;
                const amount = (hourly * d) / 60;
                const roundedDollars = Math.round(amount);
                return (
                  <div key={d} className="addStudent-rateChip" role="presentation">
                    <span className="addStudent-rateChipDuration">{DURATION_LABELS[d]}</span>
                    <span className="addStudent-rateChipAmount">{currencySymbol}{roundedDollars}</span>
                  </div>
                );
              })}
            </div>
            <button type="button" className="addStudent-rateSubmit" onClick={applyRate}>{t("common.setRate")}</button>
          </div>
        </div>
      )}

      {timePickerOpen && (() => {
        const HOUR_OPTIONS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        const MINUTE_OPTIONS = [0, 15, 30, 45];
        const selectedMinuteDisplay = MINUTE_OPTIONS.includes(timePickerMinute) ? timePickerMinute : null;
        return (
          <div className="addStudent-rateBackdrop" onClick={() => setTimePickerOpen(false)}>
            <div className="addStudent-timeCard" onClick={(e) => e.stopPropagation()}>
              <div className="addStudent-rateHeader">
                <p className="addStudent-rateTitle">
                  {scheduleEntries.length > 1 ? `${DAYS_FULL[scheduleEntries.find((e) => e.id === timePickerDay)?.dayOfWeek ?? 0]} \u2014 ` : ""}{t("common.selectTime")}
                </p>
                <button type="button" className="addStudent-rateClose" onClick={() => setTimePickerOpen(false)} aria-label="Close">&times;</button>
              </div>
              <div className="addStudent-timePickerWrap">
                <div ref={timePickerHourColRef} className="addStudent-timePickerColumn">
                  <div className="addStudent-timePickerColumnInner">
                    {HOUR_OPTIONS.map((h) => (
                      <button key={h} type="button" className={`addStudent-timePickerRow ${timePickerHour === h ? "addStudent-timePickerRowSelected" : ""}`} onClick={() => setTimePickerHour(h)}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="addStudent-timePickerColon">:</span>
                <div ref={timePickerMinuteColRef} className="addStudent-timePickerColumn">
                  <div className="addStudent-timePickerColumnInner">
                    {MINUTE_OPTIONS.map((m) => (
                      <button key={m} type="button" className={`addStudent-timePickerRow ${selectedMinuteDisplay != null && selectedMinuteDisplay === m ? "addStudent-timePickerRowSelected" : ""}`} onClick={() => setTimePickerMinute(m)}>
                        {String(m).padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="addStudent-timeAmPmWrap">
                  <button type="button" className={`addStudent-timeAmPmBtn ${timePickerAmPm === "AM" ? "addStudent-timeAmPmBtnActive" : ""}`} onClick={() => setTimePickerAmPm("AM")}>AM</button>
                  <button type="button" className={`addStudent-timeAmPmBtn ${timePickerAmPm === "PM" ? "addStudent-timeAmPmBtnActive" : ""}`} onClick={() => setTimePickerAmPm("PM")}>PM</button>
                </div>
              </div>
              <div className="addStudent-timeActions">
                <button type="button" className="addStudent-timeCancel" onClick={() => setTimePickerOpen(false)}>{t("common.cancel")}</button>
                <button type="button" className="addStudent-timeOk" onClick={applyTime}>{t("common.ok")}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
