import { useState, useCallback, useRef } from "react";
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
import "./earnings.mock.css";

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

/** Tooltip / display currency with 2 decimals (e.g. $60.00). */
function formatCurrencyTwoDecimals(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  hideValueLabels = false,
  selectedDateKey,
  showYAxisLabels = false,
  barStyleByIndex,
}: {
  data: number[];
  xLabels: string[];
  xSubLabels?: string[];
  maxVal: number;
  dateKeys?: string[];
  onBarClick?: (dateKey: string) => void;
  angleXLabels?: boolean;
  noEarningsText?: string;
  yAxisStepCents?: number;
  maxBarWidth?: number;
  barWidthPct?: number;
  whitePlotBackground?: boolean;
  staggerValueLabels?: boolean;
  compactBarLabels?: boolean;
  /** When true, do not render value labels above bars (e.g. Monthly tab; use tooltip only). */
  hideValueLabels?: boolean;
  /** When set, the bar whose dateKey matches is styled as emphasized (dark teal). */
  selectedDateKey?: string | null;
  /** When true, show $ tick labels on the left y-axis. Default false to match mocks. */
  showYAxisLabels?: boolean;
  /** Optional per-bar style (e.g. background) by index. Used for Yearly current vs prior year. */
  barStyleByIndex?: (i: number) => React.CSSProperties;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; bottom: number } | null>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);

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

  function handleBarMouseEnter(e: React.MouseEvent, i: number) {
    setHoveredIndex(i);
    const bar = e.currentTarget.getBoundingClientRect();
    const container = chartAreaRef.current?.getBoundingClientRect();
    if (container) {
      setTooltipPos({
        left: bar.left - container.left + bar.width / 2,
        bottom: bar.bottom - container.top + 8,
      });
    }
  }

  function handleBarMouseLeave() {
    setHoveredIndex(null);
    setTooltipPos(null);
  }

  return (
    <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
      {showYAxisLabels && (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: 8, minWidth: 40, fontSize: 11, color: "var(--text-muted)", textAlign: "right", height: plotHeight }}>
          {[...ticks].reverse().map((t) => (
            <span key={t}>{formatAxis(t)}</span>
          ))}
        </div>
      )}
      <div ref={chartAreaRef} style={{ flex: 1, position: "relative" }}>
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
                height: 0,
                borderBottom: "1px dashed rgba(0,0,0,0.12)",
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
              const isEmphasized = (selectedDateKey != null && dateKey === selectedDateKey) || hoveredIndex === i;
              const staggerOffset = staggerValueLabels ? (i % 2 === 0 ? -8 : 8) : 0;
              const labelStyle = staggerValueLabels
                ? { fontSize: 10, fontWeight: 600, marginBottom: 8, color: "var(--text)", transform: `translateY(${staggerOffset}px)` }
                : { fontSize: 11, fontWeight: 600, marginBottom: 6 };
              return (
                <div
                  key={i}
                  role={isClickable ? "button" : undefined}
                  onClick={isClickable && dateKey ? () => onBarClick?.(dateKey) : undefined}
                  onMouseEnter={(e) => handleBarMouseEnter(e, i)}
                  onMouseLeave={handleBarMouseLeave}
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
                  {!hideValueLabels && (
                    <span style={labelStyle}>{compactBarLabels ? formatBarLabelCompact(v) : formatBarLabel(v)}</span>
                  )}
                  <div
                    className={`chart-bar ${isEmphasized ? "earnings-bar--emphasized" : "earnings-bar--default"}`}
                    style={{
                      width: `${barWidthPct}%`,
                      height: barHeight,
                      minHeight: v > 0 ? 6 : 0,
                      background: isEmphasized ? "#26434b" : (barStyleByIndex?.(i)?.background ?? "#93c5fd"),
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
          {hoveredIndex !== null && tooltipPos != null && (
            <div
              className="earnings-chart-tooltip"
              style={{
                position: "absolute",
                left: tooltipPos.left,
                bottom: tooltipPos.bottom,
                transform: "translateX(-50%)",
              }}
            >
              <div className="earnings-chart-tooltip__period">{xLabels[hoveredIndex] ?? ""}</div>
              <div className="earnings-chart-tooltip__value">Earnings : {formatCurrencyTwoDecimals(data[hoveredIndex] ?? 0)}</div>
            </div>
          )}
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
      <div className="earnings-hero__header">
        <button
          type="button"
          className="earnings-hero__arrowBtn"
          onClick={onPrev}
          disabled={disablePrev}
          aria-label="Previous period"
        >
          <ChevronLeftIcon size={10} />
        </button>
        <div className="earnings-hero__center">
          <span className="earnings-hero__periodText">{periodText}</span>
          <div className="earnings-hero__amount">{amount}</div>
        </div>
        <div className="earnings-hero__rightControls">
          <div className="earnings-hero__deltaBlock">
            <span className={`earnings-hero__chip earnings-hero__chip--${chipContent.mod}`}>
              {chipContent.Icon ? (() => { const Icon = chipContent.Icon; return <Icon size={10} />; })() : null}
              {chipContent.text}
            </span>
            <span className={`earnings-hero__delta earnings-hero__delta--${deltaMod}`}>
              {deltaText}
            </span>
          </div>
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
      </div>
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
  const [studentsYearDropdownOpen, setStudentsYearDropdownOpen] = useState(false);
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
  const monthlyHasAnyCompletedLessons = visibleMonthlyTotals.some((v) => v > 0);
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

  const dailyData = getDailyTotalsForWeek(completedLessons, now, dailyWeekOffset);
  const dailyWeekTotal = dailyData.reduce((s, d) => s + d.total, 0);
  const dailyHasAnyCompletedLessons = dailyData.some((d) => completedLessons.some((l) => l.date === d.dateKey));
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
    <div className="earnings-page">
      <header className="earnings-page__header">
        <div className="earnings-page__titleBlock">
          <h1 className="earnings-page__title">{t("earnings.title")}</h1>
          <p className="earnings-page__subtitle">{t("earnings.subtitle")}</p>
        </div>
        <button
          type="button"
          className="earnings-page__downloadBtn"
          onClick={openDownloadModal}
          aria-label="Download earnings"
        >
          <DownloadIcon size={20} />
        </button>
      </header>

      {/* Download modal */}
      {downloadOpen && (
        <div className="earnings-dl-overlay" onClick={() => setDownloadOpen(false)}>
          <div className="earnings-dl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="earnings-dl-modal__header">
              <h2 className="earnings-dl-modal__title">Download Earnings</h2>
              <button type="button" className="earnings-dl-modal__close" onClick={() => setDownloadOpen(false)} aria-label="Close">&times;</button>
            </div>
            <label>
              <span className="earnings-dl-modal__label">Year</span>
              <select
                className="earnings-dl-modal__yearSelect"
                value={dlYear}
                onChange={(e) => setDlYear(Number(e.target.value))}
              >
                {yearsWithData.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <div>
              <span className="earnings-dl-modal__label">Format</span>
              <div className="earnings-dl-modal__formatRow">
                <button type="button" className={`earnings-dl-modal__formatBtn ${dlFormat === "csv" ? "earnings-dl-modal__formatBtn--active" : "earnings-dl-modal__formatBtn--inactive"}`} onClick={() => setDlFormat("csv")}>CSV</button>
                <button type="button" className={`earnings-dl-modal__formatBtn ${dlFormat === "pdf" ? "earnings-dl-modal__formatBtn--active" : "earnings-dl-modal__formatBtn--inactive"}`} onClick={() => setDlFormat("pdf")}>PDF</button>
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <span className="earnings-dl-modal__label">Deliver to</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button type="button" className={`earnings-dl-modal__deliverRow ${dlDelivery === "device" ? "earnings-dl-modal__deliverRow--selected" : ""}`} onClick={() => setDlDelivery("device")}>
                  <span className="earnings-dl-modal__deliverIcon"><DownloadIcon size={20} /></span>
                  <span className="earnings-dl-modal__deliverLabel">Download to device</span>
                </button>
                <button type="button" className={`earnings-dl-modal__deliverRow ${dlDelivery === "email" ? "earnings-dl-modal__deliverRow--selected" : ""}`} onClick={() => setDlDelivery("email")}>
                  <span className="earnings-dl-modal__deliverIcon">
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" /></svg>
                  </span>
                  <span className="earnings-dl-modal__deliverLabel">Email to {data.user?.email ? data.user.email : "profile"}</span>
                </button>
              </div>
            </div>
            <button type="button" className="earnings-dl-modal__downloadBtn" onClick={handleDownload}>
              {dlDelivery === "email" ? "Download & Open Email" : "Download"}
            </button>
          </div>
        </div>
      )}

      <div className="earnings-page__tabsWrap">
        <div className="earnings-page__tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`earnings-page__tab ${activeTab === tab ? "earnings-page__tab--active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(TAB_KEYS[tab])}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Weekly" && (() => {
        const weeklyHasAnyCompletedLessons = weeklyData.some((w) => w.total > 0);
        return (
        <>
          <EarningsHero
            amount={formatCurrency(weeklyHeroTotal)}
            periodText={weeklyHeroPeriodText}
            onPrev={() => { setWeeklyMonthOffset((o) => o - 1); setSelectedWeekStartKey(null); }}
            onNext={() => { setWeeklyMonthOffset((o) => o + 1); setSelectedWeekStartKey(null); }}
            pctChange={weeklyPctChange}
            dollarDeltaCents={weeklyHeroTotal - weeklyPrevTotal}
          />
          <div className="earnings-card earnings-chart-card" style={{ marginBottom: 24 }}>
            {weeklyData.length > 0 ? (
              <BarChart
                data={weeklyData.map((w) => w.total)}
                xLabels={weeklyData.map((w) => w.label)}
                maxVal={maxWeekly}
                noEarningsText={t("earnings.noEarnings")}
                dateKeys={weeklyData.map((w) => w.startKey)}
                onBarClick={(key) => setSelectedWeekStartKey((prev) => (prev === key ? null : key))}
                selectedDateKey={selectedWeekStartKey}
                angleXLabels
              />
            ) : (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No weeks in this month</div>
            )}
          </div>
          {weeklyHasAnyCompletedLessons && weeklyData.map((week) => {
            const weekLessons = completedLessons.filter((l) => l.date >= week.startKey && l.date <= week.endKey);
            const numStudents = weekLessons.length;
            const totalMinutes = weekLessons.reduce((s, l) => s + l.durationMinutes, 0);
            const totalHours = totalMinutes / 60;
            const [sy, sm, sd] = week.startKey.split("-").map(Number);
            const [ey, em, ed] = week.endKey.split("-").map(Number);
            const startFormatted = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const endFormatted = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const formatDuration = (mins: number) => mins === 60 ? "1 hour" : mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} hrs`;
            const isExpanded = selectedWeekStartKey === week.startKey;
            return (
              <div key={week.startKey} className="earnings-list-card" style={{ marginBottom: 16 }}>
                <div className="earnings-list-card__head">
                  <div>
                    <h3 className="earnings-list-card__title">{startFormatted} – {endFormatted}</h3>
                    <p className="earnings-list-card__meta">
                      {weekLessons.length} lessons · {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)} hrs · <span className="earnings-amount--green">{formatCurrency(week.total)}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`earnings-list-card__viewBtn ${isExpanded ? "earnings-list-card__viewBtn--close" : "earnings-list-card__viewBtn--view"}`}
                    onClick={() => setSelectedWeekStartKey((prev) => (prev === week.startKey ? null : week.startKey))}
                  >
                    {isExpanded ? "Close" : "View"}
                  </button>
                </div>
                {isExpanded && weekLessons.length > 0 && (
                  <div className="earnings-list-card__body">
                    {weekLessons.map((l) => {
                      const student = data.students.find((s) => s.id === l.studentId);
                      const [ly, lm, ld] = l.date.split("-").map(Number);
                      const dayName = new Date(ly, lm - 1, ld).toLocaleDateString("en-US", { weekday: "short" });
                      return (
                        <div key={l.id} className="earnings-list-card__row">
                          <div className="earnings-list-card__avatar">{student ? `${student.firstName[0]}${student.lastName[0]}` : "—"}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="earnings-list-card__name">{student ? `${student.firstName} ${student.lastName}` : "—"}</div>
                            <div className="earnings-list-card__sub">{dayName} {l.date.slice(5)} · {formatDuration(l.durationMinutes)}</div>
                          </div>
                          <span className="earnings-list-card__amount">{formatCurrency(l.amountCents)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
        );
      })()}

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
              <div className="earnings-card earnings-chart-card" style={{ marginBottom: 24 }}>
                <div className="earnings-chart-card__title">MONTHLY BREAKDOWN — {displayYear}</div>
                <BarChart
                  data={visibleMonthlyTotals}
                  xLabels={visibleMonthLabels}
                  maxVal={maxMonthly}
                  noEarningsText={t("earnings.noEarnings")}
                  dateKeys={visibleMonthLabels.map((_, i) => `${displayYear}-${String(i + 1).padStart(2, "0")}`)}
                  onBarClick={(key) => setSelectedMonthKey((prev) => (prev === key ? null : key))}
                  selectedDateKey={selectedMonthKey}
                  maxBarWidth={22}
                  barWidthPct={50}
                  whitePlotBackground
                  hideValueLabels
                />
              </div>
              {monthlyHasAnyCompletedLessons && (
                <div className="earnings-card earnings-card--noPadding earnings-monthly-list" style={{ marginBottom: 24 }}>
                  {visibleMonthLabels.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      className="earnings-monthly-row"
                      onClick={() => setSelectedMonthKey((prev) => (prev === `${displayYear}-${String(i + 1).padStart(2, "0")}` ? null : `${displayYear}-${String(i + 1).padStart(2, "0")}`))}
                      style={{ width: "100%", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
                    >
                      <span className="earnings-monthly-list__month">{label}</span>
                      <span className="earnings-monthly-list__hours">{visibleMonthlyHours[i] % 1 === 0 ? visibleMonthlyHours[i] : visibleMonthlyHours[i].toFixed(1)} hrs</span>
                      <span className="earnings-monthly-list__amount">{formatCurrency(visibleMonthlyTotals[i])}</span>
                    </button>
                  ))}
                  <div className="earnings-monthly-list__footer earnings-monthly-row">
                    <span className="earnings-monthly-list__month">Total {displayYear}</span>
                    <span className="earnings-monthly-list__amount">{formatCurrency(visibleMonthlyTotals.reduce((a, b) => a + b, 0))}</span>
                  </div>
                </div>
              )}
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
                      <div className="earnings-detail-card__value" style={{ fontSize: 20 }}>{numStudents}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Hours</div>
                      <div className="earnings-detail-card__value" style={{ fontSize: 20 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.earningsYear")}</div>
                      <div className="earnings-detail-card__value" style={{ fontSize: 20 }}>{formatCurrency(totalEarned)}</div>
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
          {(() => {
            const allTimeTotal = completedLessons.reduce((s, l) => s + l.amountCents, 0);
            return (
              <div className="earnings-hero earnings-hero--yearly" style={{ marginBottom: 20, textAlign: "center" }}>
                <div className="earnings-hero__allTimePill">
                  <span className="earnings-hero__allTimeLabel">All-time earnings</span>
                  <span className="earnings-hero__allTimeAmount">{formatCurrency(allTimeTotal)}</span>
                </div>
              </div>
            );
          })()}
          {yearlyLabels.length > 0 && (
            <>
              <div className="earnings-card earnings-chart-card" style={{ marginBottom: 24 }}>
                <div className="earnings-chart-card__title">YEAR-OVER-YEAR</div>
                <BarChart
                  data={yearlyTotals}
                  xLabels={yearlyLabels}
                  maxVal={maxYearly}
                  noEarningsText={t("earnings.noEarnings")}
                  dateKeys={yearlyLabels}
                  onBarClick={(key) => setSelectedYearKey((prev) => (prev === key ? null : key))}
                  selectedDateKey={selectedYearKey}
                  yAxisStepCents={1000000}
                  barStyleByIndex={(i) => ({ background: yearlyLabels[i] === String(thisYear) ? "#26434b" : "#93c5fd" })}
                />
              </div>
              <div className="earnings-card earnings-card--noPadding earnings-yearly-list" style={{ marginBottom: 24 }}>
                {yearlyLabels.map((label, i) => {
                  const yr = parseInt(label);
                  const isCurrentYear = yr === thisYear;
                  const pctChange = i > 0 && yearlyTotals[i - 1]! > 0 ? ((yearlyTotals[i]! - yearlyTotals[i - 1]!) / yearlyTotals[i - 1]!) * 100 : null;
                  return (
                    <button
                      key={label}
                      type="button"
                      className="earnings-yearly-row"
                      onClick={() => setSelectedYearKey((prev) => (prev === label ? null : label))}
                      style={{ width: "100%", border: "none", background: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}
                    >
                      <div>
                        <span className="earnings-yearly-list__year">{label}{isCurrentYear ? " (YTD)" : ""}</span>
                        <div className="earnings-yearly-list__meta">{yearlyHours[i] % 1 === 0 ? yearlyHours[i] : yearlyHours[i].toFixed(1)} hrs · {completedLessons.filter((l) => l.date.startsWith(label)).length} lessons</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        {pctChange != null && pctChange < 0 && <span className="earnings-yearly-list__pctPill">{pctChange.toFixed(1)}%</span>}
                        <span className="earnings-yearly-list__amount">{formatCurrency(yearlyTotals[i])}</span>
                      </div>
                    </button>
                  );
                })}
                <div className="earnings-yearly-list__footer earnings-yearly-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="earnings-yearly-list__year">All Time</span>
                  <span className="earnings-yearly-list__amount">{formatCurrency(completedLessons.reduce((s, l) => s + l.amountCents, 0))}</span>
                </div>
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
                      <div className="earnings-detail-card__value" style={{ fontSize: 20 }}>{numStudents}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Hours</div>
                      <div className="earnings-detail-card__value" style={{ fontSize: 20 }}>{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("earnings.earningsYear")}</div>
                      <div className="earnings-detail-card__value" style={{ fontSize: 20 }}>{formatCurrency(totalEarned)}</div>
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
          <div className="earnings-card earnings-chart-card" style={{ marginBottom: 24 }}>
            <BarChart
              data={dailyData.map((d) => d.total)}
              xLabels={dailyData.map((d) => d.label)}
              xSubLabels={dailyData.map((d) => d.dayOfWeek)}
              maxVal={maxDaily}
              dateKeys={dailyData.map((d) => d.dateKey)}
              onBarClick={(dateKey) => setSelectedDayDateKey((prev) => (prev === dateKey ? null : dateKey))}
              selectedDateKey={selectedDayDateKey}
              noEarningsText={t("earnings.noLessonsThisWeek")}
            />
          </div>
          {dailyHasAnyCompletedLessons
            ? dailyData.map((d) => {
            const dayLessons = completedLessons.filter((l) => l.date === d.dateKey);
            const numStudents = dayLessons.length;
            const totalMinutes = dayLessons.reduce((s, l) => s + l.durationMinutes, 0);
            const totalHours = totalMinutes / 60;
            const [y, m, dayNum] = d.dateKey.split("-").map(Number);
            const dateFormatted = new Date(y, m - 1, dayNum).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
            const formatDuration = (mins: number) => mins === 60 ? "1 hour" : mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} hrs`;
            const isExpanded = selectedDayDateKey === d.dateKey;
            return (
              <div key={d.dateKey} className="earnings-list-card" style={{ marginBottom: 16 }}>
                <div className="earnings-list-card__head">
                  <div>
                    <h3 className="earnings-list-card__title">{dateFormatted}</h3>
                    <p className="earnings-list-card__meta">
                      {numStudents} student{numStudents !== 1 ? "s" : ""} · {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)} hrs · <span className="earnings-amount--green">{formatCurrency(d.total)}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`earnings-list-card__viewBtn ${isExpanded ? "earnings-list-card__viewBtn--close" : "earnings-list-card__viewBtn--view"}`}
                    onClick={() => setSelectedDayDateKey((prev) => (prev === d.dateKey ? null : d.dateKey))}
                  >
                    {isExpanded ? "Close" : "View"}
                  </button>
                </div>
                {isExpanded && dayLessons.length > 0 && (
                  <div className="earnings-list-card__body">
                    {dayLessons.map((l) => {
                      const student = data.students.find((s) => s.id === l.studentId);
                      return (
                        <div key={l.id} className="earnings-list-card__row">
                          <div className="earnings-list-card__avatar">{student ? `${student.firstName[0]}${student.lastName[0]}` : "—"}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="earnings-list-card__name">{student ? `${student.firstName} ${student.lastName}` : "—"}</div>
                            <div className="earnings-list-card__sub">{formatDuration(l.durationMinutes)}</div>
                          </div>
                          <span className="earnings-list-card__amount">{formatCurrency(l.amountCents)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
            : null}
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
        const totalLessonsStudentsTab = lessonsForStudentsYear.length;
        const totalEarningsStudentsTab = lessonsForStudentsYear.reduce((s, l) => s + l.amountCents, 0);
        const sortLabel = studentsSort === "az" || studentsSort === "za" ? "A – Z" : "By Earnings";
        return (
          <>
            <div className="earnings-students__controls">
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="earnings-students__yearPill"
                  onClick={() => setStudentsYearDropdownOpen((o) => !o)}
                  aria-expanded={studentsYearDropdownOpen}
                >
                  {studentsDisplayYear} YTD
                  <ChevronRightIcon size={12} style={{ transform: "rotate(90deg)" }} />
                </button>
                {studentsYearDropdownOpen && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 1 }} onClick={() => setStudentsYearDropdownOpen(false)} aria-hidden="true" />
                    <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid var(--border)", padding: "8px 0", minWidth: 140, zIndex: 2 }}>
                      {[thisYear, thisYear - 1].map((y) => (
                        <button
                          key={y}
                          type="button"
                          onClick={() => { setStudentsYearOffset(y - thisYear); setStudentsYearDropdownOpen(false); }}
                          style={{ width: "100%", padding: "10px 16px", border: "none", background: studentsDisplayYear === y ? "rgba(90, 122, 126, 0.1)" : "transparent", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text)", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                        >
                          {y} YTD
                          {studentsDisplayYear === y && <span style={{ color: "#26434b" }}>✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                className="earnings-students__sortPill"
                onClick={() => setStudentsSort((prev) => (prev === "high" || prev === "low" ? "az" : "high"))}
              >
                {sortLabel}
              </button>
            </div>
            <div className="earnings-students__searchWrap">
              <svg className="earnings-students__searchIcon" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="earnings-students__search"
                placeholder="Search student..."
                value={studentsSearch}
                onChange={(e) => setStudentsSearch(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: "var(--radius-pill)", padding: 4, background: "rgba(180, 160, 180, 0.08)", border: "1px solid var(--border)", width: "fit-content" }}>
              <Button type="button" variant="tab" size="sm" active={studentsStatusFilter === "active"} onClick={() => setStudentsStatusFilter("active")} style={{ border: "none" }}>
                Active
              </Button>
              <Button type="button" variant="tab" size="sm" active={studentsStatusFilter === "inactive"} onClick={() => setStudentsStatusFilter("inactive")} style={{ border: "none" }}>
                Inactive
              </Button>
            </div>
            <div className="earnings-students-list">
              {isEmptyInactive && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>No inactive students this year.</div>
              )}
              {sorted.length > 0 && !isEmptyInactive && sorted.map(({ student: s, total }) => {
                const lessonCount = lessonsForStudentsYear.filter((l) => l.studentId === s.id).length;
                const mins = lessonsForStudentsYear.filter((l) => l.studentId === s.id).reduce((a, l) => a + l.durationMinutes, 0);
                const hrs = mins / 60;
                return (
                  <Link key={s.id} to={`/students/${s.id}`} className="earnings-students-list__row">
                    <div className="earnings-students-list__avatar">{s.firstName[0]}{s.lastName[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="earnings-students-list__name">{s.firstName} {s.lastName}</div>
                      <div className="earnings-students-list__meta">{lessonCount} lessons · {hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hrs</div>
                    </div>
                    <span className="earnings-students-list__amount">{formatCurrency(total)}</span>
                  </Link>
                );
              })}
              {sorted.length === 0 && !isEmptyInactive && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No students found</div>
              )}
              {sorted.length > 0 && !isEmptyInactive && (
                <div className="earnings-students-list__footer">
                  <div>
                    <div className="earnings-students-list__footerTitle">Total {studentsDisplayYear}</div>
                    <p className="earnings-students-list__footerMeta">{totalLessonsStudentsTab} lessons</p>
                  </div>
                  <span className="earnings-students-list__footerAmount">{formatCurrency(totalEarningsStudentsTab)}</span>
                </div>
              )}
            </div>
          </>
        );
      })()}

    </div>
  );
}
