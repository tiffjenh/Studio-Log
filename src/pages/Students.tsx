import { useState } from "react";
import { Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { hasSupabase } from "@/lib/supabase";
import { formatCurrency, getAllScheduledDays } from "@/utils/earnings";
import StudentAvatar from "@/components/StudentAvatar";
import type { Student } from "@/types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const roundBtnStyle = {
  width: 40,
  height: 40,
  minWidth: 40,
  maxWidth: 40,
  minHeight: 40,
  maxHeight: 40,
  borderRadius: "50%" as const,
  display: "flex",
  alignItems: "center" as const,
  justifyContent: "center" as const,
  border: "none",
  cursor: "pointer" as const,
  fontSize: 14,
  fontWeight: 600,
  padding: 0,
  lineHeight: 1,
};

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
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  let filtered = data.students.filter((s) =>
    (dayFilter === null || getAllScheduledDays(s).some((sched) => sched.dayOfWeek === dayFilter)) &&
    (!search.trim() || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
  );

  const byDayThenTime: { dayIndex: number; students: Student[] }[] =
    dayFilter === null
      ? DAY_LABELS.map((_, dayIndex) => ({
          dayIndex,
          students: sortStudentsByTime(filtered.filter((s) => getAllScheduledDays(s).some((sched) => sched.dayOfWeek === dayIndex))),
        })).filter((g) => g.students.length > 0)
      : [{ dayIndex: dayFilter, students: sortStudentsByTime(filtered) }];

  const durationStr = (s: Student) =>
    s.durationMinutes === 60 ? "1 hour" : s.durationMinutes === 30 ? "30 min" : s.durationMinutes === 45 ? "45 min" : `${s.durationMinutes / 60} hours`;

  const totalCount = data.students.length;
  const countPerDay = DAY_LABELS.map((_, dayIndex) =>
    data.students.filter((s) => getAllScheduledDays(s).some((sched) => sched.dayOfWeek === dayIndex)).length
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setDayFilter(null)}
          style={{
            ...roundBtnStyle,
            background: dayFilter === null ? "var(--avatar-gradient)" : "rgba(201, 123, 148, 0.12)",
            color: dayFilter === null ? "white" : "var(--text)",
            flexShrink: 0,
          }}
        >
          {t("students.all")}
        </button>
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
          <button
            key={i}
            type="button"
            onClick={() => setDayFilter(i)}
            style={{
              ...roundBtnStyle,
              background: dayFilter === i ? "var(--avatar-gradient)" : "rgba(201, 123, 148, 0.12)",
              color: dayFilter === i ? "white" : "var(--text)",
              flexShrink: 0,
            }}
            title={`${DAY_FULL[i]} (${countPerDay[i]})`}
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
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
      ) : (
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
                      </div>
                      <span style={{ color: "var(--text-muted)", fontSize: 18 }}>›</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => setDeleteAllConfirmOpen(true)}
          disabled={totalCount === 0}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 600,
            color: "#b91c1c",
            background: "#ffffff",
            border: "1px solid rgba(201, 123, 148, 0.6)",
            borderRadius: 999,
            padding: "6px 14px",
            cursor: totalCount === 0 ? "default" : "pointer",
            opacity: totalCount === 0 ? 0.5 : 1,
            boxShadow: "none",
          }}
        >
          {t("students.deleteAllStudents")}
        </button>
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
              <button
                type="button"
                onClick={() => !deleting && setDeleteAllConfirmOpen(false)}
                disabled={deleting}
                className="pill"
                style={{ fontFamily: "var(--font-sans)", padding: "10px 20px", fontSize: 14, fontWeight: 500 }}
              >
                {t("students.deleteAllCancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={deleting}
                className="pill"
                style={{
                  fontFamily: "var(--font-sans)",
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 500,
                  background: "var(--avatar-gradient)",
                  color: "white",
                  border: "none",
                }}
              >
                {deleting ? t("common.loading") || "..." : t("students.deleteAllConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
