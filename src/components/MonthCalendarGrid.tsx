import { IconButton } from "@/components/ui/Button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/Icons";
import { toDateKey } from "@/utils/earnings";
import "../pages/calendar.css";

const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export interface MonthCalendarGridProps {
  month: Date;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  disableDate?: (date: Date) => boolean;
}

/** Reusable month grid card matching Calendar page UI (grid-header, weekdays, date cells). */
export default function MonthCalendarGrid({
  month,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  disableDate,
}: MonthCalendarGridProps) {
  const dateKey = selectedDate ? toDateKey(selectedDate) : null;
  const gridYear = month.getFullYear();
  const gridMonth = month.getMonth();
  const gridFirst = new Date(gridYear, gridMonth, 1);
  const gridStart = new Date(gridFirst);
  gridStart.setDate(1 - gridFirst.getDay());
  const gridCells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < 28; i++) {
    const d = addDays(gridStart, i);
    gridCells.push({ date: d, isCurrentMonth: d.getMonth() === gridMonth });
  }

  return (
    <div className="calendar-page__grid-card">
      <div className="calendar-page__grid-header">
        <IconButton
          type="button"
          onClick={onPrevMonth}
          variant="ghost"
          size="sm"
          aria-label="Previous month"
        >
          <ChevronLeftIcon />
        </IconButton>
        <span className="calendar-page__grid-month">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <IconButton
          type="button"
          onClick={onNextMonth}
          variant="ghost"
          size="sm"
          aria-label="Next month"
        >
          <ChevronRightIcon />
        </IconButton>
      </div>
      <div className="calendar-page__weekdays">
        {DAYS_SHORT.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="calendar-page__dates">
        {gridCells.map(({ date, isCurrentMonth }) => {
          const key = toDateKey(date);
          const isSelected = key === dateKey;
          const disabled = disableDate?.(date) ?? false;
          return (
            <button
              key={key}
              type="button"
              className={`calendar-page__date-cell ${!isCurrentMonth ? "calendar-page__date-cell--other-month" : ""} ${isSelected ? "calendar-page__date-cell--selected" : ""}`}
              onClick={() => !disabled && onSelectDate(date)}
              disabled={disabled}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
