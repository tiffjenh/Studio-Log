import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import { formatCurrency, getAllScheduledDays, toDateKey, isStudentActive, isStudentHistorical, getLessonForStudentOnDate } from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import type { Lesson, Student } from "@/types";
import { Button } from "@/components/ui/Button";
import { ChevronRightIcon, DownloadIcon } from "@/components/ui/Icons";
import { downloadCsv, getMatrixTemplateCsv, getStudentLessonsMatrixCsv, getStudentLessonsMatrixFilename } from "@/utils/importTemplates";
import { parseLessonMatrixCSV, type ImportResult } from "@/utils/csvImport";
import "./students.mock.css";

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

/** Trash icon for Delete All button. */
function TrashIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Parse timeOfDay string to minutes from midnight for sorting. Returns 9999 if unparseable (sorts last). */
function timeOfDayToMinutes(t: string): number {
  if (!t || t.trim() === "" || t === "—") return 9999;
  const s = t.trim().toLowerCase();
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return 9999;
  let hours = parseInt(match[1]!, 10);
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3];
  if (period === "pm" && hours !== 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  if (!period && hours < 12) hours += 12; // assume pm if no period and small number
  return hours * 60 + mins;
}

function sortStudentsByTime(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const ta = timeOfDayToMinutes(a.timeOfDay);
    const tb = timeOfDayToMinutes(b.timeOfDay);
    if (ta !== tb) return ta - tb;
    return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName);
  });
}

function matchStudentByName(name: string, studentList: Student[]): Student | undefined {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const exact = studentList.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ") || first;
  const match = studentList.find(
    (s) =>
      s.firstName.toLowerCase() === first.toLowerCase() &&
      s.lastName.toLowerCase() === last.toLowerCase()
  );
  if (match) return match;
  if (parts.length >= 2) {
    const lastAlt = parts[1];
    return studentList.find(
      (s) =>
        s.firstName.toLowerCase() === first.toLowerCase() &&
        s.lastName.toLowerCase() === (lastAlt ?? "").toLowerCase()
    );
  }
  return undefined;
}

export default function Students() {
  const { data, clearAllStudents, addStudentsBulk, addLessonsBulk, updateLesson, clearAllLessons, reload } = useStoreContext();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [rosterTab, setRosterTab] = useState<"active" | "historical">("active");
  const [historicalSort, setHistoricalSort] = useState<"az" | "za">("az");
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const matrixFileInputRef = useRef<HTMLInputElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [clearingLessons, setClearingLessons] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [dropdownOpen]);

  const todayKey = toDateKey(new Date());
  const activeStudents = data.students.filter((s) => isStudentActive(s, todayKey));
  const historicalStudents = data.students.filter((s) => isStudentHistorical(s, todayKey));

  let filtered: Student[] =
    rosterTab === "active"
      ? activeStudents.filter(
          (s) =>
            (dayFilter === null || getAllScheduledDays(s).some((sched) => sched.dayOfWeek === dayFilter)) &&
            (!search.trim() || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
        )
      : historicalStudents.filter(
          (s) => !search.trim() || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
        );

  const byDayThenTime: { dayIndex: number; students: Student[] }[] =
    rosterTab === "active"
      ? dayFilter === null
        ? DAY_LABELS.map((_, dayIndex) => ({
            dayIndex,
            students: sortStudentsByTime(filtered.filter((s) => getAllScheduledDays(s).some((sched) => sched.dayOfWeek === dayIndex))),
          })).filter((g) => g.students.length > 0)
        : [{ dayIndex: dayFilter, students: sortStudentsByTime(filtered) }]
      : [];

  const historicalSorted =
    rosterTab === "historical"
      ? [...filtered].sort((a, b) => {
          const cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
          return historicalSort === "za" ? -cmp : cmp;
        })
      : [];

  const durationStr = (s: Student) =>
    s.durationMinutes === 60 ? "1 hour" : s.durationMinutes === 30 ? "30 min" : s.durationMinutes === 45 ? "45 min" : `${s.durationMinutes / 60} hours`;

  const totalCount = rosterTab === "active" ? activeStudents.length : historicalStudents.length;
  const countPerDay = DAY_LABELS.map((_, dayIndex) =>
    activeStudents.filter((s) => getAllScheduledDays(s).some((sched) => sched.dayOfWeek === dayIndex)).length
  );

  const handleConfirmDeleteAll = async () => {
    setDeleting(true);
    try {
      await clearAllStudents();
      setDeleteAllConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleMatrixImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);
    setImportProgress(null);
    try {
      const text = await file.text();
      const parsed = parseLessonMatrixCSV(text, new Date().getFullYear());
      if (parsed.error) {
        setImportResult({ imported: 0, skipped: 0, errors: [parsed.error] });
        setImporting(false);
        setImportProgress(null);
        e.target.value = "";
        return;
      }
      const total = parsed.attendance.length;
      setImportProgress({ current: 0, total });
      await new Promise((r) => setTimeout(r, 80));
      const existingSet = new Set(data.lessons.map((l) => `${l.studentId}|${l.date}`));
      const toAdd: Omit<Lesson, "id">[] = [];
      const toUpdate: { id: string; date: string; updates: { completed: boolean; amountCents: number; durationMinutes: number } }[] = [];
      const errors: string[] = [];
      let studentListForMatch = data.students;
      const uniqueNames = [...new Set(parsed.studentNames)];
      const missingNames = uniqueNames.filter((n) => !matchStudentByName(n, studentListForMatch));
      if (missingNames.length > 0) {
        const toCreate: Omit<Student, "id">[] = missingNames.map((name) => {
          const parts = name.trim().split(/\s+/).filter(Boolean);
          const firstName = parts[0] ?? "";
          const lastName = parts.slice(1).join(" ") || "";
          return {
            firstName,
            lastName,
            durationMinutes: 60,
            rateCents: 0,
            dayOfWeek: 1,
            timeOfDay: "9:00 AM",
          };
        });
        const { created } = await addStudentsBulk(toCreate);
        studentListForMatch = [...data.students, ...created];
      }
      const PROGRESS_BATCH = 150;
      for (let idx = 0; idx < parsed.attendance.length; idx++) {
        if (idx % PROGRESS_BATCH === 0 || idx === parsed.attendance.length - 1) {
          setImportProgress({ current: idx + 1, total });
          if (idx > 0 && idx < parsed.attendance.length - 1) await new Promise((r) => setTimeout(r, 0));
        }
        const { date, studentIndex } = parsed.attendance[idx];
        const name = parsed.studentNames[studentIndex];
        const student = name ? matchStudentByName(name, studentListForMatch) : undefined;
        if (!student) {
          if (!errors.some((x) => x.includes(name ?? ""))) errors.push(`No student named "${name}"`);
          continue;
        }
        const key = `${student.id}|${date}`;
        if (existingSet.has(key)) {
          const existing = getLessonForStudentOnDate(data.lessons, student.id, date);
          if (existing) toUpdate.push({ id: existing.id, date, updates: { completed: true, amountCents: student.rateCents, durationMinutes: student.durationMinutes } });
        } else {
          toAdd.push({ studentId: student.id, date, durationMinutes: student.durationMinutes, amountCents: student.rateCents, completed: true });
          existingSet.add(key);
        }
      }
      const totalSteps = parsed.attendance.length + toUpdate.length + toAdd.length;
      let updateImported = 0;
      const countsByYear: Record<string, number> = {};
      for (let i = 0; i < toUpdate.length; i++) {
        if (i % PROGRESS_BATCH === 0 || i === toUpdate.length - 1) {
          setImportProgress({ current: parsed.attendance.length + i + 1, total: totalSteps });
          if (i > 0 && i < toUpdate.length - 1) await new Promise((r) => setTimeout(r, 0));
        }
        const { id, date, updates } = toUpdate[i]!;
        try {
          await updateLesson(id, updates);
          updateImported++;
          const y = date.slice(0, 4);
          countsByYear[y] = (countsByYear[y] ?? 0) + 1;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Update failed for ${date}: ${msg}`);
        }
      }
      const toAddCountsByYear: Record<string, number> = {};
      for (const l of toAdd) {
        const y = l.date.slice(0, 4);
        toAddCountsByYear[y] = (toAddCountsByYear[y] ?? 0) + 1;
      }
      let bulkImported = 0;
      if (toAdd.length > 0) {
        setImportProgress({ current: totalSteps, total: totalSteps });
        try {
          const created = await addLessonsBulk(toAdd);
          bulkImported = created.length;
          for (const l of created) {
            const y = l.date.slice(0, 4);
            countsByYear[y] = (countsByYear[y] ?? 0) + 1;
          }
          if (created.length !== toAdd.length) {
            errors.push(`Only ${created.length} of ${toAdd.length} lessons were saved; ${toAdd.length - created.length} may have failed.`);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Bulk add failed (${toAdd.length} lessons): ${msg}`);
        }
      }
      const imported = updateImported + bulkImported;
      const skipped = parsed.attendance.length - imported;
      const dateRange =
        parsed.dates.length > 0
          ? { min: parsed.dates[0]!, max: parsed.dates[parsed.dates.length - 1]! }
          : undefined;
      const yearsInFile = dateRange
        ? (() => {
            const yMin = parseInt(dateRange.min.slice(0, 4), 10);
            const yMax = parseInt(dateRange.max.slice(0, 4), 10);
            const years: number[] = [];
            for (let y = yMin; y <= yMax; y++) years.push(y);
            return years;
          })()
        : undefined;
      const parsedCountsByYear: Record<string, number> = {};
      for (const { date } of parsed.attendance) {
        const y = date.slice(0, 4);
        parsedCountsByYear[y] = (parsedCountsByYear[y] ?? 0) + 1;
      }
      setImportResult({
        imported,
        skipped,
        errors,
        dateRange,
        yearsInFile,
        countsByYear: Object.keys(countsByYear).length > 0 ? countsByYear : undefined,
        parsedCountsByYear: Object.keys(parsedCountsByYear).length > 0 ? parsedCountsByYear : undefined,
        toAddCountsByYear: Object.keys(toAddCountsByYear).length > 0 ? toAddCountsByYear : undefined,
        skippedRowsNoYear: parsed.skippedRowsNoYear,
      });
      if (imported > 0 && hasSupabase()) await reload();
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
      setImportProgress(null);
      e.target.value = "";
    }
  };

  const importProgressBar = importing && importProgress ? (
    <div style={{ marginTop: 12, fontSize: 14, fontFamily: "var(--font-sans)" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Importing... {importProgress.current} of {importProgress.total}</p>
      <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%`, height: "100%", borderRadius: 4, background: "var(--mock-teal)", transition: "width 0.2s ease" }} />
      </div>
    </div>
  ) : null;

  const importResultBanner = importResult && !importing ? (() => {
    const success = importResult.imported > 0 && importResult.errors.length === 0;
    const partial = importResult.imported > 0 && importResult.errors.length > 0;
    const fail = importResult.imported === 0 && importResult.errors.length > 0;
    const label = success ? "lessons" : "items";
    return (
      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, fontSize: 14, fontFamily: "var(--font-sans)", background: success ? "#f0fdf4" : fail ? "#fef2f2" : "#fffbeb", border: `1px solid ${success ? "#bbf7d0" : fail ? "#fecaca" : "#fde68a"}` }}>
        <p style={{ margin: 0, fontWeight: 700, color: success ? "#166534" : fail ? "#991b1b" : "#92400e" }}>
          {success ? `Success! Imported ${importResult.imported} ${label}.` : partial ? `Partially imported: ${importResult.imported} added, ${importResult.skipped} skipped.` : `Import failed — ${importResult.skipped} item${importResult.skipped !== 1 ? "s" : ""} skipped.`}
        </p>
        {importResult.errors.length > 0 && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: fail ? "#991b1b" : "#92400e", maxHeight: 120, overflowY: "auto", fontSize: 13 }}>
            {importResult.errors.slice(0, 10).map((err, i) => (<li key={i} style={{ marginBottom: 2 }}>{err}</li>))}
            {importResult.errors.length > 10 && <li>...and {importResult.errors.length - 10} more</li>}
          </ul>
        )}
      </div>
    );
  })() : null;

  return (
    <div className="studentsPage">
      <div className="studentsPage__header">
        <div className="studentsPage__titleBlock">
          <h1 className="studentsPage__title">{t("students.title")}</h1>
          <span className="studentsPage__count">
            {totalCount === 1 ? t("students.oneStudent") : `${totalCount} ${t("students.studentCountLabel")}`}
          </span>
        </div>
        <div ref={dropdownRef} className="studentsPage__splitWrap">
          <input
            ref={matrixFileInputRef}
            type="file"
            accept=".csv"
            onChange={handleMatrixImport}
            style={{ display: "none" }}
            aria-hidden
          />
          <div className="studentsPage__splitPill" role="group" aria-label={t("students.title")}>
            <Link
              to="/add-student"
              className="studentsPage__splitLeft"
              onClick={() => setDropdownOpen(false)}
            >
              <span>+</span>
              <span>{t("students.title")}</span>
            </Link>
            <span className="studentsPage__splitDivider" aria-hidden />
            <button
              type="button"
              className="studentsPage__splitCaret"
              onClick={() => setDropdownOpen((o) => !o)}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
              aria-label={dropdownOpen ? "Close menu" : "Open menu"}
            >
              <span className="studentsPage__addBtnChevron" aria-hidden>{dropdownOpen ? "▲" : "▼"}</span>
            </button>
          </div>
          {dropdownOpen && (
            <div className="studentsPage__dropdown" role="menu" aria-label={t("students.title")}>
              <button
                type="button"
                role="menuitem"
                className="studentsPage__dropdownItem"
                onClick={() => {
                  setDropdownOpen(false);
                  matrixFileInputRef.current?.click();
                }}
                disabled={importing || clearingLessons}
              >
                <UploadIcon size={20} />
                <span>{t("students.importLessons")}</span>
              </button>
              <div className="studentsPage__dropdownDivider" />
              <button
                type="button"
                role="menuitem"
                className="studentsPage__dropdownItem"
                onClick={() => {
                  setDropdownOpen(false);
                  const csv = getStudentLessonsMatrixCsv(data.students, data.lessons);
                  downloadCsv(getStudentLessonsMatrixFilename(), csv);
                }}
                disabled={data.students.length === 0}
              >
                <DownloadIcon size={20} />
                <span>{t("students.downloadLessons")}</span>
              </button>
              <div className="studentsPage__dropdownDivider" />
              <button
                type="button"
                role="menuitem"
                className="studentsPage__dropdownItem"
                onClick={() => {
                  setDropdownOpen(false);
                  downloadCsv("lessons-matrix-template.csv", getMatrixTemplateCsv());
                }}
              >
                <DownloadIcon size={20} />
                <span>{t("students.lessonsMatrixTemplate")}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {(importProgressBar || importResultBanner) && (
        <div className="studentsPage__importStatus">
          {importProgressBar}
          {importResultBanner}
        </div>
      )}
      <div className="studentsPage__segmented">
        <Button type="button" variant="tab" size="sm" className="studentsPage__segmentedBtn" active={rosterTab === "active"} onClick={() => { setRosterTab("active"); setDayFilter(null); }}>
          {t("students.active")}
        </Button>
        <Button type="button" variant="tab" size="sm" className="studentsPage__segmentedBtn" active={rosterTab === "historical"} onClick={() => setRosterTab("historical")}>
          {t("students.historical")}
        </Button>
      </div>

      {rosterTab === "active" && (
        <>
          <div className="studentsPage__searchWrap">
            <input
              type="search"
              placeholder={t("students.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="studentsPage__searchInput"
            />
          </div>
          <div className="studentsPage__dayChips">
            <button
              type="button"
              className="studentsPage__dayChip studentsPage__dayChip--all"
              aria-pressed={dayFilter === null}
              onClick={() => setDayFilter(null)}
            >
              <span className="studentsPage__dayChipCircle">{t("students.all")}</span>
              <span className="studentsPage__dayChipCount">{totalCount}</span>
            </button>
            {DAY_SHORT.map((label, i) => (
              <button
                key={i}
                type="button"
                className={`studentsPage__dayChip ${countPerDay[i] === 0 ? "studentsPage__dayChip--empty" : ""}`}
                aria-pressed={dayFilter === i}
                onClick={() => setDayFilter(i)}
                title={`${DAY_FULL[i]} (${countPerDay[i]})`}
              >
                <span className="studentsPage__dayChipCircle">{label}</span>
                <span className="studentsPage__dayChipCount">{countPerDay[i]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {rosterTab === "historical" && (
        <div className="studentsPage__historicalBar">
          <input
            type="search"
            placeholder={t("students.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="studentsPage__searchInput"
          />
          <select
            value={historicalSort}
            onChange={(e) => setHistoricalSort(e.target.value as "az" | "za")}
            className="studentsPage__sortSelect"
          >
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
          </select>
        </div>
      )}

      {rosterTab === "active" && filtered.length === 0 && (
        <div className="studentsPage__emptyCard">
          <p style={{ color: "var(--text-muted)", marginBottom: 8, fontSize: 15 }}>
            {search ? t("students.noMatch") : dayFilter !== null ? `${t("students.noStudentsOnDay")} ${DAY_LABELS[dayFilter!]}` : t("students.noStudentsYet")}
          </p>
          {hasSupabase() && data.user && !search && dayFilter === null && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12, marginBottom: 0 }}>
              Logged in as <strong>{data.user.email}</strong>. Students added in another browser will only show if you use this same account.
            </p>
          )}
        </div>
      )}

      {rosterTab === "historical" && historicalSorted.length === 0 && (
        <div className="studentsPage__emptyCard">
          <p style={{ color: "var(--text-muted)", fontSize: 15, margin: 0 }}>
            {search ? t("students.noMatch") : t("students.noHistoricalStudents")}
          </p>
        </div>
      )}

      {rosterTab === "active" && filtered.length > 0 && (
        <div className="studentsPage__dayList">
          {byDayThenTime.map(({ dayIndex, students }) => (
            <div key={dayIndex} className="studentsPage__dayGroup">
              <h2 className="studentsPage__dayHeader">{DAY_FULL[dayIndex]}</h2>
              {students.map((s) => (
                <Link key={s.id} to={`/students/${s.id}`} className="studentsPage__rowLink">
                  <div className="studentsPage__row">
                    <StudentAvatar student={s} size={48} />
                    <div className="studentsPage__rowContent">
                      <div className="studentsPage__rowName">{s.firstName} {s.lastName}</div>
                      <div className="studentsPage__rowMeta">
                        {s.timeOfDay && s.timeOfDay !== "\u2014" ? `${s.timeOfDay} · ` : ""}{durationStr(s)}
                      </div>
                      <div className="studentsPage__rowRate">{formatCurrency(s.rateCents)}</div>
                      {s.terminatedFromDate && (
                        <div className="studentsPage__rowTerminated">{t("studentDetail.terminatingOn", { date: s.terminatedFromDate })}</div>
                      )}
                    </div>
                    <span className="studentsPage__rowChevron" aria-hidden><ChevronRightIcon size={16} /></span>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}

      {rosterTab === "historical" && historicalSorted.length > 0 && (
        <div className="studentsPage__historicalList">
          {historicalSorted.map((s) => (
            <Link key={s.id} to={`/students/${s.id}`} className="studentsPage__rowLink">
              <div className="studentsPage__row studentsPage__row--historical">
                <StudentAvatar student={s} size={48} />
                <div className="studentsPage__rowContent">
                  <div className="studentsPage__rowName">{s.firstName} {s.lastName}</div>
                  <div className="studentsPage__rowMeta">{t("students.terminatedOn", { date: s.terminatedFromDate ?? "" })}</div>
                </div>
                <span className="studentsPage__rowChevron" aria-hidden><ChevronRightIcon size={16} /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="studentsPage__actions">
        {totalCount > 0 && (
          <div className="studentsPage__bottomRow">
            <button
              type="button"
              className="studentsPage__clearLessonsBtn"
              disabled={clearingLessons}
              onClick={async () => {
                if (!window.confirm("Are you sure?")) return;
                if (!window.confirm("This will delete ALL lessons. This cannot be undone. You can re-import the attendance matrix after. Continue?")) return;
                setClearingLessons(true);
                try {
                  await clearAllLessons();
                  if (hasSupabase()) await reload();
                } catch (e) {
                  console.error(e);
                  window.alert(e instanceof Error ? e.message : "Failed to clear");
                } finally {
                  setClearingLessons(false);
                }
              }}
            >
              {clearingLessons ? "…" : (
                <>
                  <span className="studentsPage__bottomBtnIcon" aria-hidden>×</span>
                  <span>{t("students.clearLessons")}</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="studentsPage__deleteAllBtnBottom"
              onClick={() => setDeleteAllConfirmOpen(true)}
              disabled={totalCount === 0}
            >
              <TrashIcon size={18} />
              {t("students.deleteAllStudents")}
            </button>
          </div>
        )}
      </div>
      {deleteAllConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-all-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => !deleting && setDeleteAllConfirmOpen(false)}
        >
          <div
            className="float-card"
            style={{ maxWidth: 360, width: "100%", padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-all-title" style={{ fontSize: 18, fontWeight: 600, margin: "0 0 12px" }}>
              {t("students.deleteAllConfirmTitle")}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 20px", lineHeight: 1.45 }}>
              {t("students.deleteAllConfirmMessage")}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => !deleting && setDeleteAllConfirmOpen(false)}
                disabled={deleting}
              >
                {t("students.deleteAllCancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmDeleteAll}
                disabled={deleting}
                loading={deleting}
              >
                {t("students.deleteAllConfirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
