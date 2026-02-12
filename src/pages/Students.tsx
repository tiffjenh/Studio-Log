import { useState } from "react";
import { Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { hasSupabase } from "@/lib/supabase";
import { formatCurrency } from "@/utils/earnings";
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
  const { data } = useStoreContext();
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<number | null>(null);

  let filtered = data.students.filter((s) =>
    (dayFilter === null || s.dayOfWeek === dayFilter) &&
    (!search.trim() || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
  );

  const byDayThenTime: { dayIndex: number; students: Student[] }[] =
    dayFilter === null
      ? DAY_LABELS.map((_, dayIndex) => ({
          dayIndex,
          students: sortStudentsByTime(filtered.filter((s) => s.dayOfWeek === dayIndex)),
        })).filter((g) => g.students.length > 0)
      : [{ dayIndex: dayFilter, students: sortStudentsByTime(filtered) }];

  const durationStr = (s: Student) =>
    s.durationMinutes === 60 ? "1 hour" : s.durationMinutes === 30 ? "30 min" : s.durationMinutes === 45 ? "45 min" : `${s.durationMinutes / 60} hours`;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0 }}>Students</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            to="/add-student"
            title="Add student"
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
          All
        </button>
        <input
          type="search"
          placeholder="Search by name"
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
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="float-card" style={{ padding: 28, textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: 8, fontSize: 15 }}>
            {search ? "No students match your search" : dayFilter !== null ? `No students on ${DAY_LABELS[dayFilter!]}` : "No students yet. Tap + to add one."}
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
              {dayFilter === null && (
                <h2 className="headline-serif" style={{ fontSize: 18, fontWeight: 400, color: "var(--text-muted)", margin: "0 0 12px", textTransform: "none" }}>
                  {DAY_FULL[dayIndex]}
                </h2>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {students.map((s) => (
                  <Link key={s.id} to={`/students/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="float-card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <StudentAvatar student={s} size={48} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{s.firstName} {s.lastName}</div>
                        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{durationStr(s)} / {formatCurrency(s.rateCents)}</div>
                        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{DAY_LABELS[s.dayOfWeek]}{s.timeOfDay && s.timeOfDay !== "—" ? ` at ${s.timeOfDay}` : ""}</div>
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
    </>
  );
}
