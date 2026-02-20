/**
 * Supabase-backed Insights diagnostic.
 *
 * Fetches real lessons/students from Supabase for a date range, computes
 * "DB ground truth" (counts, sum amount_cents), and runs the same logic
 * as the Insights truth layer. Reports whether the DB or the app logic
 * is the issue (e.g. $0 with 55 completed lessons → sum_zero_with_rows).
 *
 * Usage:
 *   npx tsx scripts/insights-diagnostic.ts --user-id <uuid> [--start YYYY-MM-DD] [--end YYYY-MM-DD]
 *
 * Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (from .env / .env.local).
 * Optional: pass USER_ID in env if you don't want to pass --user-id.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** Load .env and .env.local into process.env (VITE_* and others). */
function loadEnv(): void {
  for (const name of [".env", ".env.local"]) {
    const p = path.join(ROOT, name);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function toDateOnly(date: unknown): string {
  const s = typeof date === "string" ? date : String(date ?? "");
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

type LessonRow = {
  id: string;
  student_id: string;
  lesson_date: string;
  time_of_day: string | null;
  duration_minutes: number;
  amount_cents: number;
  completed: boolean;
  note: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  duration_minutes: number;
  rate_cents: number;
  day_of_week: number;
  time_of_day: string | null;
};

async function fetchLessonsInRange(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string
): Promise<LessonRow[]> {
  const { data, error } = await supabase
    .from("lessons")
    .select("id, student_id, lesson_date, time_of_day, duration_minutes, amount_cents, completed, note")
    .eq("user_id", userId)
    .gte("lesson_date", start)
    .lte("lesson_date", end)
    .order("lesson_date", { ascending: true });

  if (error) throw new Error(`Lessons fetch failed: ${error.message}`);
  return (data ?? []) as LessonRow[];
}

async function fetchStudents(supabase: SupabaseClient, userId: string): Promise<StudentRow[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, first_name, last_name, duration_minutes, rate_cents, day_of_week, time_of_day")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Students fetch failed: ${error.message}`);
  return (data ?? []) as StudentRow[];
}

/** Same date filter and aggregation as truthQueries.runTruthQuery(earnings_in_period). */
function computeEarningsInPeriod(
  lessons: LessonRow[],
  start: string,
  end: string
): {
  totalInRange: number;
  completedInRange: number;
  totalCentsAll: number;
  totalCentsCompleted: number;
  zeroCause: string | null;
  sampleRows: { date: string; completed: boolean; amount_cents: number }[];
} {
  const inRange = lessons.filter((l) => {
    const d = toDateOnly(l.lesson_date);
    return d >= start && d <= end;
  });
  const completed = inRange.filter((l) => l.completed);
  const totalCentsAll = inRange.reduce((s, l) => s + (l.amount_cents ?? 0), 0);
  const totalCentsCompleted = completed.reduce((s, l) => s + (l.amount_cents ?? 0), 0);

  let zeroCause: string | null = null;
  if (totalCentsCompleted === 0) {
    if (inRange.length === 0) zeroCause = "no_rows_in_range";
    else if (completed.length === 0) zeroCause = "no_completed_lessons_in_range";
    else zeroCause = "sum_zero_with_rows";
  }

  const sampleRows = inRange.slice(0, 10).map((l) => ({
    date: toDateOnly(l.lesson_date),
    completed: l.completed,
    amount_cents: l.amount_cents ?? 0,
  }));

  return {
    totalInRange: inRange.length,
    completedInRange: completed.length,
    totalCentsAll,
    totalCentsCompleted,
    zeroCause,
    sampleRows,
  };
}

/** Aggregates by completed vs not (for report). */
function aggregateByCompleted(lessons: LessonRow[]): { completed: boolean; count: number; total_cents: number }[] {
  const byFlag = new Map<boolean, { count: number; cents: number }>();
  for (const l of lessons) {
    const c = l.completed;
    const entry = byFlag.get(c) ?? { count: 0, cents: 0 };
    entry.count += 1;
    entry.cents += l.amount_cents ?? 0;
    byFlag.set(c, entry);
  }
  return [
    { completed: true, count: byFlag.get(true)?.count ?? 0, total_cents: byFlag.get(true)?.cents ?? 0 },
    { completed: false, count: byFlag.get(false)?.count ?? 0, total_cents: byFlag.get(false)?.cents ?? 0 },
  ];
}

function parseArgs(): { userId: string; start: string; end: string; selfTest: boolean } {
  const args = process.argv.slice(2);
  let userId = process.env.USER_ID ?? "";
  let start = "2026-01-01";
  let end = "2026-01-31";
  let selfTest = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--self-test") {
      selfTest = true;
    } else if (args[i] === "--user-id" && args[i + 1]) {
      userId = args[i + 1];
      i++;
    } else if (args[i] === "--start" && args[i + 1]) {
      start = args[i + 1];
      i++;
    } else if (args[i] === "--end" && args[i + 1]) {
      end = args[i + 1];
      i++;
    }
  }

  if (!selfTest && !userId) {
    console.error("Usage: npx tsx scripts/insights-diagnostic.ts --user-id <uuid> [--start YYYY-MM-DD] [--end YYYY-MM-DD]");
    console.error("   Or set USER_ID in .env / .env.local");
    console.error("   Or run with --self-test to verify logic against seed data (no Supabase).");
    process.exit(1);
  }
  return { userId, start, end, selfTest };
}

/** Seed lessons for Jan 2026 matching test-insights.ts (2 lessons, 32000 cents). */
const SEED_JAN_2026: LessonRow[] = [
  { id: "1", student_id: "s1", lesson_date: "2026-01-03", time_of_day: null, duration_minutes: 90, amount_cents: 18000, completed: true, note: null },
  { id: "2", student_id: "s2", lesson_date: "2026-01-15", time_of_day: null, duration_minutes: 75, amount_cents: 14000, completed: true, note: null },
];

function runSelfTest(): void {
  console.log("\n--- Self-test (seed data, no Supabase) ---\n");
  const ground = computeEarningsInPeriod(SEED_JAN_2026, "2026-01-01", "2026-01-31");
  const ok = ground.completedInRange === 2 && ground.totalCentsCompleted === 32000 && ground.zeroCause === null;
  console.log("  completedInRange:", ground.completedInRange, "(expected 2)");
  console.log("  totalCentsCompleted:", ground.totalCentsCompleted, "(expected 32000)");
  console.log("  zero_cause:", ground.zeroCause);
  if (ok) {
    console.log("\n  Self-test PASSED.\n");
  } else {
    console.error("\n  Self-test FAILED.\n");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const { userId, start, end, selfTest } = parseArgs();

  if (selfTest) {
    runSelfTest();
    return;
  }

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env / .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, anonKey);

  console.log("\n--- Insights diagnostic (Supabase-backed) ---\n");
  console.log("User ID:", userId);
  console.log("Date range:", start, "..", end);
  console.log("");

  const [lessons, students] = await Promise.all([
    fetchLessonsInRange(supabase, userId, start, end),
    fetchStudents(supabase, userId),
  ]);

  console.log("DB fetch:");
  console.log("  Lessons in range:", lessons.length);
  console.log("  Students:", students.length);

  const byCompleted = aggregateByCompleted(lessons);
  console.log("\nLessons in range by completed flag:");
  for (const row of byCompleted) {
    console.log(`  completed=${row.completed}: count=${row.count}, total_cents=${row.total_cents}`);
  }

  const ground = computeEarningsInPeriod(lessons, start, end);
  const totalDollars = Math.round((ground.totalCentsCompleted / 100) * 100) / 100;

  console.log("\nGround truth (same logic as Insights truth layer):");
  console.log("  totalInRange:", ground.totalInRange);
  console.log("  completedInRange:", ground.completedInRange);
  console.log("  total_cents (completed only):", ground.totalCentsCompleted);
  console.log("  total_dollars:", totalDollars);
  console.log("  zero_cause:", ground.zeroCause ?? "(none)");

  if (ground.sampleRows.length > 0) {
    console.log("\nSample rows (first 10 in range):");
    for (const r of ground.sampleRows) {
      console.log(`  ${r.date}  completed=${r.completed}  amount_cents=${r.amount_cents}`);
    }
  }

  console.log("\n--- Summary ---");
  if (ground.zeroCause === "no_rows_in_range") {
    console.log("DB has no lessons in this date range. Check lesson_date and user_id.");
  } else if (ground.zeroCause === "no_completed_lessons_in_range") {
    console.log("DB has lessons in range but none with completed=true. Insights only sums completed lessons.");
  } else if (ground.zeroCause === "sum_zero_with_rows") {
    console.log("DB has completed lessons in range but amount_cents sum is 0.");
    console.log("If the Earnings chart shows non-zero, it may be using student rate × duration; Insights uses stored amount_cents.");
    console.log("Fix: backfill amount_cents on lessons, or use the same fallback in Insights.");
  } else {
    console.log("DB and truth logic agree: non-zero earnings in range.");
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
