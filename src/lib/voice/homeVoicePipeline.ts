import { z } from "zod";
import type { Lesson, Student } from "@/types";
import { getStudentsForDay, getEffectiveDurationMinutes, getEffectiveRateCents } from "@/utils/earnings";

export type CommandStatus = "success" | "needs_clarification" | "error";

export type DashboardScheduledLesson = {
  lesson_id: string | null;
  student_id: string;
  student_name: string;
  date: string;
  time: string;
  duration_minutes: number;
  amount_cents: number;
  completed: boolean;
};

export type DashboardContext = {
  user_id: string;
  selected_date: string;
  timezone: string;
  scheduled_lessons: DashboardScheduledLesson[];
};

const nameListSchema = z.array(z.string().min(1)).min(1);

const commandSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("mark_attendance"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    target: z.discriminatedUnion("type", [
      z.object({ type: z.literal("all_students") }),
      z.object({ type: z.literal("students"), names: nameListSchema }),
    ]),
  }),
  z.object({
    intent: z.literal("unmark_attendance"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    target: z.discriminatedUnion("type", [
      z.object({ type: z.literal("all_students") }),
      z.object({ type: z.literal("students"), names: nameListSchema }),
    ]),
  }),
  z.object({
    intent: z.literal("set_duration"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    target: z.object({ names: nameListSchema }),
    duration_minutes: z.number().int(),
  }),
  z.object({
    intent: z.literal("set_time"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    target: z.object({ names: nameListSchema }),
    start_time: z.string().min(1),
  }),
  z.object({
    intent: z.literal("move_lesson"),
    target: z.object({ name: z.string().min(1) }),
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to_time: z.string().min(1).optional(),
    duration_minutes: z.number().int().optional(),
  }),
  z.object({
    intent: z.literal("set_rate"),
    target: z.object({ names: nameListSchema }),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    rate_dollars_per_hour: z.number().positive(),
    scope: z.enum(["single_date", "going_forward"]).default("single_date"),
  }),
  z.object({
    intent: z.literal("help"),
  }),
]);

type StructuredCommand = z.infer<typeof commandSchema>;

export type CommandPlanUpdate = {
  lesson_id: string;
  student_id: string;
  student_name: string;
  date: string;
  updates: Partial<Lesson>;
};

export type CommandPlanCreate = {
  student_id: string;
  student_name: string;
  date: string;
  lesson: Omit<Lesson, "id">;
};

export type CommandPlan = {
  intent: StructuredCommand["intent"];
  target_date: string | null;
  updates: CommandPlanUpdate[];
  creates: CommandPlanCreate[];
  verification: {
    expected_completed?: { lesson_ids: string[]; value: boolean };
    expected_created?: { student_ids: string[]; date: string; completed: boolean };
    expected_duration?: { lesson_ids: string[]; value: number };
    expected_time?: { lesson_ids: string[]; value: string };
    expected_date?: { lesson_ids: string[]; value: string };
    expected_amount_cents?: { lesson_ids: string[]; value: number };
  };
};

export type CommandResult = {
  status: CommandStatus;
  human_message: string;
  plan: CommandPlan | null;
  clarification_options?: string[];
};

export type VoicePipelineAdapter = {
  students: Student[];
  lessons: Lesson[];
  getScheduledLessonsForDate: (dateKey: string) => DashboardScheduledLesson[];
  updateLessonById: (lessonId: string, updates: Partial<Lesson>) => Promise<void>;
  addLesson: (lesson: Omit<Lesson, "id">) => Promise<string>;
  fetchLessonsForVerification: () => Promise<Lesson[]>;
};

const DAY_INDEX: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const VALID_DURATIONS = new Set([30, 45, 60, 90, 120]);
const WEEKDAY_TOKEN_RE = /\b(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/i;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function titleCaseName(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
    .join(" ");
}

function parseRelativeOrExplicitDate(text: string, fallbackDateKey: string): string {
  const t = norm(text);
  const base = new Date(`${fallbackDateKey}T12:00:00`);

  if (/\btoday\b/.test(t)) return fallbackDateKey;
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }
  if (/\byesterday\b/.test(t)) {
    const d = new Date(base);
    d.setDate(d.getDate() - 1);
    return toDateKey(d);
  }

  const nextMatch = t.match(/\bnext\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/);
  if (nextMatch) {
    const targetDow = DAY_INDEX[nextMatch[1]];
    const d = new Date(base);
    const delta = (targetDow - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return toDateKey(d);
  }

  const lastMatch = t.match(/\blast\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/);
  if (lastMatch) {
    const targetDow = DAY_INDEX[lastMatch[1]];
    const d = new Date(base);
    const delta = (d.getDay() - targetDow + 7) % 7 || 7;
    d.setDate(d.getDate() - delta);
    return toDateKey(d);
  }

  const monthDayMatch = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDayMatch) {
    const month = MONTH_INDEX[monthDayMatch[1]];
    const day = Number(monthDayMatch[2]);
    let year = base.getFullYear();
    const candidate = new Date(year, month, day, 12, 0, 0, 0);
    if (candidate.getTime() - base.getTime() > 183 * 24 * 60 * 60 * 1000) year -= 1;
    return toDateKey(new Date(year, month, day, 12, 0, 0, 0));
  }

  const isoMatch = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const bareDowMatch = t.match(/\b(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/);
  if (bareDowMatch) {
    const targetDow = DAY_INDEX[bareDowMatch[1]];
    const d = new Date(base);
    const delta = (d.getDay() - targetDow + 7) % 7;
    d.setDate(d.getDate() - delta);
    return toDateKey(d);
  }

  const usMatch = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (usMatch) {
    const m = Number(usMatch[1]);
    const d = Number(usMatch[2]);
    const y = usMatch[3] ? Number(usMatch[3]) : base.getFullYear();
    const yy = y < 100 ? 2000 + y : y;
    return toDateKey(new Date(yy, m - 1, d, 12, 0, 0, 0));
  }

  return fallbackDateKey;
}

function parseDurationMinutes(text: string): number | null {
  const t = norm(text);
  if (/\bhalf\s+an?\s+hour\b/.test(t)) return 30;
  const minMatch = t.match(/\b(\d+)\s*(minutes?|mins?)\b/);
  if (minMatch) return Number(minMatch[1]);
  const hrMatch = t.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?)\b/);
  if (hrMatch) return Math.round(Number(hrMatch[1]) * 60);
  if (/\bone\s+hour\b/.test(t)) return 60;
  if (/\b1\s*hour\b/.test(t)) return 60;
  if (/\b90\s*minutes?\b/.test(t)) return 90;
  return null;
}

function parseTimeString(text: string): string | null {
  const t = text.toLowerCase();
  const afternoon = /\bafternoon|evening|tonight\b/.test(t);

  const h24 = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) {
    const hour24 = Number(h24[1]);
    const minute = Number(h24[2]);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 < 12 ? "AM" : "PM";
    return `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;
  }

  const ampm = t.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/);
  if (ampm) {
    const hour = Number(ampm[1]);
    if (hour < 1 || hour > 12) return null;
    const minute = Number(ampm[2] ?? "0");
    return `${hour}:${String(minute).padStart(2, "0")} ${ampm[3].toUpperCase()}`;
  }

  const plain = t.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b|\bto\s+(\d{1,2})(?::(\d{2}))?\b|\bstart\s+at\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (plain) {
    const hourRaw = Number(plain[1] ?? plain[3] ?? plain[5]);
    const minuteRaw = Number(plain[2] ?? plain[4] ?? plain[6] ?? "0");
    if (minuteRaw < 0 || minuteRaw > 59 || hourRaw < 0 || hourRaw > 23) return null;
    const hour24 = afternoon ? (hourRaw % 12) + 12 : hourRaw;
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampmVal = hour24 < 12 ? "AM" : "PM";
    return `${hour12}:${String(minuteRaw).padStart(2, "0")} ${ampmVal}`;
  }

  return null;
}

function parseRatePerHour(text: string): number | null {
  const t = norm(text);
  const direct = t.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*hr|per\s*hour|an?\s*hour|dollars?|bucks?)\b/);
  if (direct) return Number(direct[1]);
  const simple = t.match(/\brate\s+to\s+\$?\s*(\d+(?:\.\d+)?)\b|\bprice\s+to\s+\$?\s*(\d+(?:\.\d+)?)\b/);
  if (simple) return Number(simple[1] ?? simple[2]);
  return null;
}

function extractStudentMentions(text: string): string[] {
  const t = norm(text);
  const cleaned = t
    .replace(/\b(unmark|mark|set|change|move|reschedule|make|update|undo|toggle|all|students?|attended|attendance|absent|today|tomorrow|yesterday|lesson|lessons|from|to|for|at|did not|didnt|didn t|showed|show|came|come|everyone|everybody|nobody|no one|noone|clear|as|the|a|an|of|with|my|on|is|was|were|be|should|start|rate|price|per|hourly|dollars|dollar|and then|duration|time|hour|hours|minute|minutes|min|mins|completed)\b/g, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)?\b/g, " ")
    .replace(/\bs\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s*(?:,|&|\bplus\b|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitNameSegment(segment: string): string[] {
  return segment
    .replace(/\band\b/gi, ",")
    .split(",")
    .map((s) => norm(s).replace(/\bs\b$/, "").trim())
    .filter((s) => s.length > 0);
}

function resolveNamesToStudents(names: string[], students: Student[]): { resolved: Student[]; ambiguous: { spoken: string; matches: Student[] }[]; missing: string[] } {
  const resolved: Student[] = [];
  const ambiguous: { spoken: string; matches: Student[] }[] = [];
  const missing: string[] = [];
  const used = new Set<string>();

  for (const rawName of names) {
    const n = norm(rawName).replace(/\bs\b$/, "").trim();
    if (!n) continue;
    const matches = students.filter((s) => {
      const first = norm(s.firstName);
      const last = norm(s.lastName);
      const full = `${first} ${last}`;
      return full === n || first === n || full.includes(n) || n.includes(full) || `${first} ${last}`.startsWith(n);
    });
    if (matches.length === 0) {
      missing.push(titleCaseName(rawName));
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push({ spoken: titleCaseName(rawName), matches });
      continue;
    }
    if (!used.has(matches[0].id)) {
      used.add(matches[0].id);
      resolved.push(matches[0]);
    }
  }

  return { resolved, ambiguous, missing };
}

function formatPrettyDate(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getLastAndNextWeekdayDateKey(weekdayToken: string, baseDateKey: string): { last: string; next: string } | null {
  const key = weekdayToken.toLowerCase();
  const targetDow = DAY_INDEX[key];
  if (targetDow == null) return null;
  const base = new Date(`${baseDateKey}T12:00:00`);
  const last = new Date(base);
  const back = (base.getDay() - targetDow + 7) % 7 || 7;
  last.setDate(last.getDate() - back);
  const next = new Date(base);
  const fwd = (targetDow - base.getDay() + 7) % 7 || 7;
  next.setDate(next.getDate() + fwd);
  return { last: toDateKey(last), next: toDateKey(next) };
}

/**
 * Bare weekday like "Friday" is ambiguous for move/reschedule.
 * We only auto-resolve when phrase is explicit: next/last/this, month+day, ISO/us numeric, today/tomorrow/yesterday.
 */
function getAmbiguousWeekdayToken(phrase: string): string | null {
  const p = norm(phrase);
  if (/\b(next|last|this)\b/.test(p)) return null;
  if (/\b(today|tomorrow|yesterday)\b/.test(p)) return null;
  if (/\b(\d{4}-\d{2}-\d{2})\b/.test(p)) return null;
  if (/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/.test(p)) return null;
  if (/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/.test(p)) return null;
  const m = p.match(WEEKDAY_TOKEN_RE);
  return m ? m[1] : null;
}

function parseTranscriptToCommand(transcript: string, context: DashboardContext): StructuredCommand | { needs_clarification: string; options?: string[] } {
  const text = transcript.trim();
  const t = norm(text);
  const rawLower = text.toLowerCase();
  const targetDate = parseRelativeOrExplicitDate(text, context.selected_date);

  if (!text) {
    return { needs_clarification: "I didn't catch that. Please try again." };
  }

  if (/\bhelp\b|\bwhat can you do\b/.test(t)) {
    return { intent: "help" };
  }

  const saysNobody = /\b(no one|nobody)\b/.test(t);
  if (saysNobody && !/\b(mark|set|toggle|unmark|undo|clear)\b/.test(t)) {
    return {
      needs_clarification: "Do you want me to mark all scheduled lessons as not attended?",
      options: ["Yes, mark all absent", "No, cancel"],
    };
  }

  const allStudents = /\b(all students|everyone|everybody|all lessons|all of them)\b/.test(t);
  const unmark = /\b(unmark|undo|clear attendance|not attended|absent|did not come|didn t come|didnt come|missed|no show|cancelled|canceled|toggle off)\b/.test(t) || /\btoggle\b.*\boff\b/.test(t);
  const mark = /\b(mark|set|toggle on|attended|came|showed up|was here|present)\b/.test(t);

  const moveIntent = /\b(move|reschedule)\b/.test(t);
  if (moveIntent) {
    const explicitName =
      text.match(/\b(?:move|reschedule)\s+([A-Za-z]+)(?:'s)?(?:\s+lesson)?/i)?.[1] ??
      text.match(/\blesson\s+with\s+([A-Za-z]+)\b/i)?.[1] ??
      null;
    const fromTo = rawLower.match(/\bfrom\s+(.+?)\s+to\s+(.+)/);
    const toPhrase = fromTo ? fromTo[2] : (rawLower.match(/\bto\s+(.+)$/)?.[1] ?? "");
    const fromPhrase = fromTo ? fromTo[1] : "";
    const ambiguousFromWeekday = fromPhrase ? getAmbiguousWeekdayToken(fromPhrase) : null;
    if (ambiguousFromWeekday) {
      const choices = getLastAndNextWeekdayDateKey(ambiguousFromWeekday, context.selected_date);
      if (choices) {
        return {
          needs_clarification: `For "${ambiguousFromWeekday}", do you mean ${formatPrettyDate(choices.last)} or ${formatPrettyDate(choices.next)}?`,
          options: [`Last ${ambiguousFromWeekday} (${choices.last})`, `Next ${ambiguousFromWeekday} (${choices.next})`],
        };
      }
    }
    const ambiguousToWeekday = toPhrase ? getAmbiguousWeekdayToken(toPhrase) : null;
    if (ambiguousToWeekday) {
      const choices = getLastAndNextWeekdayDateKey(ambiguousToWeekday, context.selected_date);
      if (choices) {
        return {
          needs_clarification: `For "${ambiguousToWeekday}", do you mean ${formatPrettyDate(choices.last)} or ${formatPrettyDate(choices.next)}?`,
          options: [`Last ${ambiguousToWeekday} (${choices.last})`, `Next ${ambiguousToWeekday} (${choices.next})`],
        };
      }
    }
    const fromDate = fromTo ? parseRelativeOrExplicitDate(fromTo[1], context.selected_date) : undefined;
    const toDate = parseRelativeOrExplicitDate(toPhrase || text, context.selected_date);
    const toTime = parseTimeString(toPhrase || text) ?? undefined;
    const lookedLikeTime = /\b\d{1,2}(?::\d{2})?\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i.test(text);
    if (lookedLikeTime && !toTime) {
      return { needs_clarification: "I couldn't parse that time. Please say a valid time like 3pm or 15:00." };
    }
    const duration = parseDurationMinutes(text) ?? undefined;
    const names = explicitName ? [explicitName] : extractStudentMentions(text);
    if (names.length === 0) return { needs_clarification: "Which student should I move?" };
    return {
      intent: "move_lesson",
      target: { name: names[0] },
      from_date: fromDate,
      to_date: toDate,
      to_time: toTime,
      duration_minutes: duration,
    };
  }

  const duration = parseDurationMinutes(text);
  if (duration != null && /\b(change|make|set|update|should be|lesson|duration|minutes?|hour|half hour)\b/.test(t)) {
    const names = extractStudentMentions(text);
    if (names.length === 0) return { needs_clarification: "Which student should I update?" };
    return {
      intent: "set_duration",
      date: targetDate,
      target: { names },
      duration_minutes: duration,
    };
  }

  const time = parseTimeString(text);
  if (time && /\b(change|set|move|reschedule|time|start)\b/.test(t)) {
    const names = extractStudentMentions(text);
    if (names.length === 0) return { needs_clarification: "Which student should I move to that time?" };
    return {
      intent: "set_time",
      date: targetDate,
      target: { names },
      start_time: time,
    };
  }

  const rate = parseRatePerHour(text);
  if (rate != null && /\b(rate|price|raise|increase|hour)\b/.test(t)) {
    const names = extractStudentMentions(text);
    if (names.length === 0) return { needs_clarification: "Which student's rate should I change?" };
    const goingForward = /\b(starting|effective|going forward|next month)\b/.test(t);
    return {
      intent: "set_rate",
      target: { names },
      effective_date: targetDate,
      rate_dollars_per_hour: rate,
      scope: goingForward ? "going_forward" : "single_date",
    };
  }

  if (allStudents && (mark || unmark)) {
    return {
      intent: unmark ? "unmark_attendance" : "mark_attendance",
      date: targetDate,
      target: { type: "all_students" },
    };
  }

  let names = extractStudentMentions(text);
  const namedAttendanceMatch = text.match(/\b(?:mark|unmark|set|toggle)\s+(.+?)\s+(?:as\s+)?(?:(?:to\s+)?(?:not\s+)?attended|absent|completed)\b/i);
  if (namedAttendanceMatch) {
    names = splitNameSegment(namedAttendanceMatch[1]);
  }
  if (names.length > 0 && (mark || unmark)) {
    return {
      intent: unmark ? "unmark_attendance" : "mark_attendance",
      date: targetDate,
      target: { type: "students", names },
    };
  }

  return { needs_clarification: "I couldn't map that command safely. Please say the student name and action." };
}

function lessonsById(lessons: Lesson[]): Map<string, Lesson> {
  return new Map(lessons.map((l) => [l.id, l]));
}

function createPlan(
  cmd: StructuredCommand,
  context: DashboardContext,
  adapter: VoicePipelineAdapter
): CommandResult {
  if (cmd.intent === "help") {
    return {
      status: "needs_clarification",
      human_message: "Try: 'Chloe and Leo came today', 'All students attended today', or 'Move Leo from Friday to Sunday at 5pm'.",
      plan: null,
    };
  }

  const allStudents = adapter.students;
  const allLessons = adapter.lessons;
  const byId = lessonsById(allLessons);

  const targetDate =
    "date" in cmd && cmd.date
      ? cmd.date
      : "effective_date" in cmd && cmd.effective_date
        ? cmd.effective_date
        : context.selected_date;

  const plan: CommandPlan = {
    intent: cmd.intent,
    target_date: targetDate ?? null,
    updates: [],
    creates: [],
    verification: {},
  };

  const createLessonForStudent = (
    student: Student,
    date: string,
    completed: boolean,
    overrides?: Partial<Omit<Lesson, "id" | "studentId" | "date" | "completed">>
  ): CommandPlanCreate => {
    const baseDuration = getEffectiveDurationMinutes(student, date);
    const baseRate = getEffectiveRateCents(student, date);
    const durationMinutes = overrides?.durationMinutes ?? baseDuration;
    const amountCents = overrides?.amountCents ?? Math.round((baseRate * durationMinutes) / Math.max(1, baseDuration));
    return {
      student_id: student.id,
      student_name: `${student.firstName} ${student.lastName}`,
      date,
      lesson: {
        studentId: student.id,
        date,
        timeOfDay: overrides?.timeOfDay ?? student.timeOfDay,
        durationMinutes,
        amountCents,
        completed,
        note: overrides?.note,
      },
    };
  };

  const findLessonForStudentOnDate = (studentId: string, date: string): Lesson | undefined =>
    allLessons.find((l) => l.studentId === studentId && l.date === date);

  if (cmd.intent === "mark_attendance" || cmd.intent === "unmark_attendance") {
    const present = cmd.intent === "mark_attendance";
    if (cmd.target.type === "all_students") {
      const targetDow = new Date(`${targetDate}T12:00:00`).getDay();
      const scheduledStudents = getStudentsForDay(allStudents, targetDow, targetDate);
      const existingRows = allLessons.filter((l) => l.date === targetDate);
      const targetStudents = [...scheduledStudents];
      for (const row of existingRows) {
        if (!targetStudents.some((s) => s.id === row.studentId)) {
          const s = allStudents.find((st) => st.id === row.studentId);
          if (s) targetStudents.push(s);
        }
      }

      if (targetStudents.length === 0) {
        return {
          status: "error",
          human_message: `No lessons scheduled for ${formatPrettyDate(targetDate)}.`,
          plan: null,
        };
      }

      for (const student of targetStudents) {
        const existing = findLessonForStudentOnDate(student.id, targetDate);
        if (existing) {
          plan.updates.push({
            lesson_id: existing.id,
            student_id: student.id,
            student_name: `${student.firstName} ${student.lastName}`,
            date: targetDate,
            updates: { completed: present },
          });
        } else if (present) {
          plan.creates.push(createLessonForStudent(student, targetDate, true));
        }
      }
      plan.verification.expected_completed = {
        lesson_ids: plan.updates.map((u) => u.lesson_id),
        value: present,
      };
      if (plan.creates.length > 0) {
        plan.verification.expected_created = {
          student_ids: plan.creates.map((c) => c.student_id),
          date: targetDate,
          completed: present,
        };
      }
      return {
        status: "success",
        human_message: present
          ? `Marked ${plan.updates.length + plan.creates.length} lessons attended — ${formatPrettyDate(targetDate)}`
          : `Marked ${plan.updates.length} lessons not attended — ${formatPrettyDate(targetDate)}`,
        plan,
      };
    }

    const resolved = resolveNamesToStudents(cmd.target.names, allStudents);
    if (resolved.ambiguous.length > 0) {
      const a = resolved.ambiguous[0];
      return {
        status: "needs_clarification",
        human_message: `Which ${a.spoken}?`,
        clarification_options: a.matches.map((m) => `${m.firstName} ${m.lastName}`),
        plan: null,
      };
    }
    if (resolved.missing.length > 0) {
      return {
        status: "needs_clarification",
        human_message: `I couldn't find: ${resolved.missing.join(", ")}.`,
        plan: null,
      };
    }

    const matchedNames: string[] = [];
    for (const student of resolved.resolved) {
      const existing = findLessonForStudentOnDate(student.id, targetDate);
      if (existing) {
        plan.updates.push({
          lesson_id: existing.id,
          student_id: student.id,
          student_name: `${student.firstName} ${student.lastName}`,
          date: targetDate,
          updates: { completed: present },
        });
        matchedNames.push(`${student.firstName} ${student.lastName}`);
        continue;
      }
      if (present) {
        plan.creates.push(createLessonForStudent(student, targetDate, true));
        matchedNames.push(`${student.firstName} ${student.lastName}`);
        continue;
      }
      if (!present) {
        return {
          status: "needs_clarification",
          human_message: `No lesson scheduled for ${student.firstName} ${student.lastName} on ${formatPrettyDate(targetDate)}. Do you mean another date?`,
          plan: null,
        };
      }
    }
    plan.verification.expected_completed = {
      lesson_ids: plan.updates.map((u) => u.lesson_id),
      value: present,
    };
    if (plan.creates.length > 0) {
      plan.verification.expected_created = {
        student_ids: plan.creates.map((c) => c.student_id),
        date: targetDate,
        completed: present,
      };
    }
    return {
      status: "success",
      human_message: `${present ? "Marked attended" : "Marked not attended"}: ${matchedNames.join(", ")} — ${formatPrettyDate(targetDate)}`,
      plan,
    };
  }

  if (cmd.intent === "set_duration") {
    if (!VALID_DURATIONS.has(cmd.duration_minutes)) {
      return {
        status: "needs_clarification",
        human_message: "Supported durations are 30, 45, 60, 90, or 120 minutes.",
        plan: null,
      };
    }
    const resolved = resolveNamesToStudents(cmd.target.names, allStudents);
    if (resolved.ambiguous.length > 0) {
      const a = resolved.ambiguous[0];
      return {
        status: "needs_clarification",
        human_message: `Which ${a.spoken}?`,
        clarification_options: a.matches.map((m) => `${m.firstName} ${m.lastName}`),
        plan: null,
      };
    }
    if (resolved.missing.length > 0) {
      return { status: "needs_clarification", human_message: `I couldn't find: ${resolved.missing.join(", ")}.`, plan: null };
    }
    for (const student of resolved.resolved) {
      const lesson = findLessonForStudentOnDate(student.id, targetDate);
      if (lesson) {
        plan.updates.push({
          lesson_id: lesson.id,
          student_id: student.id,
          student_name: `${student.firstName} ${student.lastName}`,
          date: targetDate,
          updates: {
            durationMinutes: cmd.duration_minutes,
            amountCents: Math.round((lesson.amountCents / Math.max(1, lesson.durationMinutes)) * cmd.duration_minutes),
          },
        });
      } else {
        plan.creates.push(
          createLessonForStudent(student, targetDate, false, {
            durationMinutes: cmd.duration_minutes,
          })
        );
      }
    }
    plan.verification.expected_duration = { lesson_ids: plan.updates.map((u) => u.lesson_id), value: cmd.duration_minutes };
    if (plan.creates.length > 0) {
      plan.verification.expected_created = {
        student_ids: plan.creates.map((c) => c.student_id),
        date: targetDate,
        completed: false,
      };
    }
    const durationTargets = [
      ...plan.updates.map((u) => u.student_name),
      ...plan.creates.map((c) => c.student_name),
    ];
    return {
      status: "success",
      human_message: `Updated duration to ${cmd.duration_minutes} min: ${durationTargets.join(", ")} — ${formatPrettyDate(targetDate)}`,
      plan,
    };
  }

  if (cmd.intent === "set_time") {
    const resolved = resolveNamesToStudents(cmd.target.names, allStudents);
    if (resolved.ambiguous.length > 0) {
      const a = resolved.ambiguous[0];
      return { status: "needs_clarification", human_message: `Which ${a.spoken}?`, clarification_options: a.matches.map((m) => `${m.firstName} ${m.lastName}`), plan: null };
    }
    if (resolved.missing.length > 0) {
      return { status: "needs_clarification", human_message: `I couldn't find: ${resolved.missing.join(", ")}.`, plan: null };
    }
    for (const student of resolved.resolved) {
      const lesson = findLessonForStudentOnDate(student.id, targetDate);
      if (lesson) {
        plan.updates.push({
          lesson_id: lesson.id,
          student_id: student.id,
          student_name: `${student.firstName} ${student.lastName}`,
          date: targetDate,
          updates: { timeOfDay: cmd.start_time },
        });
      } else {
        plan.creates.push(
          createLessonForStudent(student, targetDate, false, {
            timeOfDay: cmd.start_time,
          })
        );
      }
    }
    plan.verification.expected_time = { lesson_ids: plan.updates.map((u) => u.lesson_id), value: cmd.start_time };
    if (plan.creates.length > 0) {
      plan.verification.expected_created = {
        student_ids: plan.creates.map((c) => c.student_id),
        date: targetDate,
        completed: false,
      };
    }
    const timeTargets = [
      ...plan.updates.map((u) => u.student_name),
      ...plan.creates.map((c) => c.student_name),
    ];
    return {
      status: "success",
      human_message: `Updated time to ${cmd.start_time}: ${timeTargets.join(", ")} — ${formatPrettyDate(targetDate)}`,
      plan,
    };
  }

  if (cmd.intent === "move_lesson") {
    const resolved = resolveNamesToStudents([cmd.target.name], allStudents);
    if (resolved.ambiguous.length > 0) {
      const a = resolved.ambiguous[0];
      return { status: "needs_clarification", human_message: `Which ${a.spoken}?`, clarification_options: a.matches.map((m) => `${m.firstName} ${m.lastName}`), plan: null };
    }
    if (resolved.missing.length > 0 || resolved.resolved.length === 0) {
      return { status: "needs_clarification", human_message: `I couldn't find ${cmd.target.name}.`, plan: null };
    }
    const student = resolved.resolved[0];
    const fromDate = cmd.from_date ?? context.selected_date;
    const source = allLessons.find((l) => l.studentId === student.id && l.date === fromDate);
    if (!source) {
      return {
        status: "needs_clarification",
        human_message: `No lesson found for ${student.firstName} ${student.lastName} on ${formatPrettyDate(fromDate)}.`,
        plan: null,
      };
    }
    const updates: Partial<Lesson> = { date: cmd.to_date };
    if (cmd.to_time) updates.timeOfDay = cmd.to_time;
    if (cmd.duration_minutes != null) {
      if (!VALID_DURATIONS.has(cmd.duration_minutes)) {
        return { status: "needs_clarification", human_message: "Supported durations are 30, 45, 60, 90, or 120 minutes.", plan: null };
      }
      updates.durationMinutes = cmd.duration_minutes;
      updates.amountCents = Math.round((source.amountCents / source.durationMinutes) * cmd.duration_minutes);
    }
    plan.updates.push({
      lesson_id: source.id,
      student_id: student.id,
      student_name: `${student.firstName} ${student.lastName}`,
      date: cmd.to_date,
      updates,
    });
    plan.verification.expected_date = { lesson_ids: [source.id], value: cmd.to_date };
    return {
      status: "success",
      human_message: `Moved ${student.firstName} ${student.lastName} to ${formatPrettyDate(cmd.to_date)}${cmd.to_time ? ` at ${cmd.to_time}` : ""}.`,
      plan,
    };
  }

  if (cmd.intent === "set_rate") {
    if (cmd.scope === "going_forward") {
      return {
        status: "needs_clarification",
        human_message: "Going-forward recurring rate changes by voice are not supported yet. I can update a single lesson rate by date.",
        plan: null,
      };
    }
    const target = cmd.effective_date ?? context.selected_date;
    const rateCentsPerHour = Math.round(cmd.rate_dollars_per_hour * 100);
    const resolved = resolveNamesToStudents(cmd.target.names, allStudents);
    if (resolved.ambiguous.length > 0) {
      const a = resolved.ambiguous[0];
      return { status: "needs_clarification", human_message: `Which ${a.spoken}?`, clarification_options: a.matches.map((m) => `${m.firstName} ${m.lastName}`), plan: null };
    }
    if (resolved.missing.length > 0) {
      return { status: "needs_clarification", human_message: `I couldn't find: ${resolved.missing.join(", ")}.`, plan: null };
    }
    const dayRows = adapter.getScheduledLessonsForDate(target);
    for (const student of resolved.resolved) {
      const row = dayRows.find((l) => l.student_id === student.id);
      if (!row || !row.lesson_id) {
        return {
          status: "needs_clarification",
          human_message: `No lesson scheduled for ${student.firstName} ${student.lastName} on ${formatPrettyDate(target)}.`,
          plan: null,
        };
      }
      const lesson = byId.get(row.lesson_id);
      if (!lesson) return { status: "error", human_message: "Lesson row not found for rate update.", plan: null };
      const newAmount = Math.round((rateCentsPerHour * lesson.durationMinutes) / 60);
      plan.updates.push({
        lesson_id: row.lesson_id,
        student_id: student.id,
        student_name: row.student_name,
        date: target,
        updates: { amountCents: newAmount },
      });
    }
    if (plan.updates.length === 0) {
      return { status: "error", human_message: "No lessons matched for rate update.", plan: null };
    }
    plan.verification.expected_amount_cents = {
      lesson_ids: plan.updates.map((u) => u.lesson_id),
      value: plan.updates[0].updates.amountCents ?? 0,
    };
    return {
      status: "success",
      human_message: `Updated rate for ${plan.updates.map((u) => u.student_name).join(", ")} on ${formatPrettyDate(target)}.`,
      plan,
    };
  }

  return { status: "error", human_message: "Unsupported command.", plan: null };
}

async function verifyPlan(plan: CommandPlan, lessons: Lesson[]): Promise<boolean> {
  const byId = lessonsById(lessons);
  for (const u of plan.updates) {
    const row = byId.get(u.lesson_id);
    if (!row) return false;
    if (u.updates.completed != null && row.completed !== u.updates.completed) return false;
    if (u.updates.durationMinutes != null && row.durationMinutes !== u.updates.durationMinutes) return false;
    if (u.updates.timeOfDay != null && row.timeOfDay !== u.updates.timeOfDay) return false;
    if (u.updates.date != null && row.date !== u.updates.date) return false;
    if (u.updates.amountCents != null && row.amountCents !== u.updates.amountCents) return false;
  }
  if (plan.verification.expected_created) {
    const expected = plan.verification.expected_created;
    for (const studentId of expected.student_ids) {
      const row = lessons.find((l) => l.studentId === studentId && l.date === expected.date);
      if (!row) return false;
      if (row.completed !== expected.completed) return false;
    }
  }
  return true;
}

export async function handleVoiceCommand(
  transcript: string,
  context: DashboardContext,
  adapter: VoicePipelineAdapter
): Promise<CommandResult> {
  const parsedOrClarify = parseTranscriptToCommand(transcript, context);
  if ("needs_clarification" in parsedOrClarify) {
    return {
      status: "needs_clarification",
      human_message: parsedOrClarify.needs_clarification,
      clarification_options: parsedOrClarify.options,
      plan: null,
    };
  }

  const parsed = commandSchema.safeParse(parsedOrClarify);
  if (!parsed.success) {
    return {
      status: "error",
      human_message: "I couldn't parse that command safely.",
      plan: null,
    };
  }

  const planned = createPlan(parsed.data, context, adapter);
  if (planned.status !== "success" || !planned.plan) return planned;
  if (planned.plan.updates.length === 0) {
    return {
      status: "error",
      human_message: "No updates were generated from that command.",
      plan: null,
    };
  }

  for (const step of planned.plan.updates) {
    await adapter.updateLessonById(step.lesson_id, step.updates);
  }
  for (const step of planned.plan.creates) {
    await adapter.addLesson(step.lesson);
  }

  const readBackLessons = await adapter.fetchLessonsForVerification();
  const verified = await verifyPlan(planned.plan, readBackLessons);
  if (!verified) {
    return {
      status: "error",
      human_message: "I could not verify all lesson updates. Nothing was confirmed.",
      plan: planned.plan,
    };
  }

  return planned;
}
