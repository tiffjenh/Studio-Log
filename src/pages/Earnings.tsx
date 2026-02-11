import { useState } from "react";
import { useStoreContext } from "@/context/StoreContext";
import {
  formatCurrency,
  getMonthBounds,
  toDateKey,
  getWeeksInMonth,
  getDailyTotalsForWeek,
  getYAxisTicks,
} from "@/utils/earnings";

const TABS = ["Daily", "Weekly", "Monthly", "Students"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_HEIGHT = 160;

const EMPTY_TICKS = [0, 5000, 10000, 15000, 20000];

function BarChart({
  data,
  xLabels,
  xSubLabels,
  maxVal,
  dateKeys,
  onBarClick,
}: {
  data: number[];
  xLabels: string[];
  xSubLabels?: string[];
  maxVal: number;
  dateKeys?: string[];
  onBarClick?: (dateKey: string) => void;
}) {
  const isEmpty = maxVal <= 0 || data.every((v) => v === 0);
  const ticks = isEmpty ? EMPTY_TICKS : getYAxisTicks(maxVal);
  const topTick = Math.max(...ticks, 10000);
  const chartMax = isEmpty ? 20000 : topTick * 1.15;
  const showSubLabels = xSubLabels && xSubLabels.length === data.length;
  const isClickable = Boolean(dateKeys?.length && onBarClick && dateKeys.length === data.length);

  return (
    <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: 8, minWidth: 40, fontSize: 11, color: "var(--text-muted)", textAlign: "right", height: CHART_HEIGHT }}>
        {[...ticks].reverse().map((t) => (
          <span key={t}>{formatCurrency(t)}</span>
        ))}
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ position: "relative", height: CHART_HEIGHT, borderBottom: "1px solid var(--border)" }}>
          {ticks.slice(1).map((t) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: `${(t / chartMax) * 100}%`,
                height: 1,
                background: "var(--border)",
              }}
            />
          ))}
          {isEmpty && (
            <div style={{ position: "absolute", left: 0, right: 0, top: "37.5%", transform: "translateY(-50%)", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>No earnings</span>
            </div>
          )}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-around", gap: 4, alignItems: "flex-end", height: CHART_HEIGHT, padding: "0 4px" }}>
            {data.map((v, i) => {
              const heightPct = chartMax > 0 ? (v / chartMax) * 100 : 0;
              const barHeight = Math.max(v > 0 ? 6 : 0, (heightPct / 100) * CHART_HEIGHT);
              const dateKey = dateKeys?.[i];
              return (
                <div
                  key={i}
                  role={isClickable ? "button" : undefined}
                  onClick={isClickable && dateKey ? () => onBarClick?.(dateKey) : undefined}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    maxWidth: 40,
                    cursor: isClickable ? "pointer" : "default",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{v > 0 ? formatCurrency(v) : ""}</span>
                  <div
                    title={formatCurrency(v)}
                    style={{
                      width: "75%",
                      height: barHeight,
                      minHeight: v > 0 ? 6 : 0,
                      background: "var(--primary)",
                      borderRadius: 6,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
          {xLabels.map((l, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", maxWidth: 56, minWidth: 0 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</div>
              {showSubLabels && xSubLabels![i] && <div style={{ fontSize: 10, opacity: 0.85 }}>{xSubLabels![i]}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Earnings() {
  const { data } = useStoreContext();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Daily");
  const [dailyWeekOffset, setDailyWeekOffset] = useState(0);
  const [selectedDayDateKey, setSelectedDayDateKey] = useState<string | null>(null);
  const [selectedWeekStartKey, setSelectedWeekStartKey] = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [weeklyMonthOffset, setWeeklyMonthOffset] = useState(0);
  const [monthlyYearOffset, setMonthlyYearOffset] = useState(0);
  const now = new Date();
  const completedLessons = data.lessons.filter((l) => l.completed);
  const thisYear = now.getFullYear();

  const weeklyMonthDate = new Date(now.getFullYear(), now.getMonth() + weeklyMonthOffset, 1);
  const weeklyYear = weeklyMonthDate.getFullYear();
  const weeklyMonth = weeklyMonthDate.getMonth();
  const weeklyData = getWeeksInMonth(data.lessons, weeklyYear, weeklyMonth);
  const weeklyMonthTitle = weeklyMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const displayYear = thisYear + monthlyYearOffset;
  const monthlyTotals: number[] = [];
  const monthlyHours: number[] = [];
  for (let m = 0; m < 12; m++) {
    const { start, end } = getMonthBounds(new Date(displayYear, m));
    const monthLessons = completedLessons.filter((l) => l.date >= toDateKey(start) && l.date <= toDateKey(end));
    monthlyTotals.push(monthLessons.reduce((s, l) => s + l.amountCents, 0));
    monthlyHours.push(monthLessons.reduce((s, l) => s + l.durationMinutes, 0) / 60);
  }
  const monthsToShow = displayYear > thisYear ? 0 : displayYear < thisYear ? 12 : now.getMonth() + 1;
  const visibleMonthLabels = MONTH_LABELS.slice(0, monthsToShow);
  const visibleMonthlyTotals = monthlyTotals.slice(0, monthsToShow);
  const visibleMonthlyHours = monthlyHours.slice(0, monthsToShow);
  const monthlyTitle = new Date(displayYear, now.getMonth(), 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const dailyData = getDailyTotalsForWeek(completedLessons, now, dailyWeekOffset);
  const dailyWeekTotal = dailyData.reduce((s, d) => s + d.total, 0);
  const dailyRangeStart = dailyData[0]?.label ?? "";
  const dailyRangeEnd = dailyData[6]?.label ?? "";

  const maxMonthly = Math.max(...visibleMonthlyTotals, 1);
  const maxWeekly = Math.max(...weeklyData.map((w) => w.total), 1);
  const maxDaily = Math.max(...dailyData.map((d) => d.total), 1);

  return (
    <>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Earnings</h1>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            style={{
              padding: "8px 0",
              border: "none",
              background: "none",
              fontSize: 15,
              fontWeight: activeTab === t ? 600 : 500,
              color: activeTab === t ? "var(--primary)" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Weekly" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => { setWeeklyMonthOffset((o) => o - 1); setSelectedWeekStartKey(null); }}
              style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {weeklyMonthTitle}
            </div>
            <button
              type="button"
              onClick={() => { setWeeklyMonthOffset((o) => o + 1); setSelectedWeekStartKey(null); }}
              style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            {weeklyData.length > 0 ? (
              <BarChart
                data={weeklyData.map((w) => w.total)}
                xLabels={weeklyData.map((w) => w.label)}
                maxVal={maxWeekly}
                dateKeys={weeklyData.map((w) => w.startKey)}
                onBarClick={(key) => setSelectedWeekStartKey((prev) => (prev === key ? null : key))}
              />
            ) : (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No weeks in this month</div>
            )}
          </div>
          {selectedWeekStartKey && (() => {
            const week = weeklyData.find((w) => w.startKey === selectedWeekStartKey);
            if (!week) return null;
            const weekLessons = completedLessons.filter((l) => l.date >= week.startKey && l.date <= week.endKey);
            const numStudents = weekLessons.length;
            const totalMinutes = weekLessons.reduce((s, l) => s + l.durationMinutes, 0);
            const totalHours = totalMinutes / 60;
            const totalEarned = weekLessons.reduce((s, l) => s + l.amountCents, 0);
            const [sy, sm, sd] = week.startKey.split("-").map(Number);
            const [ey, em, ed] = week.endKey.split("-").map(Number);
            const startFormatted = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const endFormatted = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const formatDuration = (mins: number) => mins === 60 ? "1 hour" : mins < 60 ? `${mins} min` : `${mins / 60} hr ${mins % 60 ? `${mins % 60} min` : ""}`;
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>{startFormatted} – {endFormatted}</strong>
                  <button type="button" onClick={() => setSelectedWeekStartKey(null)} style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>Close</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total students</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{numStudents}</div>
                  </div>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total hours</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                  </div>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total earnings</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(totalEarned)}</div>
                  </div>
                </div>
                <div className="card">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Student</th>
                        <th style={{ padding: "10px 12px" }}>Duration</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekLessons.map((l) => {
                        const student = data.students.find((s) => s.id === l.studentId);
                        return (
                          <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "10px 12px" }}>{student ? `${student.firstName} ${student.lastName}` : "—"}</td>
                            <td style={{ padding: "10px 12px" }}>{formatDuration(l.durationMinutes)}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{formatCurrency(l.amountCents)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {activeTab === "Monthly" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => { setMonthlyYearOffset((o) => o - 1); setSelectedMonthKey(null); }}
              style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
              aria-label="Previous year"
            >
              ‹
            </button>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {monthlyTitle}
            </div>
            <button
              type="button"
              onClick={() => { setMonthlyYearOffset((o) => o + 1); setSelectedMonthKey(null); }}
              style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
              aria-label="Next year"
            >
              ›
            </button>
          </div>
          {monthsToShow > 0 && (
            <>
              <div className="card" style={{ marginBottom: 24 }}>
                <BarChart
                  data={visibleMonthlyTotals}
                  xLabels={visibleMonthLabels}
                  maxVal={maxMonthly}
                  dateKeys={visibleMonthLabels.map((_, i) => `${displayYear}-${String(i + 1).padStart(2, "0")}`)}
                  onBarClick={(key) => setSelectedMonthKey((prev) => (prev === key ? null : key))}
                />
              </div>
              <div className="card" style={{ marginBottom: 24 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "10px 12px" }}>Month</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Hours</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Total earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMonthLabels.map((label, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px" }}>{label}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{visibleMonthlyHours[i] % 1 === 0 ? visibleMonthlyHours[i] : visibleMonthlyHours[i].toFixed(1)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{formatCurrency(visibleMonthlyTotals[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {monthsToShow === 0 && (
            <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No months to show for this year yet.</div>
          )}
          {selectedMonthKey && (() => {
            const monthLessons = completedLessons.filter((l) => l.date.startsWith(selectedMonthKey!));
            const byStudent = new Map<string, { minutes: number; cents: number }>();
            for (const l of monthLessons) {
              const cur = byStudent.get(l.studentId) ?? { minutes: 0, cents: 0 };
              byStudent.set(l.studentId, { minutes: cur.minutes + l.durationMinutes, cents: cur.cents + l.amountCents });
            }
            const numStudents = byStudent.size;
            const totalMinutes = monthLessons.reduce((s, l) => s + l.durationMinutes, 0);
            const totalHours = totalMinutes / 60;
            const totalEarned = monthLessons.reduce((s, l) => s + l.amountCents, 0);
            const [y, m] = selectedMonthKey.split("-").map(Number);
            const monthFormatted = new Date(y, m - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
            const formatHours = (mins: number) => {
              const h = mins / 60;
              return h % 1 === 0 ? h : h.toFixed(1);
            };
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>{monthFormatted}</strong>
                  <button type="button" onClick={() => setSelectedMonthKey(null)} style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>Close</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total students</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{numStudents}</div>
                  </div>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total hours</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                  </div>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total earnings</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(totalEarned)}</div>
                  </div>
                </div>
                <div className="card">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Student</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Hours</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Total earnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(byStudent.entries()).map(([studentId, { minutes, cents }]) => {
                        const student = data.students.find((s) => s.id === studentId);
                        return (
                          <tr key={studentId} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "10px 12px" }}>{student ? `${student.firstName} ${student.lastName}` : "—"}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right" }}>{formatHours(minutes)}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{formatCurrency(cents)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {activeTab === "Daily" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setDailyWeekOffset((o) => o - 1)}
              style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
              aria-label="Previous week"
            >
              ‹
            </button>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {dailyRangeStart} – {dailyRangeEnd}: {formatCurrency(dailyWeekTotal)}
            </div>
            <button
              type="button"
              onClick={() => setDailyWeekOffset((o) => o + 1)}
              style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 18 }}
              aria-label="Next week"
            >
              ›
            </button>
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            <BarChart
              data={dailyData.map((d) => d.total)}
              xLabels={dailyData.map((d) => d.label)}
              xSubLabels={dailyData.map((d) => d.dayOfWeek)}
              maxVal={maxDaily}
              dateKeys={dailyData.map((d) => d.dateKey)}
              onBarClick={(dateKey) => setSelectedDayDateKey((prev) => (prev === dateKey ? null : dateKey))}
            />
          </div>
          {selectedDayDateKey && (() => {
            const dayLessons = completedLessons.filter((l) => l.date === selectedDayDateKey);
            const numStudents = dayLessons.length;
            const totalMinutes = dayLessons.reduce((s, l) => s + l.durationMinutes, 0);
            const totalHours = totalMinutes / 60;
            const totalEarned = dayLessons.reduce((s, l) => s + l.amountCents, 0);
            const dateStr = selectedDayDateKey;
            const [y, m, d] = dateStr.split("-").map(Number);
            const dateFormatted = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
            const formatDuration = (mins: number) => mins === 60 ? "1 hour" : mins < 60 ? `${mins} min` : `${mins / 60} hr ${mins % 60 ? `${mins % 60} min` : ""}`;
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>{dateFormatted}</strong>
                  <button type="button" onClick={() => setSelectedDayDateKey(null)} style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>Close</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total students</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{numStudents}</div>
                  </div>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total hours</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                  </div>
                  <div className="card" style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Total earnings</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(totalEarned)}</div>
                  </div>
                </div>
                <div className="card">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Student</th>
                        <th style={{ padding: "10px 12px" }}>Duration</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayLessons.map((l) => {
                        const student = data.students.find((s) => s.id === l.studentId);
                        return (
                          <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "10px 12px" }}>{student ? `${student.firstName} ${student.lastName}` : "—"}</td>
                            <td style={{ padding: "10px 12px" }}>{formatDuration(l.durationMinutes)}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{formatCurrency(l.amountCents)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {activeTab === "Students" && (
        <div className="card">
          {data.students.map((s) => {
            const total = completedLessons.filter((l) => l.studentId === s.id).reduce((a, l) => a + l.amountCents, 0);
            return (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{s.firstName} {s.lastName}</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(total)}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
