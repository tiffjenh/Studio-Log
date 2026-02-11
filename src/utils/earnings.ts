import type { Lesson, Student } from "@/types";

export function formatCurrency(cents: number): string {
  return "$" + (cents / 100).toFixed(0);
}

export function getWeekBounds(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getMonthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function earnedThisWeek(lessons: Lesson[], ref: Date): number {
  const { start, end } = getWeekBounds(ref);
  return lessons
    .filter((l) => l.completed && l.date >= toDateKey(start) && l.date <= toDateKey(end))
    .reduce((sum, l) => sum + l.amountCents, 0);
}

export function potentialThisWeek(students: Student[], ref: Date): number {
  const { start, end } = getWeekBounds(ref);
  let total = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayNum = d.getDay();
    students.filter((s) => s.dayOfWeek === dayNum).forEach((s) => { total += s.rateCents; });
  }
  return total;
}

export function getStudentsForDay(students: Student[], dayOfWeek: number): Student[] {
  return students
    .filter((s) => s.dayOfWeek === dayOfWeek)
    .sort((a, b) => (a.timeOfDay > b.timeOfDay ? 1 : -1));
}

export function getLessonForStudentOnDate(lessons: Lesson[], studentId: string, dateKey: string): Lesson | undefined {
  return lessons.find((l) => l.studentId === studentId && l.date === dateKey);
}

const DAY_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getWeeklyTotals(
  lessons: Lesson[],
  numWeeks: number,
  ref: Date
): { label: string; dayOfWeek: string; total: number; startKey: string; endKey: string }[] {
  const result: { label: string; dayOfWeek: string; total: number; startKey: string; endKey: string }[] = [];
  for (let w = numWeeks - 1; w >= 0; w--) {
    const d = new Date(ref);
    d.setDate(d.getDate() - w * 7);
    const { start, end } = getWeekBounds(d);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    const total = lessons
      .filter((l) => l.completed && l.date >= startKey && l.date <= endKey)
      .reduce((s, l) => s + l.amountCents, 0);
    const label = `${start.getMonth() + 1}/${start.getDate()}`;
    const dayOfWeek = DAY_ABBREV[start.getDay()];
    result.push({ label, dayOfWeek, total, startKey, endKey });
  }
  return result;
}

/** Returns weeks that overlap the given calendar month (year, month 0–11). */
export function getWeeksInMonth(
  lessons: Lesson[],
  year: number,
  month: number
): { label: string; dayOfWeek: string; total: number; startKey: string; endKey: string }[] {
  const { start: monthStart, end: monthEnd } = getMonthBounds(new Date(year, month));
  const monthStartKey = toDateKey(monthStart);
  const monthEndKey = toDateKey(monthEnd);
  const result: { label: string; dayOfWeek: string; total: number; startKey: string; endKey: string }[] = [];
  let current = new Date(monthStart.getTime());
  while (current <= monthEnd) {
    const { start, end } = getWeekBounds(current);
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    if (startKey <= monthEndKey && endKey >= monthStartKey) {
      const total = lessons
        .filter((l) => l.completed && l.date >= startKey && l.date <= endKey)
        .reduce((s, l) => s + l.amountCents, 0);
      result.push({
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        dayOfWeek: DAY_ABBREV[start.getDay()],
        total,
        startKey,
        endKey,
      });
    }
    current = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  }
  return result;
}

export function getDailyTotals(lessons: Lesson[], numDays: number, ref: Date): { label: string; dayOfWeek: string; total: number }[] {
  const result: { label: string; dayOfWeek: string; total: number }[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setDate(d.getDate() - i);
    const dateKey = toDateKey(d);
    const total = lessons
      .filter((l) => l.completed && l.date === dateKey)
      .reduce((s, l) => s + l.amountCents, 0);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const dayOfWeek = DAY_ABBREV[d.getDay()];
    result.push({ label, dayOfWeek, total });
  }
  return result;
}

/** Week = Sunday–Saturday. Returns 7 days (Sun–Sat) for the week that is weekOffset back from the week containing ref. */
export function getDailyTotalsForWeek(
  lessons: Lesson[],
  ref: Date,
  weekOffset: number
): { label: string; dayOfWeek: string; total: number; dateKey: string }[] {
  const d = new Date(ref);
  d.setDate(d.getDate() + weekOffset * 7);
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - d.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const result: { label: string; dayOfWeek: string; total: number; dateKey: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dateKey = toDateKey(day);
    const total = lessons
      .filter((l) => l.completed && l.date === dateKey)
      .reduce((s, l) => s + l.amountCents, 0);
    result.push({
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      dayOfWeek: DAY_ABBREV[day.getDay()],
      total,
      dateKey,
    });
  }
  return result;
}

export function getYAxisTicks(maxCents: number): number[] {
  if (maxCents <= 0) return [0, 10000];
  const max = Math.ceil(maxCents / 100) * 100;
  let step: number;
  if (max <= 2000) step = 500;
  else if (max <= 5000) step = 1000;
  else if (max <= 20000) step = 5000;
  else if (max <= 50000) step = 10000;
  else if (max <= 100000) step = 20000;
  else step = 50000;
  const ticks: number[] = [0];
  for (let v = step; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(Math.ceil(max / step) * step);
  return ticks;
}
