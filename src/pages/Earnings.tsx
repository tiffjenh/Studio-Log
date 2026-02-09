import { useState } from "react";
import { useStoreContext } from "@/context/StoreContext";
import {
  formatCurrency,
  getMonthBounds,
  toDateKey,
  earnedThisWeek,
  getWeeklyTotals,
  getDailyTotals,
  getYAxisTicks,
} from "@/utils/earnings";

const TABS = ["Weekly", "Monthly", "Daily", "Students"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_HEIGHT = 160;

function BarChart({
  data,
  xLabels,
  xSubLabels,
  maxVal,
}: {
  data: number[];
  xLabels: string[];
  xSubLabels?: string[];
  maxVal: number;
}) {
  const ticks = getYAxisTicks(maxVal);
  const topTick = Math.max(...ticks, 10000);
  const showSubLabels = xSubLabels && xSubLabels.length === data.length;

  return (
    <div style={{ display: "flex", gap: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: 8, minWidth: 40, fontSize: 11, color: "var(--text-muted)", textAlign: "right", height: CHART_HEIGHT + 56 }}>
        {[...ticks].reverse().map((t) => (
          <span key={t}>{formatCurrency(t)}</span>
        ))}
        <span>{formatCurrency(0)}</span>
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        {/* Chart area with gridlines - $0 baseline at bottom */}
        <div style={{ position: "relative", height: CHART_HEIGHT, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
          {ticks.slice(1).map((t) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: `${(t / topTick) * 100}%`,
                height: 1,
                background: "var(--border)",
              }}
            />
          ))}
          {/* Bars anchored to bottom */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-around", gap: 4, alignItems: "flex-end", height: CHART_HEIGHT, padding: "0 4px" }}>
            {data.map((v, i) => {
              const heightPct = topTick > 0 ? (v / topTick) * 100 : 0;
              const barHeight = Math.max(v > 0 ? 6 : 0, (heightPct / 100) * CHART_HEIGHT);
              return (
                <div
                  key={i}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", maxWidth: 40, cursor: "default" }}
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
        {/* X-axis: dates + day of week */}
        <div style={{ display: "flex", justifyContent: "space-around", fontSize: 11, color: "var(--text-muted)" }}>
          {xLabels.map((l, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", maxWidth: 40 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Weekly");
  const now = new Date();
  const completedLessons = data.lessons.filter((l) => l.completed);
  const thisYear = now.getFullYear();

  const monthlyTotals: number[] = [];
  for (let m = 0; m < 12; m++) {
    const { start, end } = getMonthBounds(new Date(thisYear, m));
    const total = completedLessons
      .filter((l) => l.date >= toDateKey(start) && l.date <= toDateKey(end))
      .reduce((s, l) => s + l.amountCents, 0);
    monthlyTotals.push(total);
  }

  const weeklyData = getWeeklyTotals(data.lessons, 6, now);
  const dailyData = getDailyTotals(data.lessons, 14, now);

  const maxMonthly = Math.max(...monthlyTotals, 1);
  const maxWeekly = Math.max(...weeklyData.map((w) => w.total), 1);
  const maxDaily = Math.max(...dailyData.map((d) => d.total), 1);

  const monthEarnings = monthlyTotals[now.getMonth()];
  const ytdEarnings = monthlyTotals.reduce((a, b) => a + b, 0);
  const weekEarned = earnedThisWeek(data.lessons, now);
  const monthName = now.toLocaleString("en-US", { month: "long" });

  const lastYear = now.getFullYear() - 1;
  const lastYearTotal = completedLessons
    .filter((l) => l.date >= `${lastYear}-01-01` && l.date <= `${lastYear}-12-31`)
    .reduce((s, l) => s + l.amountCents, 0);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>✓</span>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Earnings</h1>
      </div>
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
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>{formatCurrency(weekEarned)} (this week)</div>
          <div className="card" style={{ marginBottom: 24 }}>
            <BarChart
              data={weeklyData.map((w) => w.total)}
              xLabels={weeklyData.map((w) => w.label)}
              xSubLabels={weeklyData.map((w) => w.dayOfWeek)}
              maxVal={maxWeekly}
            />
          </div>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span>★ {monthName} Earnings</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(monthEarnings)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span>📅 YTD Earnings</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(ytdEarnings)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
              <span>Last year</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(lastYearTotal)}</span>
            </div>
          </div>
        </>
      )}

      {activeTab === "Monthly" && (
        <>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>{formatCurrency(monthEarnings)} (this month)</div>
          <div className="card" style={{ marginBottom: 24 }}>
            <BarChart
              data={monthlyTotals}
              xLabels={MONTH_LABELS}
              maxVal={maxMonthly}
            />
          </div>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
              <span>YTD Earnings</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(ytdEarnings)}</span>
            </div>
          </div>
        </>
      )}

      {activeTab === "Daily" && (
        <>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>{formatCurrency(weekEarned)} (this week)</div>
          <div className="card" style={{ marginBottom: 24 }}>
            <BarChart
              data={dailyData.map((d) => d.total)}
              xLabels={dailyData.map((d) => d.label)}
              xSubLabels={dailyData.map((d) => d.dayOfWeek)}
              maxVal={maxDaily}
            />
          </div>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
              <span>YTD Earnings</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(ytdEarnings)}</span>
            </div>
          </div>
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
