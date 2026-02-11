import { useState, useEffect, Fragment } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { formatCurrency } from "@/utils/earnings";
import type { Student, Lesson } from "@/types";

const DURATIONS = [30, 45, 60, 90, 120];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

function formatTimeRange(startTimeStr: string, durationMinutes: number): string {
  const startMins = parseTimeToMinutes(startTimeStr);
  if (startMins == null) return startTimeStr;
  const endMins = startMins + durationMinutes;
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

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, updateStudent, deleteStudent } = useStoreContext();
  const student = data.students.find((s) => s.id === id);
  const studentLessons = data.lessons.filter((l) => l.studentId === id && l.completed);
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
      ? countDaysWithDayOfWeek(
          new Date(now.getFullYear(), now.getMonth(), 1),
          new Date(now.getFullYear(), now.getMonth() + 1, 0),
          student.dayOfWeek
        )
      : 0;
  const availableThisYear =
    student != null ? countDaysWithDayOfWeek(new Date(thisYear, 0, 1), now, student.dayOfWeek) : 0;

  const [editing, setEditing] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState(student?.firstName ?? "");
  const [lastName, setLastName] = useState(student?.lastName ?? "");
  const [durationMinutes, setDurationMinutes] = useState(student?.durationMinutes ?? 60);
  const [rateDollars, setRateDollars] = useState(student ? String((student.rateCents / 100).toFixed(2)) : "");
  const [dayOfWeek, setDayOfWeek] = useState(student?.dayOfWeek ?? 1);
  const [timeOfDay, setTimeOfDay] = useState(student?.timeOfDay ?? "");

  useEffect(() => {
    if (student) {
      setEditing(false);
      setFirstName(student.firstName);
      setLastName(student.lastName);
      setDurationMinutes(student.durationMinutes);
      setRateDollars(String((student.rateCents / 100).toFixed(2)));
      setDayOfWeek(student.dayOfWeek);
      setTimeOfDay(student.timeOfDay);
    }
  }, [id]);

  if (!student) return <p style={{ padding: 24 }}>Student not found</p>;

  const syncFormFromStudent = () => {
    setFirstName(student.firstName);
    setLastName(student.lastName);
    setDurationMinutes(student.durationMinutes);
    setRateDollars(String((student.rateCents / 100).toFixed(2)));
    setDayOfWeek(student.dayOfWeek);
    setTimeOfDay(student.timeOfDay);
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
    if (!firstName.trim() || !lastName.trim() || !rateDollars.trim()) return;
    const trimmed = timeOfDay.trim();
    if (trimmed && trimmed !== "—" && !/am|pm/i.test(trimmed)) {
      setError("Time must include AM or PM (e.g. 5:00 PM)");
      return;
    }
    const rateCents = Math.round(parseFloat(rateDollars) * 100) || 0;
    const updates: Partial<Student> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      durationMinutes,
      rateCents,
      dayOfWeek,
      timeOfDay: trimmed || "—",
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
    if (!window.confirm(`Delete ${student.firstName} ${student.lastName}? This will also remove all their lessons.`)) return;
    setError("");
    try {
      await deleteStudent(student.id);
      navigate("/students");
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : e instanceof Error ? e.message : "Could not delete. Try again.";
      setError(msg);
    }
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: 16, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16, fontSize: 16 };

  return (
    <>
      <Link to="/students" style={{ display: "inline-flex", alignItems: "center", marginBottom: 16, color: "var(--text)", textDecoration: "none" }}>← Back</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{student.firstName} {student.lastName}</h1>
        {!editing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleStartEdit} className="btn btn-primary" style={{ padding: "10px 16px" }}>Edit</button>
            <button type="button" onClick={handleDelete} style={{ padding: "10px 16px", border: "1px solid #dc2626", borderRadius: 8, background: "transparent", color: "#dc2626", fontWeight: 600, cursor: "pointer" }}>Delete</button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={handleSaveEdit} className="card" style={{ marginBottom: 24 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>First name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Last name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Lesson duration</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDurationMinutes(m)}
                style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--border)", background: durationMinutes === m ? "var(--primary)" : "var(--card)", color: durationMinutes === m ? "white" : "var(--text)" }}
              >
                {m === 60 ? "1 hour" : m === 90 ? "1.5 hours" : m === 120 ? "2 hours" : `${m} min`}
              </button>
            ))}
          </div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Rate ($)</label>
          <input type="number" step="0.01" value={rateDollars} onChange={(e) => setRateDollars(e.target.value)} placeholder="70" style={inputStyle} required />
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Day of week</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {DAYS_FULL.map((d, i) => (
              <button key={i} type="button" onClick={() => setDayOfWeek(i)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: dayOfWeek === i ? "var(--primary)" : "var(--card)", color: dayOfWeek === i ? "white" : "var(--text)", fontSize: 13 }}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Time (e.g. 5:00 PM) – include AM or PM</label>
          <input type="text" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} placeholder="5:00 PM" style={inputStyle} />
          {error ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" onClick={handleCancelEdit} style={{ padding: "10px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", cursor: "pointer" }}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="card">
                <div style={{ fontSize: 20, fontWeight: 700 }}>{thisMonthLessons.length}/{availableThisMonth}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{thisMonthLessons.length} of {availableThisMonth} lessons for {monthLabel}</div>
              </div>
              <div className="card">
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(earningsThisMonth)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Total earnings this month</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="card">
                <div style={{ fontSize: 20, fontWeight: 700 }}>{thisYearLessons.length}/{availableThisYear}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{thisYearLessons.length} lessons out of {availableThisYear} (YTD)</div>
              </div>
              <div className="card">
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(earningsYTD)}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Total earnings YTD</div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 0.6fr 1fr 1.4fr", gap: 8, marginBottom: 24, minWidth: 0 }}>
            <div className="card" style={{ minWidth: 0, padding: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatDuration(student.durationMinutes)}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Lesson time</div>
            </div>
            <div className="card" style={{ minWidth: 0, padding: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{formatCurrency(student.rateCents)}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Rate</div>
            </div>
            <div className="card" style={{ minWidth: 0, padding: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{DAYS_FULL[student.dayOfWeek]}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Day</div>
            </div>
            <div className="card" style={{ minWidth: 0, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, wordBreak: "break-word", lineHeight: 1.3 }}>{student.timeOfDay && student.timeOfDay !== "—" ? formatTimeRange(student.timeOfDay, student.durationMinutes) : "—"}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Time</div>
            </div>
          </div>
        </>
      )}

      {error && !editing ? <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p> : null}

      {!editing && (
        <>
          {(() => {
            const years = [...new Set(studentLessons.map((l) => l.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
            if (years.length === 0) {
              return <p style={{ color: "var(--text-muted)" }}>No lessons logged yet</p>;
            }
            return years.map((year) => {
              const yearLessons = studentLessons.filter((l) => l.date.startsWith(year));
              const byMonth = new Map<string, Lesson[]>();
              for (const l of yearLessons) {
                const key = l.date.slice(0, 7);
                if (!byMonth.has(key)) byMonth.set(key, []);
                byMonth.get(key)!.push(l);
              }
              const rows = Array.from(byMonth.entries())
                .map(([monthKey, lessons]) => {
                  const [y, m] = monthKey.split("-").map(Number);
                  const first = new Date(y, m - 1, 1);
                  const last = new Date(y, m - 1 + 1, 0);
                  const available = student ? countDaysWithDayOfWeek(first, last, student.dayOfWeek) : lessons.length;
                  const totalEarned = lessons.reduce((s, l) => s + l.amountCents, 0);
                  const monthName = first.toLocaleDateString("en-US", { month: "long" });
                  return { monthKey, monthName, lessons: lessons.sort((a, b) => b.date.localeCompare(a.date)), available, totalEarned };
                })
                .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
              return (
                <div key={year} style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Lessons Log {year}</h3>
                  <div className="card" style={{ overflowX: "auto", padding: 0 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "52%" }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "26%" }} />
                      </colgroup>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                          <th style={{ padding: "12px 12px 12px 16px", fontWeight: 600 }}>Month</th>
                          <th style={{ padding: 12, fontWeight: 600, textAlign: "center" }}>Number of Lessons</th>
                          <th style={{ padding: "12px 16px 12px 12px", fontWeight: 600, textAlign: "right" }}>Total Earned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ monthKey, monthName, lessons, available, totalEarned }) => (
                          <Fragment key={monthKey}>
                            <tr
                              onClick={() => setExpandedMonth((prev) => (prev === monthKey ? null : monthKey))}
                              style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: expandedMonth === monthKey ? "var(--bg)" : undefined }}
                            >
                              <td style={{ padding: "12px 12px 12px 16px", whiteSpace: "nowrap" }}>
                                {expandedMonth === monthKey ? "▼ " : "▶ "}{monthName}
                              </td>
                              <td style={{ padding: 12, textAlign: "center" }}>{lessons.length}/{available}</td>
                              <td style={{ padding: "12px 16px 12px 12px", fontWeight: 600, textAlign: "right" }}>{formatCurrency(totalEarned)}</td>
                            </tr>
                            {expandedMonth === monthKey && (
                              <tr>
                                <td colSpan={3} style={{ padding: "0 16px 12px", background: "var(--bg)", verticalAlign: "top" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
                                    {lessons.map((l) => (
                                      <div key={l.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: 0 }}>
                                        <span>{l.date}</span>
                                        <span style={{ fontWeight: 600 }}>{formatCurrency(l.amountCents)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
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
