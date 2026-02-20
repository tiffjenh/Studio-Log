/**
 * Voice pipeline diagnostic matrix (dry-run).
 *
 * Runs a set of representative transcripts through `handleVoiceCommand`
 * and prints a compact QA report:
 *   transcript -> status, intent, updates, creates, message
 *
 * Usage:
 *   npx tsx scripts/voice-diagnostic.ts
 *   npx tsx scripts/voice-diagnostic.ts --json
 *   npx tsx scripts/voice-diagnostic.ts --quiet --case "mason"
 */

import { handleVoiceCommand, type DashboardContext, type DashboardScheduledLesson } from "@/lib/voice/homeVoicePipeline";
import type { Lesson, Student } from "@/types";

type MatrixCase = {
  transcript: string;
  selectedDate: string;
};

type CliOptions = {
  json: boolean;
  quiet: boolean;
  listCases: boolean;
  cases: string[];
};

const STUDENTS: Student[] = [
  { id: "s-leo", firstName: "Leo", lastName: "Garcia", dayOfWeek: 5, timeOfDay: "4:00 PM", durationMinutes: 60, rateCents: 7000 },
  { id: "s-emma-kim", firstName: "Emma", lastName: "Kim", dayOfWeek: 5, timeOfDay: "2:00 PM", durationMinutes: 60, rateCents: 6500 },
  { id: "s-emma-chen", firstName: "Emma", lastName: "Chen", dayOfWeek: 5, timeOfDay: "6:00 PM", durationMinutes: 60, rateCents: 6500 },
  { id: "s-mason", firstName: "Mason", lastName: "Lopez", dayOfWeek: 5, timeOfDay: "7:00 PM", durationMinutes: 60, rateCents: 7000 },
  { id: "s-sofia", firstName: "Sofia", lastName: "Parker", dayOfWeek: 6, timeOfDay: "3:00 PM", durationMinutes: 90, rateCents: 8000 },
];

const LESSONS: Lesson[] = [
  { id: "l-leo-20", studentId: "s-leo", date: "2026-02-20", timeOfDay: "4:00 PM", durationMinutes: 60, amountCents: 7000, completed: false },
  { id: "l-emma-k-20", studentId: "s-emma-kim", date: "2026-02-20", timeOfDay: "2:00 PM", durationMinutes: 60, amountCents: 6500, completed: false },
  { id: "l-emma-c-20", studentId: "s-emma-chen", date: "2026-02-20", timeOfDay: "6:00 PM", durationMinutes: 60, amountCents: 6500, completed: false },
  { id: "l-sofia-21", studentId: "s-sofia", date: "2026-02-21", timeOfDay: "3:00 PM", durationMinutes: 90, amountCents: 8000, completed: false },
];

const BASE_SCHEDULED: DashboardScheduledLesson[] = [
  {
    lesson_id: "l-leo-20",
    student_id: "s-leo",
    student_name: "Leo Garcia",
    date: "2026-02-20",
    time: "4:00 PM",
    duration_minutes: 60,
    amount_cents: 7000,
    completed: false,
  },
  {
    lesson_id: "l-emma-k-20",
    student_id: "s-emma-kim",
    student_name: "Emma Kim",
    date: "2026-02-20",
    time: "2:00 PM",
    duration_minutes: 60,
    amount_cents: 6500,
    completed: false,
  },
  {
    lesson_id: "l-emma-c-20",
    student_id: "s-emma-chen",
    student_name: "Emma Chen",
    date: "2026-02-20",
    time: "6:00 PM",
    duration_minutes: 60,
    amount_cents: 6500,
    completed: false,
  },
  {
    lesson_id: null,
    student_id: "s-mason",
    student_name: "Mason Lopez",
    date: "2026-02-20",
    time: "7:00 PM",
    duration_minutes: 60,
    amount_cents: 7000,
    completed: false,
  },
];

const CASES: MatrixCase[] = [
  { transcript: "Leo had his class today", selectedDate: "2026-02-20" },
  { transcript: "Emma Kim's class is now at 10 PM", selectedDate: "2026-02-20" },
  { transcript: "Change Mason's lesson to 30 minutes", selectedDate: "2026-02-20" },
  { transcript: "Change Sofia's lesson to Friday, February 20 at 2 PM for one hour", selectedDate: "2026-02-21" },
  { transcript: "Change Sophia's lesson to 1 PM", selectedDate: "2026-02-21" },
  { transcript: "Mark Emma attended today", selectedDate: "2026-02-20" },
];

function makeContext(selectedDate: string): DashboardContext {
  return {
    user_id: "u-voice-diagnostic",
    selected_date: selectedDate,
    timezone: "America/Los_Angeles",
    scheduled_lessons: BASE_SCHEDULED.filter((row) => row.date === selectedDate),
  };
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, quiet: false, listCases: false, cases: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (arg === "--list-cases") {
      options.listCases = true;
      continue;
    }
    if (arg === "--case" && argv[i + 1]) {
      options.cases.push(argv[i + 1].toLowerCase());
      i++;
      continue;
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const out = console.log.bind(console);
  const originalLog = console.log;

  if (options.listCases) {
    out("\n--- Voice Diagnostic Cases ---\n");
    CASES.forEach((tc, idx) => {
      out(`${idx + 1}. [${tc.selectedDate}] ${tc.transcript}`);
    });
    out("");
    return;
  }

  const selectedCases =
    options.cases.length === 0
      ? CASES
      : CASES.filter((tc) => options.cases.some((needle) => tc.transcript.toLowerCase().includes(needle)));

  if (selectedCases.length === 0) {
    console.error("No diagnostic cases matched --case filter.");
    process.exit(1);
  }

  if (options.quiet) {
    console.log = () => {};
  }

  const lessons = LESSONS.map((l) => ({ ...l }));
  const adapter = {
    get students(): Student[] {
      return STUDENTS;
    },
    get lessons(): Lesson[] {
      return lessons;
    },
    getScheduledLessonsForDate(dateKey: string): DashboardScheduledLesson[] {
      return BASE_SCHEDULED.filter((row) => row.date === dateKey);
    },
    async updateLessonById(lessonId: string, updates: Partial<Lesson>): Promise<void> {
      const idx = lessons.findIndex((l) => l.id === lessonId);
      if (idx >= 0) lessons[idx] = { ...lessons[idx], ...updates };
    },
    async addLesson(lesson: Omit<Lesson, "id">): Promise<string> {
      const id = `l-new-${lessons.length + 1}`;
      lessons.push({ ...lesson, id });
      return id;
    },
    async fetchLessonsForVerification(): Promise<Lesson[]> {
      return lessons.map((l) => ({ ...l }));
    },
  };

  const rows: Array<Record<string, unknown>> = [];
  try {
    for (const tc of selectedCases) {
      const result = await handleVoiceCommand(
        tc.transcript,
        makeContext(tc.selectedDate),
        adapter,
        { debug: true, dryRun: true }
      );
      rows.push({
        transcript: tc.transcript,
        selected_date: tc.selectedDate,
        status: result.status,
        intent: result.debug?.intent?.name ?? null,
        updates: result.plan?.updates.length ?? 0,
        creates: result.plan?.creates.length ?? 0,
        message: result.human_message,
      });
    }
  } finally {
    console.log = originalLog;
  }

  if (options.json) {
    out(JSON.stringify(rows, null, 2));
    return;
  }

  out("\n--- Voice Diagnostic Matrix (dry-run) ---\n");
  out(JSON.stringify(rows, null, 2));
  out("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
