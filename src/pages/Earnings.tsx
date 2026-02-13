import { useState, useCallback } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  formatCurrency,
  dedupeLessons,
  filterLessonsOnScheduledDay,
  getMonthBounds,
  toDateKey,
  getWeeksInMonth,
  getDailyTotalsForWeek,
  getYAxisTicks,
} from "@/utils/earnings";
import type { Lesson } from "@/types";

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
  noEarningsText = "No earnings",
}: {
  data: number[];
  xLabels: string[];
  xSubLabels?: string[];
  maxVal: number;
  dateKeys?: string[];
  onBarClick?: (dateKey: string) => void;
  angleXLabels?: boolean;
  noEarningsText?: string;
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
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{noEarningsText}</span>
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

const TAB_KEYS: Record<(typeof TABS)[number], string> = {
  Daily: "earnings.daily",
  Weekly: "earnings.weekly",
  Monthly: "earnings.monthly",
  Students: "earnings.studentsTab",
};

export default function Earnings() {
  const { data } = useStoreContext();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Daily");
  const [dailyWeekOffset, setDailyWeekOffset] = useState(0);
  const [selectedDayDateKey, setSelectedDayDateKey] = useState<string | null>(null);
  const [selectedWeekStartKey, setSelectedWeekStartKey] = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [weeklyMonthOffset, setWeeklyMonthOffset] = useState(0);
  const [monthlyYearOffset, setMonthlyYearOffset] = useState(0);
  const [studentsYearOffset, setStudentsYearOffset] = useState(0);
  const [studentsSearch, setStudentsSearch] = useState("");
  const [studentsSort, setStudentsSort] = useState<"az" | "za" | "high" | "low">("az");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [dlYear, setDlYear] = useState(0); // 0 = unset; will init on open
  const [dlFormat, setDlFormat] = useState<"csv" | "pdf">("csv");
  const [dlDelivery, setDlDelivery] = useState<"device" | "email">("device");
  const now = new Date();
  // Earnings only count completed lessons on each student's scheduled day (avoids wrong-day and double-count).
  const completedLessons = filterLessonsOnScheduledDay(
    dedupeLessons(data.lessons.filter((l) => l.completed)),
    data.students
  );
  const thisYear = now.getFullYear();
  const studentsDisplayYear = thisYear + studentsYearOffset;
  const todayKey = toDateKey(now);
  const lessonsForStudentsYear =
    studentsDisplayYear === thisYear
      ? completedLessons.filter((l) => l.date >= `${studentsDisplayYear}-01-01` && l.date <= todayKey)
      : completedLessons.filter((l) => l.date.startsWith(String(studentsDisplayYear)));

  const weeklyMonthDate = new Date(now.getFullYear(), now.getMonth() + weeklyMonthOffset, 1);
  const weeklyYear = weeklyMonthDate.getFullYear();
  const weeklyMonth = weeklyMonthDate.getMonth();
  const weeklyData = getWeeksInMonth(completedLessons, weeklyYear, weeklyMonth);
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

  // ── Download helpers ──────────────────────────────────────────────
  const yearsWithData = [...new Set(completedLessons.map((l) => parseInt(l.date.substring(0, 4))))].sort((a, b) => b - a);
  if (yearsWithData.length === 0) yearsWithData.push(thisYear);
  if (!yearsWithData.includes(thisYear)) yearsWithData.unshift(thisYear);

  const openDownloadModal = useCallback(() => {
    setDlYear(thisYear);
    setDlFormat("csv");
    setDlDelivery("device");
    setDownloadOpen(true);
  }, [thisYear]);

  function buildLessonsForYear(year: number): Lesson[] {
    return completedLessons
      .filter((l) => l.date.startsWith(String(year)))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function generateCSV(year: number): string {
    const yearLessons = buildLessonsForYear(year);
    const rows: string[][] = [["Date", "Student", "Duration (min)", "Amount ($)"]];
    for (const l of yearLessons) {
      const s = data.students.find((st) => st.id === l.studentId);
      const name = s ? `${s.firstName} ${s.lastName}` : "Unknown";
      rows.push([l.date, name, String(l.durationMinutes), (l.amountCents / 100).toFixed(2)]);
    }
    const totalAmount = yearLessons.reduce((s, l) => s + l.amountCents, 0);
    const totalMinutes = yearLessons.reduce((s, l) => s + l.durationMinutes, 0);
    rows.push([]);
    rows.push(["Summary"]);
    rows.push(["Total Lessons", String(yearLessons.length)]);
    rows.push(["Total Hours", (totalMinutes / 60).toFixed(1)]);
    rows.push(["Total Earnings", `$${(totalAmount / 100).toFixed(2)}`]);
    return rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  }

  function generatePDFWindow(year: number) {
    const yearLessons = buildLessonsForYear(year);
    const totalAmount = yearLessons.reduce((s, l) => s + l.amountCents, 0);
    const totalMinutes = yearLessons.reduce((s, l) => s + l.durationMinutes, 0);
    // group by month
    const months = new Map<string, Lesson[]>();
    for (const l of yearLessons) {
      const mk = l.date.substring(0, 7);
      const arr = months.get(mk) ?? [];
      arr.push(l);
      months.set(mk, arr);
    }
    let tableRows = "";
    for (const [mk, lessons] of months) {
      const [y2, m2] = mk.split("-").map(Number);
      const monthName = new Date(y2, m2 - 1).toLocaleDateString("en-US", { month: "long" });
      const mTotal = lessons.reduce((s, l) => s + l.amountCents, 0);
      const mMin = lessons.reduce((s, l) => s + l.durationMinutes, 0);
      tableRows += `<tr style="background:#f5f5f5;font-weight:600"><td colspan="2">${monthName}</td><td>${(mMin / 60).toFixed(1)} hrs</td><td style="text-align:right">${formatCurrency(mTotal)}</td></tr>`;
      for (const l of lessons) {
        const st = data.students.find((ss) => ss.id === l.studentId);
        const nm = st ? `${st.firstName} ${st.lastName}` : "Unknown";
        tableRows += `<tr><td>${l.date}</td><td>${nm}</td><td>${l.durationMinutes} min</td><td style="text-align:right">${formatCurrency(l.amountCents)}</td></tr>`;
      }
    }
    const html = `<!DOCTYPE html><html><head><title>Earnings Report ${year}</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;max-width:800px;margin:0 auto}
h1{font-size:24px;margin-bottom:4px}
.summary{display:flex;gap:32px;margin:16px 0 24px}
.summary .lb{font-size:12px;color:#888}
.summary .vl{font-size:20px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left}
th{font-size:12px;text-transform:uppercase;color:#888;border-bottom:2px solid #ddd}
.ft{margin-top:24px;font-size:12px;color:#888}
@media print{body{padding:20px}}
</style></head><body>
<h1>Earnings Report &#8212; ${year}</h1>
<div class="summary">
<div><div class="lb">Total Lessons</div><div class="vl">${yearLessons.length}</div></div>
<div><div class="lb">Total Hours</div><div class="vl">${(totalMinutes / 60).toFixed(1)}</div></div>
<div><div class="lb">Total Earnings</div><div class="vl">${formatCurrency(totalAmount)}</div></div>
</div>
<table><thead><tr><th>Date</th><th>Student</th><th>Duration</th><th style="text-align:right">Amount</th></tr></thead><tbody>${tableRows}</tbody></table>
<div class="ft">Generated on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  function handleDownload() {
    if (dlFormat === "csv") {
      const csv = generateCSV(dlYear);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `earnings-${dlYear}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      generatePDFWindow(dlYear);
    }
    if (dlDelivery === "email" && data.user?.email) {
      const subject = encodeURIComponent(`Earnings Report ${dlYear}`);
      const body = encodeURIComponent(`Here is my earnings report for ${dlYear}.\n\nPlease see the attached file.`);
      setTimeout(() => {
        window.open(`mailto:${data.user!.email}?subject=${subject}&body=${body}`, "_self");
      }, dlFormat === "pdf" ? 600 : 100);
    }
    setDownloadOpen(false);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0 }}>{t("earnings.title")}</h1>
        <button
          type="button"
          onClick={openDownloadModal}
          aria-label="Download earnings"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      {/* Download modal overlay */}
      {downloadOpen && (
        <div
          onClick={() => setDownloadOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--card, #fff)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, fontFamily: "var(--font-sans)" }}>Download Earnings</h2>
              <button
                type="button"
                onClick={() => setDownloadOpen(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text)", lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            {/* Year */}
            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Year</span>
              <select
                value={dlYear}
                onChange={(e) => setDlYear(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", fontSize: 15, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", fontFamily: "var(--font-sans)", color: "var(--text)" }}
              >
                {yearsWithData.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>

            {/* Format */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Format</span>
              <div style={{ display: "flex", gap: 8 }}>
                {(["csv", "pdf"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setDlFormat(fmt)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      fontSize: 15,
                      fontWeight: 600,
                      fontFamily: "var(--font-sans)",
                      borderRadius: 10,
                      border: dlFormat === fmt ? "2px solid var(--text)" : "1px solid var(--border)",
                      background: dlFormat === fmt ? "var(--text)" : "var(--card)",
                      color: dlFormat === fmt ? "var(--card, #fff)" : "var(--text)",
                      cursor: "pointer",
                      textTransform: "uppercase",
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Delivery */}
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Deliver to</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setDlDelivery("device")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    fontSize: 15,
                    fontFamily: "var(--font-sans)",
                    borderRadius: 10,
                    border: dlDelivery === "device" ? "2px solid var(--text)" : "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--text)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download to device
                </button>
                <button
                  type="button"
                  onClick={() => setDlDelivery("email")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    fontSize: 15,
                    fontFamily: "var(--font-sans)",
                    borderRadius: 10,
                    border: dlDelivery === "email" ? "2px solid var(--text)" : "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--text)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
                  </svg>
                  Email to {data.user?.email ? data.user.email : "profile"}
                </button>
              </div>
            </div>

            {/* Action button */}
            <button
              type="button"
              onClick={handleDownload}
              style={{
                width: "100%",
                padding: "12px 0",
                fontSize: 16,
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                borderRadius: 12,
                border: "none",
                background: "var(--text)",
                color: "var(--card, #fff)",
                cursor: "pointer",
              }}
            >
              {dlDelivery === "email" ? "Download & Open Email" : "Download"}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "nowrap", gap: 8, marginBottom: 20 }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? "pill pill--active" : "pill"}
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
            {t(TAB_KEYS[tab])}
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
                noEarningsText={t("earnings.noEarnings")}
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
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.studentsTab")}</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{numStudents}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Hours</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.earningsYear")}</div>
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
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 16 }}>{t("earnings.overview")}</div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                {displayYear === thisYear ? t("earnings.earningsYTD") : `${t("earnings.earningsYear")} ${displayYear}`}
              </div>
              <div className="headline-serif" style={{ fontSize: 22, fontWeight: 400 }}>
                {formatCurrency(displayYear === thisYear ? earningsYTD : earningsForDisplayYear)}
              </div>
            </div>
          </div>
          {monthsToShow > 0 && (
            <>
              <div className="float-card" style={{ marginBottom: 24 }}>
                <BarChart
                  data={visibleMonthlyTotals}
                  xLabels={visibleMonthLabels}
                  maxVal={maxMonthly}
                  noEarningsText={t("earnings.noEarnings")}
                  dateKeys={visibleMonthLabels.map((_, i) => `${displayYear}-${String(i + 1).padStart(2, "0")}`)}
                  onBarClick={(key) => setSelectedMonthKey((prev) => (prev === key ? null : key))}
                />
              </div>
              <div className="float-card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
                {visibleMonthLabels.map((label, i) => {
                  const monthKey = `${displayYear}-${String(i + 1).padStart(2, "0")}`;
                  const isSelected = selectedMonthKey === monthKey;
                  return (
                    <div
                      key={i}
                      role="button"
                      onClick={() => setSelectedMonthKey((prev) => (prev === monthKey ? null : monthKey))}
                      className="card-list-item"
                      style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "center", paddingLeft: 20, paddingRight: 20, cursor: "pointer", background: isSelected ? "var(--bg-hover, rgba(0,0,0,0.03))" : undefined }}
                    >
                      <span>{label}</span>
                      <span style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>{visibleMonthlyHours[i] % 1 === 0 ? visibleMonthlyHours[i] : visibleMonthlyHours[i].toFixed(1)} hrs</span>
                      <span style={{ fontWeight: 600, textAlign: "right" }}>{formatCurrency(visibleMonthlyTotals[i])}</span>
                    </div>
                  );
                })}
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
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.studentsTab")}</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{numStudents}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Hours</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.earningsYear")}</div>
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
            <div className="hero-card" style={{ flex: "0 0 auto", width: "fit-content", padding: "12px 16px" }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>{dailyRangeStart}–{dailyRangeEnd} week total</div>
              <div className="headline-serif" style={{ fontSize: 26, fontWeight: 400 }}>{formatCurrency(dailyWeekTotal)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, paddingBottom: 2 }}>
              <button type="button" onClick={() => setDailyWeekOffset((o) => o - 1)} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Previous week">‹</button>
              <span style={{ fontSize: 15, color: "var(--text-muted)" }}>{dailyRangeStart}–{dailyRangeEnd}</span>
              <button type="button" onClick={() => setDailyWeekOffset((o) => o + 1)} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Next week">›</button>
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
              noEarningsText={t("earnings.noEarnings")}
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
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.studentsTab")}</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{numStudents}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Hours</div>
                      <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.earningsYear")}</div>
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

      {activeTab === "Students" && (() => {
        const studentTotals = data.students.map((s) => ({
          student: s,
          total: lessonsForStudentsYear.filter((l) => l.studentId === s.id).reduce((a, l) => a + l.amountCents, 0),
        }));
        const q = studentsSearch.trim().toLowerCase();
        const filtered = q
          ? studentTotals.filter(({ student: s }) =>
              `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
            )
          : studentTotals;
        const sorted = [...filtered].sort((a, b) => {
          switch (studentsSort) {
            case "az":
              return a.student.lastName.localeCompare(b.student.lastName) || a.student.firstName.localeCompare(b.student.firstName);
            case "za":
              return b.student.lastName.localeCompare(a.student.lastName) || b.student.firstName.localeCompare(a.student.firstName);
            case "high":
              return b.total - a.total;
            case "low":
              return a.total - b.total;
            default:
              return 0;
          }
        });
        return (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setStudentsYearOffset((o) => o - 1)} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Previous year">&#8249;</button>
              <h2 className="headline-serif" style={{ fontSize: 20, fontWeight: 400, margin: 0 }}>
                {studentsDisplayYear} earnings{studentsDisplayYear === thisYear ? " YTD" : ""}
              </h2>
              <button type="button" onClick={() => setStudentsYearOffset((o) => o + 1)} className="pill" style={{ minWidth: 40, minHeight: 40, padding: 8 }} aria-label="Next year">&#8250;</button>
            </div>
            {/* Search + Sort on one line */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search..."
                  value={studentsSearch}
                  onChange={(e) => setStudentsSearch(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px 8px 32px", fontSize: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", fontFamily: "var(--font-sans)" }}
                />
              </div>
              <select
                value={studentsSort}
                onChange={(e) => setStudentsSort(e.target.value as "az" | "za" | "high" | "low")}
                style={{ padding: "8px 8px", fontSize: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", fontFamily: "var(--font-sans)", color: "var(--text)", cursor: "pointer", flexShrink: 0, WebkitAppearance: "none", MozAppearance: "none", appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: 24 }}
              >
                <option value="az">A–Z</option>
                <option value="za">Z–A</option>
                <option value="high">High–Low</option>
                <option value="low">Low–High</option>
              </select>
            </div>
            <div className="float-card" style={{ padding: 0, overflow: "hidden" }}>
              {sorted.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No students found</div>
              )}
              {sorted.map(({ student: s, total }) => (
                <div key={s.id} className="card-list-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 20, paddingRight: 20 }}>
                  <span>{s.firstName} {s.lastName}</span>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(total)}</span>
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </>
  );
}
