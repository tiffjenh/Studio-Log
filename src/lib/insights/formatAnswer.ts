/**
 * Short, direct response formatting. Key values bold; bullets for lists.
 * Single value: "$82.50/hr". Entity + value: "Leo Chen — $160/hr".
 */

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatEarningsInPeriod(out: { total_dollars?: number; lesson_count?: number }): string {
  const lessonCount = (out.lesson_count as number | undefined) ?? 0;
  if (lessonCount === 0) return "No completed lessons found for that period.";
  const v = (out.total_dollars as number) ?? 0;
  return fmt(v);
}

export function formatEarningsYtdStudent(out: { student_name?: string; total_dollars?: number }): string {
  const name = out.student_name ?? "That student";
  const v = (out.total_dollars as number) ?? 0;
  return `**${name}** — ${fmt(v)}`;
}

export function formatHighestLowestHourly(out: { student_name?: string; hourly_dollars?: number }): string {
  const name = out.student_name ?? "—";
  const v = (out.hourly_dollars as number) ?? 0;
  return `**${name}** — ${fmt(v)}/hr`;
}

export function formatAverageHourly(out: { hourly_dollars?: number }): string {
  const v = (out.hourly_dollars as number) ?? 0;
  return `${fmt(v)}/hr`;
}

export function formatBelowAverage(
  out: { avg_hourly_dollars?: number; rows?: Array<{ student_name: string; hourly_dollars: number }> }
): string {
  const avg = (out.avg_hourly_dollars as number) ?? 0;
  const rows = (out.rows as Array<{ student_name: string; hourly_dollars: number }>) ?? [];
  if (rows.length === 0) return `No students below average (${fmt(avg)}/hr).`;
  const bullets = rows.map((r) => `• **${r.student_name}** — ${fmt(r.hourly_dollars)}/hr`).join("\n");
  return `**Below average (${fmt(avg)}/hr):**\n${bullets}`;
}

export function formatDayOfWeekMax(out: { dow_label?: string; total_dollars?: number }): string {
  const day = out.dow_label ?? "—";
  const v = (out.total_dollars as number) ?? 0;
  if (!out.dow_label || v <= 0) return "No earnings found in this period.";
  return `**${day}** — ${fmt(v)}`;
}

export function formatMissedMost(out: { student_name?: string; missed_count?: number }, yearLabel?: string): string {
  const name = out.student_name ?? "—";
  const n = (out.missed_count as number) ?? 0;
  const suffix = yearLabel ? ` (${yearLabel})` : "";
  return `**${name}** — ${n} missed lessons${suffix}`;
}

export function formatAttendanceSummary(out: {
  student_name?: string;
  attended_lessons?: number;
  missed_lessons?: number;
  attendance_rate_percent?: number | null;
}): string {
  const name = out.student_name ?? "—";
  const attended = (out.attended_lessons as number) ?? 0;
  const missed = (out.missed_lessons as number) ?? 0;
  const pct = out.attendance_rate_percent != null ? `${out.attendance_rate_percent}%` : "—";
  return `**${name}** — ${attended} attended, ${missed} missed (${pct} attendance)`;
}

export function formatRevenuePerStudent(
  out: { rows?: Array<{ student_name: string; total_dollars: number }> }
): string {
  const rows = (out.rows as Array<{ student_name: string; total_dollars: number }>) ?? [];
  if (rows.length === 0) return "No completed lessons in that period.";
  const bullets = rows.map((r) => `• **${r.student_name}** — ${fmt(r.total_dollars)}`).join("\n");
  return bullets;
}

export function formatLessonsCountInPeriod(out: { lesson_count?: number }): string {
  const n = (out.lesson_count as number | undefined) ?? 0;
  if (n <= 0) return "No completed lessons found for that period.";
  return `${n} completed lesson${n === 1 ? "" : "s"}.`;
}

export function formatRevenuePerLessonInPeriod(out: {
  avg_dollars_per_lesson?: number;
  lesson_count?: number;
}): string {
  const n = (out.lesson_count as number | undefined) ?? 0;
  if (n <= 0) return "No completed lessons found for that period.";
  const v = (out.avg_dollars_per_lesson as number | undefined) ?? 0;
  return `${fmt(v)} per completed lesson (${n} lesson${n === 1 ? "" : "s"}).`;
}

export function formatPercentChangeYoy(out: {
  year_a?: number;
  year_b?: number;
  percent_change?: number | null;
  dollar_change_dollars?: number;
}): string {
  const a = out.year_a ?? 0;
  const b = out.year_b ?? 0;
  const pct = out.percent_change;
  const diff = (out.dollar_change_dollars as number) ?? 0;
  if (pct == null) return `${b} vs ${a}: no change (earlier year had zero earnings).`;
  return `**${b} vs ${a}:** ${pct.toFixed(1)}% (${fmt(diff)} difference)`;
}

export function formatForecast(out: {
  projected_monthly_dollars?: number | null;
  projected_yearly_dollars?: number | null;
}): string {
  const monthly = out.projected_monthly_dollars;
  const yearly = out.projected_yearly_dollars;
  if (monthly != null && yearly != null) return `${fmt(monthly)}/month · ${fmt(yearly)}/year`;
  if (monthly != null) return `${fmt(monthly)}/month`;
  if (yearly != null) return `${fmt(yearly)}/year`;
  return "Not enough data to project.";
}
