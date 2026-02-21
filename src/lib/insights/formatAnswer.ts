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

export function formatCompletedMost(out: { student_name?: string; completed_count?: number }, yearLabel?: string): string {
  const name = out.student_name ?? "—";
  const n = (out.completed_count as number) ?? 0;
  const suffix = yearLabel ? ` (${yearLabel})` : "";
  return `**${name}** — ${n} completed lessons${suffix}`;
}

export function formatUniqueStudentCount(out: { student_count?: number }): string {
  const n = (out.student_count as number | undefined) ?? 0;
  return `${n} unique student${n === 1 ? "" : "s"} taught.`;
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
  out: {
    rows?: Array<{ student_name: string; total_dollars: number }>;
    requested_top_n?: number | null;
    available_count?: number;
  }
): string {
  const rows = (out.rows as Array<{ student_name: string; total_dollars: number }>) ?? [];
  if (rows.length === 0) return "No completed lessons in that period.";
  const bullets = rows.map((r) => `• **${r.student_name}** — ${fmt(r.total_dollars)}`).join("\n");
  const requestedTopN = typeof out.requested_top_n === "number" ? out.requested_top_n : null;
  const available = (out.available_count as number | undefined) ?? rows.length;
  if (requestedTopN && available < requestedTopN) {
    return `${bullets}\n\nOnly ${available} student${available === 1 ? "" : "s"} had revenue in this period.`;
  }
  return bullets;
}

export function formatLessonsCountInPeriod(out: { lesson_count?: number }): string {
  const n = (out.lesson_count as number | undefined) ?? 0;
  if (n <= 0) return "No completed lessons found for that period.";
  return `${n} completed lesson${n === 1 ? "" : "s"}.`;
}

export function formatHoursTotalInPeriod(out: { total_hours?: number; lesson_count?: number }): string {
  const lessonCount = (out.lesson_count as number | undefined) ?? 0;
  if (lessonCount <= 0) return "No completed lessons found for that period.";
  const hours = (out.total_hours as number | undefined) ?? 0;
  return `${hours.toLocaleString("en-US", { maximumFractionDigits: 2 })} hours across ${lessonCount} completed lesson${lessonCount === 1 ? "" : "s"}.`;
}

export function formatAvgLessonsPerWeekInPeriod(out: {
  avg_lessons_per_week?: number;
  weeks_count?: number;
  lesson_count?: number;
}): string {
  const weeks = (out.weeks_count as number | undefined) ?? 0;
  const lessons = (out.lesson_count as number | undefined) ?? 0;
  if (weeks <= 0 || lessons <= 0) return "No completed lessons found for that period.";
  const avg = (out.avg_lessons_per_week as number | undefined) ?? 0;
  return `${avg.toLocaleString("en-US", { maximumFractionDigits: 2 })} lessons/week on average (${lessons} lessons over ${weeks} week${weeks === 1 ? "" : "s"}).`;
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

export function formatAvgWeeklyRevenue(out: { avg_weekly_dollars?: number; weeks_count?: number }): string {
  const v = (out.avg_weekly_dollars as number | undefined) ?? 0;
  const n = (out.weeks_count as number | undefined) ?? 0;
  if (n <= 0) return "No completed lessons found for that period.";
  return `${fmt(v)} average per week (${n} week${n === 1 ? "" : "s"}).`;
}

export function formatCashFlowTrend(out: {
  direction?: "up" | "down" | "flat";
  weekly_series?: Array<{ start_date: string; total_dollars: number }>;
}): string {
  const series = (out.weekly_series as Array<{ start_date: string; total_dollars: number }>) ?? [];
  if (series.length === 0) return "No completed lessons found for that period.";
  const direction = out.direction ?? "flat";
  const directionLabel = direction === "up" ? "upward" : direction === "down" ? "downward" : "flat";
  const bullets = series
    .slice(-5)
    .map((p) => `• ${p.start_date} — ${fmt(p.total_dollars)}`)
    .join("\n");
  return `**Cash flow trend:** ${directionLabel}\n${bullets}`;
}

export function formatWhatIfRateChange(out: {
  rate_delta_dollars_per_hour?: number;
  total_hours?: number;
  current_total_dollars?: number;
  projected_total_dollars?: number;
  delta_dollars?: number;
  lesson_count?: number;
}): string {
  const delta = (out.rate_delta_dollars_per_hour as number | undefined) ?? 0;
  const hours = (out.total_hours as number | undefined) ?? 0;
  const current = (out.current_total_dollars as number | undefined) ?? 0;
  const projected = (out.projected_total_dollars as number | undefined) ?? 0;
  const deltaDollars = (out.delta_dollars as number | undefined) ?? 0;
  const lessons = (out.lesson_count as number | undefined) ?? 0;
  if (!delta || hours <= 0 || lessons <= 0) return "Not enough completed lesson history to simulate that rate change.";
  return `If you change rates by **$${delta}/hr**, you’d add about **${fmt(deltaDollars)}** over ${hours.toFixed(1)} hours.\nCurrent: ${fmt(current)}\nProjected: ${fmt(projected)}`;
}

export function formatWhatIfAddStudents(out: {
  new_students?: number;
  avg_weekly_dollars?: number;
  avg_weekly_per_student_dollars?: number;
  delta_weekly_dollars?: number;
  projected_weekly_dollars?: number;
  weeks_count?: number;
  active_students?: number;
}): string {
  const n = (out.new_students as number | undefined) ?? 0;
  const avg = (out.avg_weekly_dollars as number | undefined) ?? 0;
  const per = (out.avg_weekly_per_student_dollars as number | undefined) ?? 0;
  const delta = (out.delta_weekly_dollars as number | undefined) ?? 0;
  const projected = (out.projected_weekly_dollars as number | undefined) ?? 0;
  const weeks = (out.weeks_count as number | undefined) ?? 0;
  const active = (out.active_students as number | undefined) ?? 0;
  if (!n || weeks <= 0 || active <= 0) return "Not enough history to model adding students yet.";
  return `Based on ${weeks} weeks of history, you average ${fmt(avg)}/week (~${fmt(per)}/week per active student).\nAdding **${n}** similar student${n === 1 ? "" : "s"} could add about **${fmt(delta)}/week**.\nProjected: ${fmt(projected)}/week.`;
}

export function formatWhatIfTakeTimeOff(out: {
  weeks_off?: number;
  avg_weekly_dollars?: number;
  expected_lost_dollars?: number;
  weeks_count?: number;
}): string {
  const weeksOff = (out.weeks_off as number | undefined) ?? 0;
  const avg = (out.avg_weekly_dollars as number | undefined) ?? 0;
  const lost = (out.expected_lost_dollars as number | undefined) ?? 0;
  const weeks = (out.weeks_count as number | undefined) ?? 0;
  if (!weeksOff || weeks <= 0) return "Not enough history to estimate time-off impact yet.";
  return `You average about ${fmt(avg)}/week.\nTaking **${weeksOff}** week${weeksOff === 1 ? "" : "s"} off would reduce yearly earnings by roughly **${fmt(lost)}** (assuming similar schedule).`;
}

export function formatWhatIfLoseTopStudents(out: {
  top_n?: number;
  lost_students?: Array<{ student_name: string; total_dollars: number }>;
  lost_total_dollars?: number;
  current_total_dollars?: number;
  projected_total_dollars?: number;
}): string {
  const n = (out.top_n as number | undefined) ?? 0;
  const rows = (out.lost_students as Array<{ student_name: string; total_dollars: number }>) ?? [];
  const lost = (out.lost_total_dollars as number | undefined) ?? 0;
  const current = (out.current_total_dollars as number | undefined) ?? 0;
  const projected = (out.projected_total_dollars as number | undefined) ?? 0;
  if (!n || rows.length === 0) return "Not enough data to identify top students for that period.";
  const bullets = rows.map((r) => `• **${r.student_name}** — ${fmt(r.total_dollars)}`).join("\n");
  return `If you lose your top **${n}** student${n === 1 ? "" : "s"} in this period:\n${bullets}\n\nLost: **${fmt(lost)}**\nCurrent: ${fmt(current)}\nProjected: ${fmt(projected)}`;
}

export function formatOnTrackGoal(out: {
  ytd_dollars?: number;
  annual_goal_dollars?: number;
  projected_total_dollars?: number;
  delta_to_goal_dollars?: number;
  required_per_week_dollars?: number | null;
  required_per_month_dollars?: number | null;
  lesson_count?: number;
}): string {
  const ytd = (out.ytd_dollars as number | undefined) ?? 0;
  const goal = (out.annual_goal_dollars as number | undefined) ?? 0;
  const projected = (out.projected_total_dollars as number | undefined) ?? 0;
  const delta = (out.delta_to_goal_dollars as number | undefined) ?? 0;
  const perWeek = out.required_per_week_dollars;
  const perMonth = out.required_per_month_dollars;
  const lessons = (out.lesson_count as number | undefined) ?? 0;

  if (lessons === 0) return "No completed lessons yet this year, so I can't project annual earnings.";
  if (!goal) return "What annual goal should I use (e.g. $80,000)?";

  if (delta >= 0) {
    const line = `YTD you've earned **${fmt(ytd)}**. At this run rate you're on track for **${fmt(projected)}** this year — **${fmt(delta)}** above your **${fmt(goal)}** goal.`;
    return line;
  }
  const need = Math.abs(delta);
  const weekLine = perWeek != null && perWeek > 0 ? ` About **${fmt(perWeek)}/week** for the rest of the year would close the gap.` : "";
  const monthLine = perMonth != null && perMonth > 0 && (perWeek == null || perWeek <= 0) ? ` About **${fmt(perMonth)}/month** for the rest of the year would close the gap.` : "";
  return `YTD you've earned **${fmt(ytd)}**. At this run rate you're projected at **${fmt(projected)}** — **${fmt(need)}** short of your **${fmt(goal)}** goal.${weekLine}${monthLine}`;
}

export function formatStudentsNeededForTargetIncome(out: {
  target_income_dollars?: number;
  rate_dollars_per_hour?: number;
  typical_weekly_hours_per_student?: number;
  projected_income_per_student_year_dollars?: number;
  students_needed?: number;
}): string {
  const target = (out.target_income_dollars as number | undefined) ?? 0;
  const rate = (out.rate_dollars_per_hour as number | undefined) ?? 0;
  const hours = (out.typical_weekly_hours_per_student as number | undefined) ?? 0;
  const perYear = (out.projected_income_per_student_year_dollars as number | undefined) ?? 0;
  const needed = (out.students_needed as number | undefined) ?? 0;
  if (!target || !rate || !hours || !perYear || !needed) return "Not enough history to estimate students needed yet.";
  return `At **$${rate}/hr**, your typical student averages about **${hours.toFixed(2)} hrs/week**.\nThat’s about **${fmt(perYear)} per student/year**.\nTo reach **${fmt(target)}**, you’d need about **${needed}** students (at a similar schedule).`;
}

export function formatTaxGuidance(out: {
  total_dollars?: number;
  suggested_set_aside_low_dollars?: number;
  suggested_set_aside_high_dollars?: number;
  note?: string;
  lesson_count?: number;
}): string {
  const total = (out.total_dollars as number | undefined) ?? 0;
  const low = (out.suggested_set_aside_low_dollars as number | undefined) ?? 0;
  const high = (out.suggested_set_aside_high_dollars as number | undefined) ?? 0;
  const note = (out.note as string | undefined) ?? "";
  const lessons = (out.lesson_count as number | undefined) ?? 0;
  if (lessons <= 0) return "No completed lessons found for that period.";
  return `**Tax set-aside guidance**\nA common safe range is **25–30%** of income.\nOn ${fmt(total)} earnings, that’s **${fmt(low)}–${fmt(high)}** to set aside.\n${note}`.trim();
}

export function formatIncomeStability(out: {
  stability_label?: "stable" | "moderate" | "volatile" | "insufficient_data";
  coefficient_of_variation?: number | null;
  weeks_count?: number;
}): string {
  const label = out.stability_label ?? "insufficient_data";
  const weeks = (out.weeks_count as number | undefined) ?? 0;
  if (label === "insufficient_data" || weeks < 2) {
    return "Not enough weekly data to assess stability.";
  }
  const cv = out.coefficient_of_variation != null ? `${(out.coefficient_of_variation * 100).toFixed(1)}%` : "n/a";
  if (label === "stable") return `Income looks **stable** (variation ${cv}).`;
  if (label === "volatile") return `Income looks **volatile** (variation ${cv}).`;
  return `Income is **moderately variable** (variation ${cv}).`;
}
