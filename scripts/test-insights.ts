import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateInsightsQuestion, type InsightsGeneratedQuestion, type InsightsEvaluationRow } from "../src/lib/insights/evaluator";
import type { EarningsRow, StudentSummary } from "../src/lib/forecasts/types";
import type { Lesson, Student } from "../src/types";
import { INSIGHTS_CATEGORIES } from "../src/pages/insightsConstants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUESTIONS_PATH = path.resolve(ROOT, "tests", "insights_questions.generated.json");
const REPORT_JSON = path.resolve(ROOT, "tests", "insights_report.json");
const REPORT_MD = path.resolve(ROOT, "tests", "insights_report.md");

function csvEscape(v: string): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function toCsvRow(row: InsightsEvaluationRow): string {
  const diff =
    row.verdict === "FAIL" && row.expected_metric_value !== row.got_metric_value
      ? `expected=${row.expected_metric_value} got=${row.got_metric_value}`
      : "";
  return [
    csvEscape(row.question),
    csvEscape(row.detected_intent),
    csvEscape(row.sql_truth_query_key),
    csvEscape(row.expected_metric_value),
    csvEscape(row.got_metric_value),
    row.verdict,
    csvEscape(row.fail_reasons.join("; ")),
    csvEscape(diff),
    csvEscape(row.llm_answer.slice(0, 120)),
  ].join(",");
}

const SEED_EARNINGS: EarningsRow[] = [
  { date: "2024-01-05", amount: 95, customer: "Leo Chen", studentId: "s1", durationMinutes: 60 },
  { date: "2024-02-12", amount: 120, customer: "Noah Nguyen", studentId: "s2", durationMinutes: 75 },
  { date: "2024-03-02", amount: 80, customer: "Alice Wu", studentId: "s3", durationMinutes: 60 },
  { date: "2024-06-18", amount: 140, customer: "Leo Chen", studentId: "s1", durationMinutes: 90 },
  { date: "2024-08-22", amount: 110, customer: "Noah Nguyen", studentId: "s2", durationMinutes: 60 },
  { date: "2024-10-11", amount: 85, customer: "Ava Park", studentId: "s4", durationMinutes: 60 },
  { date: "2025-01-09", amount: 130, customer: "Leo Chen", studentId: "s1", durationMinutes: 90 },
  { date: "2025-02-14", amount: 150, customer: "Noah Nguyen", studentId: "s2", durationMinutes: 90 },
  { date: "2025-03-07", amount: 90, customer: "Alice Wu", studentId: "s3", durationMinutes: 60 },
  { date: "2025-04-19", amount: 160, customer: "Leo Chen", studentId: "s1", durationMinutes: 90 },
  { date: "2025-06-03", amount: 125, customer: "Ava Park", studentId: "s4", durationMinutes: 75 },
  { date: "2025-09-21", amount: 170, customer: "Noah Nguyen", studentId: "s2", durationMinutes: 90 },
  { date: "2025-11-29", amount: 100, customer: "Alice Wu", studentId: "s3", durationMinutes: 60 },
  { date: "2026-01-03", amount: 180, customer: "Leo Chen", studentId: "s1", durationMinutes: 90 },
  { date: "2026-01-15", amount: 140, customer: "Noah Nguyen", studentId: "s2", durationMinutes: 75 },
  { date: "2026-02-02", amount: 95, customer: "Alice Wu", studentId: "s3", durationMinutes: 60 },
  { date: "2026-02-23", amount: 130, customer: "Ava Park", studentId: "s4", durationMinutes: 75 },
  { date: "2026-03-11", amount: 190, customer: "Leo Chen", studentId: "s1", durationMinutes: 90 },
  { date: "2026-03-25", amount: 150, customer: "Noah Nguyen", studentId: "s2", durationMinutes: 90 },
];

const SEED_STUDENTS: StudentSummary[] = [
  { id: "s1", name: "Leo Chen", rateCents: 12000, durationMinutes: 90 },
  { id: "s2", name: "Noah Nguyen", rateCents: 10000, durationMinutes: 75 },
  { id: "s3", name: "Alice Wu", rateCents: 8500, durationMinutes: 60 },
  { id: "s4", name: "Ava Park", rateCents: 9000, durationMinutes: 75 },
];

/** Build Lesson[] and Student[] from seed so runTruthQuery uses in-memory data (deterministic truth). */
function buildSeedContext(): { lessons: Lesson[]; roster: Student[] } {
  const lessons: Lesson[] = SEED_EARNINGS.map((e, i) => ({
    id: `lesson-${i}`,
    studentId: e.studentId,
    date: e.date,
    durationMinutes: e.durationMinutes,
    amountCents: Math.round(e.amount * 100),
    completed: true,
  }));
  const roster: Student[] = SEED_STUDENTS.map((s) => {
    const parts = s.name.split(" ");
    const firstName = parts[0] ?? s.name;
    const lastName = parts.slice(1).join(" ") ?? "";
    return {
      id: s.id,
      firstName,
      lastName,
      rateCents: s.rateCents,
      durationMinutes: s.durationMinutes,
      dayOfWeek: 0,
      timeOfDay: "12:00 PM",
    };
  });
  return { lessons, roster };
}

/** Build InsightsGeneratedQuestion[] from INSIGHTS_CATEGORIES (all category questions). */
function buildCategoryQuestions(): InsightsGeneratedQuestion[] {
  const out: InsightsGeneratedQuestion[] = [];
  for (const cat of INSIGHTS_CATEGORIES) {
    const slug = cat.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    cat.questions.forEach((text, i) => {
      out.push({
        id: `cat-${slug}-${i}`,
        language: "en",
        text,
        notes: `Category: ${cat.label}`,
      });
    });
  }
  return out;
}

function summarize(rows: InsightsEvaluationRow[]) {
  const total = rows.length;
  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const fail = total - pass;
  const reasonCounts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of row.fail_reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  const sortedReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);
  return { total, pass, fail, reasonCounts: sortedReasons };
}

/** Per-intent pass/fail breakdown — shows which intents are weakest. */
function intentBreakdown(rows: InsightsEvaluationRow[]): Map<string, { pass: number; fail: number; total: number }> {
  const byIntent = new Map<string, { pass: number; fail: number; total: number }>();
  for (const row of rows) {
    const key = row.expected_intent ?? row.detected_intent;
    const entry = byIntent.get(key) ?? { pass: 0, fail: 0, total: 0 };
    entry.total++;
    if (row.verdict === "PASS") entry.pass++;
    else entry.fail++;
    byIntent.set(key, entry);
  }
  return byIntent;
}

/**
 * Paraphrase coverage: for each expected_intent, check if all questions with that
 * expected intent were routed to the same (correct) intent.
 * Highlights cases where the same intent is mapped inconsistently.
 */
function paraphraseReport(rows: InsightsEvaluationRow[]): string[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.expected_intent;
    if (!key || key === "clarification") continue;
    const detected = groups.get(key) ?? [];
    detected.push(row.detected_intent);
    groups.set(key, detected);
  }
  const lines: string[] = [];
  for (const [expected, detected] of [...groups.entries()].sort()) {
    const total = detected.length;
    const correct = detected.filter((d) => d === expected).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const status = pct === 100 ? "✓" : pct >= 75 ? "~" : "✗";
    const wrong = detected.filter((d) => d !== expected);
    const wrongCounts = wrong.reduce<Record<string, number>>((acc, d) => { acc[d] = (acc[d] ?? 0) + 1; return acc; }, {});
    const wrongStr = Object.entries(wrongCounts).map(([k, v]) => `${k}×${v}`).join(", ");
    lines.push(`${status} ${expected}: ${correct}/${total} (${pct}%)${wrongStr ? `  → misrouted: ${wrongStr}` : ""}`);
  }
  return lines;
}

function markdownReport(rows: InsightsEvaluationRow[]) {
  const summary = summarize(rows);
  const topFails = rows.filter((r) => r.verdict === "FAIL").slice(0, 10);
  const breakdown = intentBreakdown(rows);
  const paraphrase = paraphraseReport(rows);

  const lines: string[] = [];
  lines.push("# Insights Strict Test Report");
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push("");
  lines.push(`- **Total:** ${summary.total}`);
  lines.push(`- **Pass:** ${summary.pass} (${Math.round((summary.pass / summary.total) * 100)}%)`);
  lines.push(`- **Fail:** ${summary.fail}`);
  lines.push("");

  lines.push("## Fail Reason Distribution");
  lines.push("");
  if (summary.reasonCounts.length === 0) lines.push("- None");
  else for (const [reason, count] of summary.reasonCounts) lines.push(`- \`${reason}\`: ${count}`);
  lines.push("");

  lines.push("## Intent Accuracy (Per-Intent Breakdown)");
  lines.push("");
  lines.push("| intent | pass | fail | total | % |");
  lines.push("|--------|------|------|-------|---|");
  for (const [intent, counts] of [...breakdown.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const pct = Math.round((counts.pass / counts.total) * 100);
    lines.push(`| ${intent} | ${counts.pass} | ${counts.fail} | ${counts.total} | ${pct}% |`);
  }
  lines.push("");

  lines.push("## Paraphrase Coverage (Intent Routing Consistency)");
  lines.push("```");
  lines.push("✓ = 100%  ~ = ≥75%  ✗ = <75%");
  lines.push("");
  for (const l of paraphrase) lines.push(l);
  lines.push("```");
  lines.push("");

  lines.push("## Top Failing Questions");
  lines.push("");
  if (topFails.length === 0) lines.push("- None");
  else {
    for (const row of topFails) {
      lines.push(`- **${row.id}** ${row.question}`);
      lines.push(`  - Expected: \`${row.expected_intent ?? "—"}\` → Detected: \`${row.detected_intent}\``);
      lines.push(`  - Fail reasons: ${row.fail_reasons.join(", ")}`);
      lines.push(`  - Answer: ${row.llm_answer.slice(0, 120)}`);
    }
  }
  lines.push("");

  lines.push("## All Rows (first 40)");
  lines.push("");
  lines.push("| id | verdict | expected | detected | truth_key |");
  lines.push("|---|---|---|---|---|");
  for (const row of rows.slice(0, 40)) {
    lines.push(`| ${row.id} | ${row.verdict} | ${row.expected_intent ?? "—"} | ${row.detected_intent} | ${row.sql_truth_query_key} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const timezone = "America/Los_Angeles";
  const { lessons, roster } = buildSeedContext();
  const ctx = {
    earnings: SEED_EARNINGS,
    students: SEED_STUDENTS,
    lessons,
    roster,
    timezone,
  };
  const rows: InsightsEvaluationRow[] = [];

  // 1) Run all category questions (standalone)
  const categoryQuestions = buildCategoryQuestions();
  console.log(`Running ${categoryQuestions.length} category questions...`);
  for (const q of categoryQuestions) {
    const { row } = await evaluateInsightsQuestion(q, { ...ctx, locale: "en-US" });
    rows.push(row);
  }

  // 2) Load and run all questions from the generated JSON (standalone + conversation groups)
  const raw = await fs.readFile(QUESTIONS_PATH, "utf8");
  const jsonQuestions = JSON.parse(raw) as InsightsGeneratedQuestion[];
  console.log(`Running ${jsonQuestions.length} JSON questions...`);

  const groups = new Map<string, InsightsGeneratedQuestion[]>();
  const standalone: InsightsGeneratedQuestion[] = [];
  for (const q of jsonQuestions) {
    if (q.conversation_group) {
      const arr = groups.get(q.conversation_group) ?? [];
      arr.push(q);
      groups.set(q.conversation_group, arr);
    } else {
      standalone.push(q);
    }
  }

  for (const q of standalone) {
    const { row } = await evaluateInsightsQuestion(
      q,
      { ...ctx, locale: q.language === "es" ? "es-ES" : q.language === "zh" ? "zh-CN" : "en-US" }
    );
    rows.push(row);
  }

  for (const [, conversationQs] of groups) {
    let priorContext = undefined;
    for (const q of conversationQs) {
      const out = await evaluateInsightsQuestion(
        q,
        { ...ctx, locale: q.language === "es" ? "es-ES" : q.language === "zh" ? "zh-CN" : "en-US" },
        priorContext
      );
      rows.push(out.row);
      priorContext = out.nextContext;
    }
  }

  await fs.mkdir(path.resolve(ROOT, "tests"), { recursive: true });
  await fs.writeFile(REPORT_JSON, JSON.stringify(rows, null, 2), "utf8");
  await fs.writeFile(REPORT_MD, markdownReport(rows), "utf8");

  const csvHeaders = "Question,Detected Intent,Truth Query Key,Expected Metric Value,Got Metric Value,Verdict,Fail Reasons,Diff,Response Preview";
  const csvPath = path.resolve(ROOT, "tests", `insights-test-results-${new Date().toISOString().slice(0, 10)}.csv`);
  await fs.writeFile(csvPath, [csvHeaders, ...rows.map(toCsvRow)].join("\n"), "utf8");
  console.log(`CSV report: ${csvPath}`);

  const summary = summarize(rows);
  const passRate = Math.round((summary.pass / summary.total) * 100);
  console.log(`\nInsights test summary: ${summary.pass}/${summary.total} passed (${passRate}%)`);

  console.log("\nTop fail reasons:");
  for (const [reason, count] of summary.reasonCounts.slice(0, 10)) {
    console.log(`  ${reason}: ${count}`);
  }

  console.log("\nIntent routing accuracy (per-intent):");
  const breakdown = intentBreakdown(rows);
  for (const [intent, counts] of [...breakdown.entries()]
    .filter(([, c]) => c.total >= 2)
    .sort((a, b) => a[1].pass / a[1].total - b[1].pass / b[1].total)
    .slice(0, 12)) {
    const pct = Math.round((counts.pass / counts.total) * 100);
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    console.log(`  ${bar} ${pct}%  ${intent} (${counts.pass}/${counts.total})`);
  }

  console.log("\nParaphrase coverage:");
  for (const line of paraphraseReport(rows)) {
    console.log(`  ${line}`);
  }

  const topFails = rows.filter((r) => r.verdict === "FAIL").slice(0, 5);
  if (topFails.length > 0) {
    console.log("\nTop 5 failing questions:");
    for (const row of topFails) {
      console.log(`  ${row.id}: ${row.question}`);
      console.log(`    expected=${row.expected_intent ?? "—"} detected=${row.detected_intent}`);
      console.log(`    reasons: ${row.fail_reasons.join(", ")}`);
    }
  }

  console.log(`\nReports written to tests/insights_report.{json,md}`);

  if (summary.fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Failed to run strict insights tests:", err);
  process.exit(1);
});

