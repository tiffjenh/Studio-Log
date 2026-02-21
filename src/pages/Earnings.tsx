import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  formatCurrency,
  formatCurrencyWithCommas,
  dedupeLessons,
  getMonthBounds,
  toDateKey,
  getWeeksInMonth,
  getDailyTotalsForWeek,
  getYAxisTicks,
  isStudentActive,
  isStudentHistorical,
} from "@/utils/earnings";
import type { Lesson } from "@/types";
import { Button, IconButton } from "@/components/ui/Button";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, TrendDownIcon, TrendUpIcon } from "@/components/ui/Icons";

const TABS = ["Daily", "Weekly", "Monthly", "Yearly", "Students"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_HEIGHT = 160;
const EMPTY_TICKS = [0, 5000, 10000, 15000, 20000];

/** Format for bar value labels: no cents, with commas (e.g. $3,180). */
function formatBarLabel(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

/** Compact format for bar labels to avoid overlap (e.g. $3.1K, $3.4K). */
function formatBarLabelCompact(cents: number): string {
  const d = cents / 100;
  if (d >= 1000) {
    const k = d / 1000;
    const s = k % 1 === 0 ? `${k}K` : k.toFixed(1).replace(/\.0$/, "") + "K";
    return "$" + s;
  }
  if (d >= 1) return "$" + Math.round(d);
  return d > 0 ? "$" + d.toFixed(0) : "$0";
}

function BarChart({
  data,
  xLabels,
  xSubLabels,
  maxVal,
  dateKeys,
  onBarClick,
  angleXLabels = false,
  noEarningsText = "No earnings",
  yAxisStepCents,
  maxBarWidth = 40,
  barWidthPct = 75,
  whitePlotBackground = false,
  staggerValueLabels = false,
  compactBarLabels = false,
}: {
  data: number[];
  xLabels: string[];
  xSubLabels?: string[];
  maxVal: number;
  dateKeys?: string[];
  onBarClick?: (dateKey: string) => void;
  angleXLabels?: boolean;
  noEarningsText?: string;
  /** When set, Y-axis uses this step in cents (e.g. 500000 = $5000). Used for yearly graph. */
  yAxisStepCents?: number;
  /** Max width per bar in px (e.g. 22 for 12 skinny bars). */
  maxBarWidth?: number;
  /** Bar width as % of slot (e.g. 50 for skinny). */
  barWidthPct?: number;
  /** White plot area (e.g. for Monthly chart). */
  whitePlotBackground?: boolean;
  /** Stagger value labels above bars to avoid overlap (e.g. for Monthly). */
  staggerValueLabels?: boolean;
  /** Use short labels like $3.1K to fit above bars (e.g. for Monthly). */
  compactBarLabels?: boolean;
}) {
  const isEmpty = maxVal <= 0 || data.every((v) => v === 0);
  const ticks = isEmpty
    ? EMPTY_TICKS
    : yAxisStepCents != null
      ? (() => {
          const out: number[] = [0];
          for (let v = yAxisStepCents; v <= Math.max(maxVal, yAxisStepCents); v += yAxisStepCents) out.push(v);
          if (out[out.length - 1]! < maxVal) out.push(Math.ceil(maxVal / yAxisStepCents) * yAxisStepCents);
          return out;
        })()
      : getYAxisTicks(maxVal);
  const topTick = Math.max(...ticks, 10000);
  const chartMax = isEmpty ? 20000 : topTick * 1.15;
  const showSubLabels = xSubLabels && xSubLabels.length === data.length;
  const isClickable = Boolean(dateKeys?.length && onBarClick && dateKeys.length === data.length);

  const labelTopPadding = staggerValueLabels ? 28 : 0;
  const gridLineColor = whitePlotBackground ? "rgba(0,0,0,0.08)" : "var(--border)";
  const plotBorderColor = whitePlotBackground ? "rgba(180, 160, 180, 0.25)" : "var(--border)";
  const fitLabelsInPlot = staggerValueLabels && whitePlotBackground;
  const plotHeight = fitLabelsInPlot ? CHART_HEIGHT + labelTopPadding : CHART_HEIGHT;

  const formatAxis = yAxisStepCents != null ? formatCurrencyWithCommas : formatCurrency;
  return (
    <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: 8, minWidth: 40, fontSize: 11, color: "var(--text-muted)", textAlign: "right", height: plotHeight }}>
        {[...ticks].reverse().map((t) => (
          <span key={t}>{formatAxis(t)}</span>
        ))}
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        {!fitLabelsInPlot && labelTopPadding > 0 && <div style={{ height: labelTopPadding, flexShrink: 0 }} aria-hidden="true" />}
        <div
          style={{
            position: "relative",
            height: plotHeight,
            borderBottom: `1px solid ${plotBorderColor}`,
            ...(whitePlotBackground
              ? {
                  background: "#ffffff",
                  borderRadius: "var(--radius-card)",
                  border: `1px solid ${plotBorderColor}`,
                  borderBottom: `1px solid ${plotBorderColor}`,
                }
              : {}),
          }}
        >
          {ticks.slice(1).map((t) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: fitLabelsInPlot ? `${(t / chartMax) * 100 * (CHART_HEIGHT / plotHeight)}%` : `${(t / chartMax) * 100}%`,
                height: 1,
                background: gridLineColor,
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
              const staggerOffset = staggerValueLabels ? (i % 2 === 0 ? -8 : 8) : 0;
              const labelStyle = staggerValueLabels
                ? { fontSize: 10, fontWeight: 600, marginBottom: 8, color: "var(--text)", transform: `translateY(${staggerOffset}px)` }
                : { fontSize: 11, fontWeight: 600, marginBottom: 6 };
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
                    maxWidth: maxBarWidth,
                    cursor: isClickable ? "pointer" : "default",
                  }}
                >
                  <span style={labelStyle}>{compactBarLabels ? formatBarLabelCompact(v) : formatBarLabel(v)}</span>
                  <div
                    className="chart-bar"
                    title={formatCurrency(v)}
                    style={{
                      width: `${barWidthPct}%`,
                      height: barHeight,
                      minHeight: v > 0 ? 6 : 0,
                      background: "var(--avatar-gradient)",
                      borderTopLeftRadius: 6,
                      borderTopRightRadius: 6,
                      borderBottomLeftRadius: 0,
                      borderBottomRightRadius: 0,
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

/** Format date key (YYYY-MM-DD) to "Feb 15" for period display. */
function formatPeriodDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Format week range for hero: "Feb 15 – Feb 21". */
function formatWeekPeriodRange(startDateKey: string, endDateKey: string): string {
  return `${formatPeriodDay(startDateKey)} – ${formatPeriodDay(endDateKey)}`;
}

/** Format dollar delta for hero: +$100, -$50, or — when zero/null. */
function formatDollarDelta(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  if (cents === 0) return "—";
  const d = Math.abs(cents) / 100;
  const s = d >= 1 ? d.toLocaleString("en-US", { maximumFractionDigits: 0, minimumFractionDigits: 0 }) : d.toFixed(2);
  return cents > 0 ? `+$${s}` : `-$${s}`;
}

function EarningsHero({
  amount,
  periodText,
  onPrev,
  onNext,
  pctChange,
  dollarDeltaCents,
  disablePrev = false,
  disableNext = false,
}: {
  amount: string;
  periodText: string;
  onPrev: () => void;
  onNext: () => void;
  pctChange?: number | null;
  /** Current period total minus previous period total (cents). Shown below the % chip. */
  dollarDeltaCents?: number | null;
  disablePrev?: boolean;
  disableNext?: boolean;
}) {
  // Chip: vs previous period. Negative → up to 2 decimals; flat → grey "—"; positive → up to 2 decimals. Cap at ±99.99%.
  const rawPct = pctChange != null && typeof pctChange === "number" && Number.isFinite(pctChange) ? pctChange : null;
  const pctForDisplay =
    rawPct == null
      ? null
      : rawPct === 0
        ? 0
        : Math.max(-99.99, Math.min(99.99, rawPct * 100));
  const chipContent =
    pctForDisplay == null || pctForDisplay === 0
      ? { text: "—", mod: "neutral" as const, Icon: null }
      : pctForDisplay > 0
        ? { text: `+${pctForDisplay.toFixed(2)}%`, mod: "pos" as const, Icon: TrendUpIcon }
        : { text: `${pctForDisplay.toFixed(2)}%`, mod: "neg" as const, Icon: TrendDownIcon };

  const deltaCents = dollarDeltaCents != null && Number.isFinite(dollarDeltaCents) ? dollarDeltaCents : null;
  const deltaText = formatDollarDelta(deltaCents);
  const deltaMod = deltaCents == null || deltaCents === 0 ? "neutral" : deltaCents > 0 ? "pos" : "neg";

  return (
    <div className="earnings-hero">
      <div
        className="earnings-hero__header"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 2, minHeight: 38 }}
      >
        <div className="earnings-hero__selector" style={{ gap: 6, alignItems: "center" }}>
          <button
            type="button"
            className="earnings-hero__arrowBtn"
            onClick={onPrev}
            disabled={disablePrev}
            aria-label="Previous period"
          >
            <ChevronLeftIcon size={10} />
          </button>
          <span className="earnings-hero__periodText" style={{ fontSize: 13, minWidth: 72 }}>{periodText}</span>
          <button
            type="button"
            className="earnings-hero__arrowBtn"
            onClick={onNext}
            disabled={disableNext}
            aria-label="Next period"
          >
            <ChevronRightIcon size={10} />
          </button>
        </div>
        <div className="earnings-hero__chip-block">
          <span className={`earnings-hero__chip earnings-hero__chip--${chipContent.mod}`}>
            {chipContent.Icon ? (() => { const Icon = chipContent.Icon; return <Icon size={12} />; })() : null}
            {chipContent.text}
          </span>
          <span className={`earnings-hero__delta earnings-hero__delta--${deltaMod}`}>
            {deltaText}
          </span>
        </div>
      </div>
      <div className="earnings-hero__amount" style={{ marginTop: 0 }}>{amount}</div>
    </div>
  );
}

const TAB_KEYS: Record<(typeof TABS)[number], string> = {
  Daily: "earnings.daily",
  Weekly: "earnings.weekly",
  Monthly: "earnings.monthly",
  Yearly: "earnings.yearly",
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
  const [yearlyYearOffset, setYearlyYearOffset] = useState(0);
  const [studentsYearOffset, setStudentsYearOffset] = useState(0);
  const [selectedYearKey, setSelectedYearKey] = useState<string | null>(null);
  const [studentsSearch, setStudentsSearch] = useState("");
  const [studentsSort, setStudentsSort] = useState<"az" | "za" | "high" | "low">("high");
  const [studentsStatusFilter, setStudentsStatusFilter] = useState<"active" | "inactive">("active");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [dlYear, setDlYear] = useState(0); // 0 = unset; will init on open
  const [dlFormat, setDlFormat] = useState<"csv" | "pdf">("csv");
  const [dlDelivery, setDlDelivery] = useState<"device" | "email">("device");
  const now = new Date();
  // Use all completed, deduped lessons so matrix-imported attendance (any day) and tax CSV match. Scheduled-day filter excluded those.
  const completedLessons = dedupeLessons(data.lessons.filter((l) => l.completed));
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

  // ── Yearly data ──────────────────────────────────────────────
  const allYears = [...new Set(completedLessons.map((l) => parseInt(l.date.substring(0, 4))))].sort();
  if (allYears.length === 0) allYears.push(thisYear);
  if (!allYears.includes(thisYear)) allYears.push(thisYear);
  allYears.sort();
  const yearlyTotals: number[] = [];
  const yearlyHours: number[] = [];
  const yearlyLabels: string[] = [];
  for (const yr of allYears) {
    const yrStr = String(yr);
    const isCurrentYear = yr === thisYear;
    const yrLessons = isCurrentYear
      ? completedLessons.filter((l) => l.date >= `${yrStr}-01-01` && l.date <= todayKey)
      : completedLessons.filter((l) => l.date.startsWith(yrStr));
    yearlyTotals.push(yrLessons.reduce((s, l) => s + l.amountCents, 0));
    yearlyHours.push(yrLessons.reduce((s, l) => s + l.durationMinutes, 0) / 60);
    yearlyLabels.push(yrStr);
  }
  const maxYearly = Math.max(...yearlyTotals, 1);
  const yearlyGrandTotal = yearlyTotals.reduce((s, v) => s + v, 0);

  const dailyData = getDailyTotalsForWeek(completedLessons, now, dailyWeekOffset);
  const dailyWeekTotal = dailyData.reduce((s, d) => s + d.total, 0);
  const dailyStartKey = dailyData[0]?.dateKey ?? "";
  const dailyEndKey = dailyData[6]?.dateKey ?? "";
  const dailyPeriodText = dailyStartKey && dailyEndKey ? formatWeekPeriodRange(dailyStartKey, dailyEndKey) : "";
  const prevWeekData = getDailyTotalsForWeek(completedLessons, now, dailyWeekOffset - 1);
  const dailyPrevWeekTotal = prevWeekData.reduce((s, d) => s + d.total, 0);
  const dailyPctChange =
    dailyPrevWeekTotal > 0 ? (dailyWeekTotal - dailyPrevWeekTotal) / dailyPrevWeekTotal : null; // displayed week vs previous week

  const weeklyFirstWeek = weeklyData[0];
  const weeklyHeroTotal = weeklyFirstWeek?.total ?? 0;
  const weeklyHeroPeriodText = weeklyFirstWeek
    ? formatWeekPeriodRange(weeklyFirstWeek.startKey, weeklyFirstWeek.endKey)
    : weeklyMonthTitle;
  const prevMonthDate = new Date(weeklyYear, weeklyMonth - 1, 1);
  const prevMonthWeeks = getWeeksInMonth(completedLessons, prevMonthDate.getFullYear(), prevMonthDate.getMonth());
  const weeklyPrevTotal = prevMonthWeeks[0]?.total ?? 0;
  const weeklyPctChange = weeklyPrevTotal > 0 ? (weeklyHeroTotal - weeklyPrevTotal) / weeklyPrevTotal : null; // first week this month vs first week last month

  const monthlyHeroTotal = displayYear === thisYear ? earningsYTD : earningsForDisplayYear;
  const prevYearTotal =
    displayYear > Math.min(...allYears)
      ? completedLessons
          .filter((l) => l.date.startsWith(String(displayYear - 1)))
          .reduce((s, l) => s + l.amountCents, 0)
      : 0;
  const monthlyPctChange = prevYearTotal > 0 ? (monthlyHeroTotal - prevYearTotal) / prevYearTotal : null; // YTD or full year vs previous year

  const yearlyHeroYear = thisYear + yearlyYearOffset;
  const yearlyHeroIndex = allYears.indexOf(yearlyHeroYear);
  const yearlyHeroTotal =
    yearlyHeroIndex >= 0
      ? (yearlyTotals[yearlyHeroIndex] ?? 0)
      : completedLessons
          .filter((l) => l.date.startsWith(String(yearlyHeroYear)))
          .reduce((s, l) => s + l.amountCents, 0);
  const prevYearForHero = yearlyHeroYear - 1;
  const yearlyPrevIndex = allYears.indexOf(prevYearForHero);
  const yearlyPrevTotal =
    yearlyPrevIndex >= 0
      ? (yearlyTotals[yearlyPrevIndex] ?? 0)
      : completedLessons
          .filter((l) => l.date.startsWith(String(prevYearForHero)))
          .reduce((s, l) => s + l.amountCents, 0);
  const yearlyPctChange = yearlyPrevTotal > 0 ? (yearlyHeroTotal - yearlyPrevTotal) / yearlyPrevTotal : null; // selected year vs previous year

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
    rows.push(["Total Earnings", "$" + (totalAmount / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })]);
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
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={openDownloadModal}
          aria-label="Download earnings"
        >
          <DownloadIcon size={7} />
        </IconButton>
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
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDownloadOpen(false)}
                aria-label="Close"
              >
                &times;
              </IconButton>
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
                  <Button
                    key={fmt}
                    type="button"
                    variant="tab"
                    active={dlFormat === fmt}
                    size="sm"
                    onClick={() => setDlFormat(fmt)}
                    style={{
                      flex: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    {fmt}
                  </Button>
                ))}
              </div>
            </div>

            {/* Delivery */}
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Deliver to</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Button
                  type="button"
                  variant="tab"
                  active={dlDelivery === "device"}
                  size="sm"
                  fullWidth
                  onClick={() => setDlDelivery("device")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    justifyContent: "flex-start",
                  }}
                  leftIcon={<DownloadIcon size={7} />}
                >
                  Download to device
                </Button>
                <Button
                  type="button"
                  variant="tab"
                  active={dlDelivery === "email"}
                  size="sm"
                  fullWidth
                  onClick={() => setDlDelivery("email")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    justifyContent: "flex-start",
                  }}
                  leftIcon={
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
                    </svg>
                  }
                >
                  Email to {data.user?.email ? data.user.email : "profile"}
                </Button>
              </div>
            </div>

            {/* Action button */}
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleDownload}
              fullWidth
            >
              {dlDelivery === "email" ? "Download & Open Email" : "Download"}
            </Button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {TABS.map((tab) => (
          <Button
            key={tab}
            type="button"
            variant="tab"
            size="sm"
            active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className="tabButton"
            style={{ flex: "1 1 0", minWidth: 0 }}
          >
            {t(TAB_KEYS[tab])}
          </Button>
        ))}
      </div>

      {activeTab === "Weekly" && (
        <>
          <EarningsHero
            amount={formatCurrency(weeklyHeroTotal)}
            periodText={weeklyHeroPeriodText}
            onPrev={() => { setWeeklyMonthOffset((o) => o - 1); setSelectedWeekStartKey(null); }}
            onNext={() => { setWeeklyMonthOffset((o) => o + 1); setSelectedWeekStartKey(null); }}
            pctChange={weeklyPctChange}
            dollarDeltaCents={weeklyHeroTotal - weeklyPrevTotal}
          />
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
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedWeekStartKey(null)}>Close</Button>
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
          <EarningsHero
            amount={formatCurrency(monthlyHeroTotal)}
            periodText={monthlyTitle}
            onPrev={() => { setMonthlyYearOffset((o) => o - 1); setSelectedMonthKey(null); }}
            onNext={() => { setMonthlyYearOffset((o) => o + 1); setSelectedMonthKey(null); }}
            pctChange={monthlyPctChange}
            dollarDeltaCents={monthlyHeroTotal - prevYearTotal}
          />
          {monthsToShow > 0 && (
            <>
              <div style={{ marginBottom: 24 }}>
                <BarChart
                  data={visibleMonthlyTotals}
                  xLabels={visibleMonthLabels}
                  maxVal={maxMonthly}
                  noEarningsText={t("earnings.noEarnings")}
                  dateKeys={visibleMonthLabels.map((_, i) => `${displayYear}-${String(i + 1).padStart(2, "0")}`)}
                  onBarClick={(key) => setSelectedMonthKey((prev) => (prev === key ? null : key))}
                  maxBarWidth={22}
                  barWidthPct={50}
                  whitePlotBackground
                  staggerValueLabels
                  compactBarLabels
                />
              </div>
              <div className="float-card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
                {visibleMonthLabels.map((label, i) => {
                  const monthKey = `${displayYear}-${String(i + 1).padStart(2, "0")}`;
                  const isSelected = selectedMonthKey === monthKey;
                  return (
                    <Button
                      key={i}
                      type="button"
                      variant="tab"
                      size="sm"
                      active={isSelected}
                      fullWidth
                      onClick={() => setSelectedMonthKey((prev) => (prev === monthKey ? null : monthKey))}
                      className="card-list-item"
                      style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "center", paddingLeft: 20, paddingRight: 20, borderRadius: 0, boxShadow: "none" }}
                    >
                      <span>{label}</span>
                      <span style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>{visibleMonthlyHours[i] % 1 === 0 ? visibleMonthlyHours[i] : visibleMonthlyHours[i].toFixed(1)} hrs</span>
                      <span style={{ fontWeight: 600, textAlign: "right" }}>{formatCurrency(visibleMonthlyTotals[i])}</span>
                    </Button>
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
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedMonthKey(null)}>Close</Button>
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

      {activeTab === "Yearly" && (
        <>
          <EarningsHero
            amount={formatCurrency(yearlyHeroTotal)}
            periodText={String(yearlyHeroYear)}
            onPrev={() => setYearlyYearOffset((o) => o - 1)}
            onNext={() => setYearlyYearOffset((o) => o + 1)}
            pctChange={yearlyPctChange}
            dollarDeltaCents={yearlyHeroTotal - yearlyPrevTotal}
            disablePrev={yearlyHeroYear <= Math.min(...allYears.map(Number))}
            disableNext={yearlyHeroYear >= thisYear}
          />
          {yearlyLabels.length > 0 && (
            <>
              <div className="float-card" style={{ marginBottom: 24 }}>
                <BarChart
                  data={yearlyTotals}
                  xLabels={yearlyLabels}
                  maxVal={maxYearly}
                  noEarningsText={t("earnings.noEarnings")}
                  dateKeys={yearlyLabels}
                  onBarClick={(key) => setSelectedYearKey((prev) => (prev === key ? null : key))}
                  yAxisStepCents={1000000}
                />
              </div>
              <div className="float-card" style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
                {yearlyLabels.map((label, i) => {
                  const isSelected = selectedYearKey === label;
                  return (
                    <Button
                      key={label}
                      type="button"
                      variant="tab"
                      size="sm"
                      active={isSelected}
                      fullWidth
                      onClick={() => setSelectedYearKey((prev) => (prev === label ? null : label))}
                      className="card-list-item"
                      style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "center", paddingLeft: 20, paddingRight: 20, borderRadius: 0, boxShadow: "none" }}
                    >
                      <span>{label}{parseInt(label) === thisYear ? " (YTD)" : ""}</span>
                      <span style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>{yearlyHours[i] % 1 === 0 ? yearlyHours[i] : yearlyHours[i].toFixed(1)} hrs</span>
                      <span style={{ fontWeight: 600, textAlign: "right" }}>{formatCurrency(yearlyTotals[i])}</span>
                    </Button>
                  );
                })}
              </div>
            </>
          )}
          {yearlyLabels.length === 0 && (
            <div className="float-card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>No data to show yet.</div>
          )}
          {selectedYearKey && (() => {
            const yr = parseInt(selectedYearKey);
            const yrStr = selectedYearKey;
            const isCurrentYear = yr === thisYear;
            const yearLessons = isCurrentYear
              ? completedLessons.filter((l) => l.date >= `${yrStr}-01-01` && l.date <= todayKey)
              : completedLessons.filter((l) => l.date.startsWith(yrStr));
            const byStudent = new Map<string, { minutes: number; cents: number }>();
            for (const l of yearLessons) {
              const cur = byStudent.get(l.studentId) ?? { minutes: 0, cents: 0 };
              byStudent.set(l.studentId, { minutes: cur.minutes + l.durationMinutes, cents: cur.cents + l.amountCents });
            }
            const numStudents = byStudent.size;
            const totalMinutes = yearLessons.reduce((s, l) => s + l.durationMinutes, 0);
            const totalHours = totalMinutes / 60;
            const totalEarned = yearLessons.reduce((s, l) => s + l.amountCents, 0);
            const formatHours = (mins: number) => {
              const h = mins / 60;
              return h % 1 === 0 ? h : h.toFixed(1);
            };
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>{yrStr}{isCurrentYear ? " (YTD)" : ""}</strong>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedYearKey(null)}>Close</Button>
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
                  {Array.from(byStudent.entries())
                    .sort((a, b) => b[1].cents - a[1].cents)
                    .map(([studentId, { minutes, cents }]) => {
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
          <EarningsHero
            amount={formatCurrency(dailyWeekTotal)}
            periodText={dailyPeriodText}
            onPrev={() => setDailyWeekOffset((o) => o - 1)}
            onNext={() => setDailyWeekOffset((o) => o + 1)}
            pctChange={dailyPctChange}
            dollarDeltaCents={dailyWeekTotal - dailyPrevWeekTotal}
          />
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
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedDayDateKey(null)}>Close</Button>
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
        const studentsWithEarnings = studentTotals.filter(({ total }) => total > 0);
        const cutoffDate =
          studentsDisplayYear === thisYear ? todayKey : `${studentsDisplayYear}-12-31`;
        let activeCount = 0;
        let inactiveCount = 0;
        for (const { student } of studentsWithEarnings) {
          if (isStudentActive(student, cutoffDate)) activeCount += 1;
          else inactiveCount += 1;
        }
        const filteredByStatus =
          studentsStatusFilter === "active"
            ? studentTotals.filter(({ student }) => isStudentActive(student, cutoffDate))
            : studentTotals.filter(({ student }) => isStudentHistorical(student, cutoffDate));
        const q = studentsSearch.trim().toLowerCase();
        const filtered = q
          ? filteredByStatus.filter(({ student: s }) =>
              `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
            )
          : filteredByStatus;
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
        const isEmptyInactive = studentsStatusFilter === "inactive" && sorted.length === 0;
        return (
          <>
            {/* Students hero: date switcher at top, then active/inactive counts */}
            <div className="earnings-hero" style={{ marginBottom: 20 }}>
              <div className="earnings-hero__selector" style={{ gap: 6, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <button
                  type="button"
                  className="earnings-hero__arrowBtn"
                  onClick={() => setStudentsYearOffset((o) => o - 1)}
                  aria-label="Previous year"
                >
                  <ChevronLeftIcon size={10} />
                </button>
                <span className="earnings-hero__periodText" style={{ fontSize: 13, minWidth: 72 }}>
                  {studentsDisplayYear}
                </span>
                <button
                  type="button"
                  className="earnings-hero__arrowBtn"
                  onClick={() => setStudentsYearOffset((o) => o + 1)}
                  aria-label="Next year"
                >
                  <ChevronRightIcon size={10} />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.activeStudents")}</div>
                  <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{activeCount}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.inactiveStudents")}</div>
                  <div className="headline-serif" style={{ fontSize: 20, fontWeight: 400 }}>{inactiveCount}</div>
                </div>
              </div>
            </div>
            {/* Search + Sort */}
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
            {/* Active / Inactive segmented toggle */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: "var(--radius-pill)", padding: 4, background: "rgba(180, 160, 180, 0.08)", border: "1px solid var(--border)", width: "fit-content" }}>
              <Button type="button" variant="tab" size="sm" active={studentsStatusFilter === "active"} onClick={() => setStudentsStatusFilter("active")} style={{ border: "none" }}>
                Active
              </Button>
              <Button type="button" variant="tab" size="sm" active={studentsStatusFilter === "inactive"} onClick={() => setStudentsStatusFilter("inactive")} style={{ border: "none" }}>
                Inactive
              </Button>
            </div>
            <div className="float-card" style={{ padding: 0, overflow: "hidden" }}>
              {isEmptyInactive && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>No inactive students this year.</div>
              )}
              {sorted.length > 0 && !isEmptyInactive && sorted.map(({ student: s, total }) => (
                <Link
                  key={s.id}
                  to={`/students/${s.id}`}
                  className="card-list-item"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingLeft: 20,
                    paddingRight: 20,
                    paddingTop: 14,
                    paddingBottom: 14,
                    textDecoration: "none",
                    color: "inherit",
                    cursor: "pointer",
                    transition: "background 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(180, 160, 180, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span>{s.firstName} {s.lastName}</span>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(total)}</span>
                </Link>
              ))}
              {sorted.length === 0 && !isEmptyInactive && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No students found</div>
              )}
            </div>
          </>
        );
      })()}

    </>
  );
}
