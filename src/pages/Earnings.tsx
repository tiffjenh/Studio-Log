import { useState } from "react";
import { useStoreContext } from "@/context/StoreContext";
import {
  formatCurrency,
  dedupeLessons,
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
  angleXLabels = false,
}: {
  data: number[];
  xLabels: string[];
  xSubLabels?: string[];
  maxVal: number;
  dateKeys?: string[];
  onBarClick?: (dateKey: string) => void;
  angleXLabels?: boolean;
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
                      background: "var(--avatar-gradient)",
                      borderRadius: 6,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            gap: angleXLabels ? 4 : 0,
            padding: angleXLabels ? "20px 4px 20px" : "8px 4px 0",
            fontSize: 11,
            color: "var(--text-muted)",
            minHeight: angleXLabels ? 52 : undefined,
          }}
        >
          {xLabels.map((l, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                minWidth: 0,
                maxWidth: angleXLabels ? 40 : 56,
              }}
            >
              <div
                style={
                  angleXLabels
                    ? {
                        whiteSpace: "nowrap",
                        transform: "rotate(-45deg)",
                        transformOrigin: "center top",
                        marginTop: 4,
                      }
                    : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                }
              >
                {l}
                {showSubLabels && xSubLabels?.[i] && (
                  <>{angleXLabels ? <><br /><span style={{ fontSize: 10, opacity: 0.85 }}>{xSubLabels[i]}</span></> : <div style={{ fontSize: 10, opacity: 0.85 }}>{xSubLabels[i]}</div>}</>
                )}
              </div>
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
  const completedLessons = dedupeLessons(data.lessons.filter((l) => l.completed));
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
  const monthlyTitle = String(displayYear);
  const earningsForDisplayYear = completedLessons
    .filter((l) => l.date.startsWith(String(displayYear)))
    .reduce((s, l) => s + l.amountCents, 0);
  const earningsYTD =
    displayYear === thisYear
      ? completedLessons
          .filter((l) => l.date >= `${thisYear}-01-01` && l.date <= toDateKey(now))
          .reduce((s, l) => s + l.amountCents, 0)
      : 0;

  const dailyData = getDailyTotalsForWeek(completedLessons, now, dailyWeekOffset);
  const dailyWeekTotal = dailyData.reduce((s, d) => s + d.total, 0);
  const dailyRangeStart = dailyData[0]?.label ?? "";
  const dailyRangeEnd = dailyData[6]?.label ?? "";

  const maxMonthly = Math.max(...visibleMonthlyTotals, 1);
  const maxWeekly = Math.max(...weeklyData.map((w) => w.total), 1);
  const maxDaily = Math.max(...dailyData.map((d) => d.total), 1);

  return (
    <>
      <h1 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, marginBottom: 20 }}>Earnings</h1>
      <div style={{ display: "flex", flexWrap: "nowrap", gap: 8, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={activeTab === t ? "pill pill--active" : "pill"}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              textAlign: "center",
              fontFamily: "var(--font-sans)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Weekly" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button type="button" onClick={() => { setWeeklyMonthOffset((o) => o - 1); setSelectedWeekStartKey(null); }} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Previous month">‹</button>
            <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{weeklyMonthTitle}</div>
            <button type="button" onClick={() => { setWeeklyMonthOffset((o) => o + 1); setSelectedWeekStartKey(null); }} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Next month">›</button>
          </div>
          <div className="float-card" style={{ marginBottom: 24 }}>
            {weeklyData.length > 0 ? (
              <BarChart
                data={weeklyData.map((w) => w.total)}
                xLabels={weeklyData.map((w) => w.label)}
                maxVal={maxWeekly}
                dateKeys={weeklyData.map((w) => w.startKey)}
                onBarClick={(key) => setSelectedWeekStartKey((prev) => (prev === key ? null : key))}
                angleXLabels
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
                  <button type="button" onClick={() => setSelectedWeekStartKey(null)} style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", background: "none", border: "none", cursor: "pointer" }}>Close</button>
                </div>
                <div className="float-card" style={{ marginBottom: 16, padding: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, textAlign: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Students</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{numStudents}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Hours</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Earnings</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{formatCurrency(totalEarned)}</div>
                    </div>
                  </div>
                </div>
                <div className="float-card" style={{ padding: 0, overflow: "hidden" }}>
                  {weekLessons.map((l) => {
                    const student = data.students.find((s) => s.id === l.studentId);
                    return (
                      <div key={l.id} className="card-list-item" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "center", paddingLeft: 20, paddingRight: 20 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)" }}>{student ? `${student.firstName} ${student.lastName}` : "—"}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", textAlign: "center" }}>{formatDuration(l.durationMinutes)}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", textAlign: "right" }}>{formatCurrency(l.amountCents)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {activeTab === "Monthly" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button type="button" onClick={() => { setMonthlyYearOffset((o) => o - 1); setSelectedMonthKey(null); }} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Previous year">‹</button>
            <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{monthlyTitle}</div>
            <button type="button" onClick={() => { setMonthlyYearOffset((o) => o + 1); setSelectedMonthKey(null); }} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Next year">›</button>
          </div>
          <div className="hero-card" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 16 }}>Earnings overview</div>
            <div style={{ display: "grid", gridTemplateColumns: displayYear === thisYear ? "1fr 1fr" : "1fr", gap: 20 }}>
              {displayYear === thisYear && (
                <>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Earnings – YTD</div>
                    <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earningsYTD)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Earnings {displayYear}</div>
                    <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earningsForDisplayYear)}</div>
                  </div>
                </>
              )}
              {displayYear !== thisYear && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Earnings {displayYear}</div>
                  <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>{formatCurrency(earningsForDisplayYear)}</div>
                </div>
              )}
            </div>
          </div>
          {monthsToShow > 0 && (
            <>
              <div className="float-card" style={{ marginBottom: 24 }}>
                <BarChart
                  data={visibleMonthlyTotals}
                  xLabels={visibleMonthLabels}
                  maxVal={maxMonthly}
                  dateKeys={visibleMonthLabels.map((_, i) => `${displayYear}-${String(i + 1).padStart(2, "0")}`)}
                  onBarClick={(key) => setSelectedMonthKey((prev) => (prev === key ? null : key))}
                />
              </div>
              <div className="float-card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
                {visibleMonthLabels.map((label, i) => (
                  <div key={i} className="card-list-item" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "center", paddingLeft: 20, paddingRight: 20 }}>
                    <span>{label}</span>
                    <span style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>{visibleMonthlyHours[i] % 1 === 0 ? visibleMonthlyHours[i] : visibleMonthlyHours[i].toFixed(1)} hrs</span>
                    <span style={{ fontWeight: 600, textAlign: "right" }}>{formatCurrency(visibleMonthlyTotals[i])}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {monthsToShow === 0 && (
            <div className="float-card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>No months to show for this year yet.</div>
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
                  <button type="button" onClick={() => setSelectedMonthKey(null)} style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", background: "none", border: "none", cursor: "pointer" }}>Close</button>
                </div>
                <div className="float-card" style={{ marginBottom: 16, padding: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, textAlign: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Students</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{numStudents}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Hours</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Earnings</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{formatCurrency(totalEarned)}</div>
                    </div>
                  </div>
                </div>
                <div className="float-card" style={{ padding: 0, overflow: "hidden" }}>
                  {Array.from(byStudent.entries()).map(([studentId, { minutes, cents }]) => {
                    const student = data.students.find((s) => s.id === studentId);
                    return (
                      <div key={studentId} className="card-list-item" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "center", paddingLeft: 20, paddingRight: 20 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)" }}>{student ? `${student.firstName} ${student.lastName}` : "—"}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", textAlign: "center" }}>{formatHours(minutes)} hrs</span>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", textAlign: "right" }}>{formatCurrency(cents)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {activeTab === "Daily" && (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, paddingBottom: 2 }}>
              <button type="button" onClick={() => setDailyWeekOffset((o) => o - 1)} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Previous week">‹</button>
              <span style={{ fontSize: 15, color: "var(--text-muted)" }}>{dailyRangeStart}–{dailyRangeEnd}</span>
              <button type="button" onClick={() => setDailyWeekOffset((o) => o + 1)} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Next week">›</button>
            </div>
            <div className="hero-card" style={{ flex: "0 0 auto", width: "fit-content", padding: "12px 16px", marginLeft: "auto" }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>{dailyRangeStart}–{dailyRangeEnd} week total</div>
              <div className="headline-serif" style={{ fontSize: 26, fontWeight: 400 }}>{formatCurrency(dailyWeekTotal)}</div>
            </div>
          </div>
          <div className="float-card" style={{ marginBottom: 24 }}>
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
                  <button type="button" onClick={() => setSelectedDayDateKey(null)} style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", background: "none", border: "none", cursor: "pointer" }}>Close</button>
                </div>
                <div className="float-card" style={{ marginBottom: 16, padding: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, textAlign: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Students</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{numStudents}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Hours</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Earnings</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{formatCurrency(totalEarned)}</div>
                    </div>
                  </div>
                </div>
                <div className="float-card" style={{ padding: 0, overflow: "hidden" }}>
                  {dayLessons.map((l) => {
                    const student = data.students.find((s) => s.id === l.studentId);
                    return (
                      <div key={l.id} className="card-list-item" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "center", paddingLeft: 20, paddingRight: 20 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)" }}>{student ? `${student.firstName} ${student.lastName}` : "—"}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", textAlign: "center" }}>{formatDuration(l.durationMinutes)}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)", textAlign: "right" }}>{formatCurrency(l.amountCents)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {activeTab === "Students" && (
        <div className="float-card" style={{ padding: 0, overflow: "hidden" }}>
          {data.students.map((s) => {
            const total = completedLessons.filter((l) => l.studentId === s.id).reduce((a, l) => a + l.amountCents, 0);
            return (
              <div key={s.id} className="card-list-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 20, paddingRight: 20 }}>
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
