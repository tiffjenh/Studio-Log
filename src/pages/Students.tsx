import { useState } from "react";
import { Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import { formatCurrency, getAllScheduledDays, toDateKey, isStudentActive, isStudentHistorical } from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import type { Student } from "@/types";
import { Button } from "@/components/ui/Button";
import { ChevronRightIcon, DownloadIcon } from "@/components/ui/Icons";
import { downloadCsv, getStudentLessonsMatrixCsv, getStudentLessonsMatrixFilename } from "@/utils/importTemplates";

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

export default function Students() {
  const { data, clearAllStudents } = useStoreContext();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [rosterTab, setRosterTab] = useState<"active" | "historical">("active");
  const [historicalSort, setHistoricalSort] = useState<"az" | "za">("az");
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0 }}>{t("students.title")}</h1>
          <span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 500 }}>
            {totalCount === 1 ? t("students.oneStudent") : `${totalCount} ${t("students.studentCountLabel")}`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Button type="button" variant="tab" size="sm" active={rosterTab === "active"} onClick={() => { setRosterTab("active"); setDayFilter(null); }}>
          {t("students.active")}
        </Button>
        <Button type="button" variant="tab" size="sm" active={rosterTab === "historical"} onClick={() => setRosterTab("historical")}>
          {t("students.historical")}
        </Button>
      </div>

      {rosterTab === "active" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Button type="button" variant="tab" size="sm" active={dayFilter === null} onClick={() => setDayFilter(null)} style={{ flexShrink: 0 }}>
              {t("students.all")}
            </Button>
            <input
              type="search"
              placeholder={t("students.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-frosted"
              style={{ flex: 1, minWidth: 0, marginBottom: 0 }}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "nowrap", gap: 10, marginBottom: 20 }}>
            {DAY_SHORT.map((label, i) => (
              <Button
                key={i}
                type="button"
                variant="tab"
                size="sm"
                active={dayFilter === i}
                onClick={() => setDayFilter(i)}
                style={{ minWidth: 40, minHeight: 40, flexShrink: 0 }}
                title={`${DAY_FULL[i]} (${countPerDay[i]})`}
              >
                {label}
              </Button>
            ))}
          </div>
        </>
      )}

      {rosterTab === "historical" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <input
            type="search"
            placeholder={t("students.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-frosted"
            style={{ flex: 1, minWidth: 120, marginBottom: 0 }}
          />
          <select
            value={historicalSort}
            onChange={(e) => setHistoricalSort(e.target.value as "az" | "za")}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--card)",
              fontFamily: "var(--font-sans)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
          </select>
        </div>
      )}

      {rosterTab === "active" && filtered.length === 0 && (
        <div className="float-card" style={{ padding: 28, textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: 8, fontSize: 15 }}>
            {search ? t("students.noMatch") : dayFilter !== null ? `${t("students.noStudentsOnDay")} ${DAY_LABELS[dayFilter!]}` : t("students.noStudentsYet")}
          </p>
          {hasSupabase() && data.user && !search && dayFilter === null && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Logged in as <strong>{data.user.email}</strong>. Students added in another browser will only show if you use this same account.
            </p>
          )}
        </div>
      )}

      {rosterTab === "historical" && historicalSorted.length === 0 && (
        <div className="float-card" style={{ padding: 28, textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
            {search ? t("students.noMatch") : t("students.noHistoricalStudents")}
          </p>
        </div>
      )}

      {rosterTab === "active" && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {byDayThenTime.map(({ dayIndex, students }) => (
            <div key={dayIndex}>
              <h2 className="headline-serif" style={{ fontSize: 18, fontWeight: 400, color: "var(--text-muted)", margin: "0 0 12px", textTransform: "none" }}>
                {DAY_FULL[dayIndex]} ({students.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {students.map((s) => (
                  <Link key={s.id} to={`/students/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="float-card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <StudentAvatar student={s} size={48} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{s.firstName} {s.lastName}</div>
                        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{durationStr(s)} / {formatCurrency(s.rateCents)}</div>
                        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{getAllScheduledDays(s).map((sched) => DAY_LABELS[sched.dayOfWeek]).join(", ")}{s.timeOfDay && s.timeOfDay !== "\u2014" ? ` at ${s.timeOfDay}` : ""}</div>
                        {s.terminatedFromDate && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>{t("studentDetail.terminatingOn", { date: s.terminatedFromDate })}</div>
                        )}
                      </div>
                      <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center" }}><ChevronRightIcon size={16} /></span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {rosterTab === "historical" && historicalSorted.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {historicalSorted.map((s) => (
            <Link key={s.id} to={`/students/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="float-card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <StudentAvatar student={s} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{s.firstName} {s.lastName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{t("students.terminatedOn", { date: s.terminatedFromDate ?? "" })}</div>
                </div>
                <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center" }}><ChevronRightIcon size={16} /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "center", flexWrap: "wrap", alignItems: "stretch", gap: 12 }}>
        <Button
          type="button"
          variant="danger"
          size="md"
          onClick={() => setDeleteAllConfirmOpen(true)}
          disabled={totalCount === 0}
          style={{ minHeight: 40 }}
        >
          {t("students.deleteAllStudents")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => {
            const csv = getStudentLessonsMatrixCsv(data.students, data.lessons);
            downloadCsv(getStudentLessonsMatrixFilename(), csv);
          }}
          disabled={data.students.length === 0}
          leftIcon={<DownloadIcon size={7} />}
          style={{ minHeight: 40 }}
        >
          {t("students.downloadStudentLessons")}
        </Button>
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
    </>
  );
}
