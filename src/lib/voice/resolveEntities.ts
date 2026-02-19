/**
 * Voice Command Router — step 2: resolve student names and lessons to IDs.
 * Uses today's lessons list + full active roster; fuzzy name matching and possessive handling.
 */

import type { Student, Lesson } from "@/types";
import type { VoiceCommandPayload, ResolvedAttendanceMark, ResolvedLessonReschedule } from "./types";
import { getStudentsForDay, getLessonForStudentOnDate } from "@/utils/earnings";

export interface ResolveContext {
  students: Student[];
  lessons: Lesson[];
  /** Current dashboard date (YYYY-MM-DD) — used for "all students today". */
  dashboardDateKey: string;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function stripPossessive(segment: string): string {
  return segment.replace(/'s\s*$/i, "").replace(/s\s+lesson\s*$/i, "").trim();
}

/** Simple Levenshtein for fuzzy match. */
function levenshtein(a: string, b: string): number {
  const an = a.length,
    bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const dp: number[][] = Array.from({ length: an + 1 }, () => Array(bn + 1).fill(0));
  for (let i = 0; i <= an; i++) dp[i][0] = i;
  for (let j = 0; j <= bn; j++) dp[0][j] = j;
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[an][bn];
}

const FUZZY_THRESHOLD = 0.6;
const MAX_LEVENSHTEIN = 2;

function scoreMatch(spoken: string, student: Student): number {
  const s = norm(stripPossessive(spoken));
  if (!s) return 0;
  const first = norm(student.firstName);
  const last = norm(student.lastName);
  const full = norm(`${student.firstName} ${student.lastName}`);

  if (s === full) return 1.0;
  if (s === first) return 0.92;
  if (s === last) return 0.88;
  if (full.startsWith(s) || `${first} ${last}`.startsWith(s)) return 0.85;
  if (s.includes(first) && first.length > 1) return 0.8;
  if (s.includes(last) && last.length > 1) return 0.78;
  const dFirst = levenshtein(s, first);
  if (dFirst <= MAX_LEVENSHTEIN && first.length >= 2) return Math.max(FUZZY_THRESHOLD, 0.9 - dFirst * 0.12);
  const dLast = levenshtein(s, last);
  if (dLast <= MAX_LEVENSHTEIN && last.length >= 2) return Math.max(FUZZY_THRESHOLD, 0.82 - dLast * 0.1);
  const dFull = levenshtein(s, full);
  if (dFull <= 3 && full.length >= 4) return Math.max(FUZZY_THRESHOLD - 0.1, 0.75 - dFull * 0.08);
  return 0;
}

/**
 * Resolve name fragments to student IDs (and existing lesson IDs) for the given date.
 * Prefers students who have a lesson on dateKey; falls back to roster.
 */
function resolveNamesToStudentsAndLessons(
  nameFragments: string[],
  students: Student[],
  lessons: Lesson[],
  dateKey: string
): { studentId: string; lessonId: string | null; student: Student }[] {
  const result: { studentId: string; lessonId: string | null; student: Student }[] = [];
  const usedIds = new Set<string>();

  for (const fragment of nameFragments) {
    const candidates = students
      .map((s) => ({ student: s, score: scoreMatch(fragment, s) }))
      .filter((c) => c.score >= FUZZY_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) continue;
    const best = candidates[0];
    if (candidates.length >= 2 && candidates[0].score - candidates[1].score < 0.1) continue;
    if (usedIds.has(best.student.id)) continue;
    usedIds.add(best.student.id);
    const lesson = getLessonForStudentOnDate(lessons, best.student.id, dateKey);
    result.push({
      studentId: best.student.id,
      lessonId: lesson?.id ?? null,
      student: best.student,
    });
  }
  return result;
}

/**
 * Resolve ATTENDANCE_MARK payload into executable form.
 * - scope "all": use dashboard day's scheduled students + any rescheduled-on-date lessons.
 * - scope "named": resolve name fragments against roster (prefer scheduled on dateKey).
 */
export function resolveAttendanceMark(
  payload: VoiceCommandPayload,
  ctx: ResolveContext
): ResolvedAttendanceMark | null {
  if (payload.intent !== "ATTENDANCE_MARK" || !payload.data) return null;
  const data = payload.data as import("./types").AttendanceMarkData;
  const { students, lessons } = ctx;
  const dateKey = data.dateKey;
  const dayOfWeek = new Date(dateKey + "T12:00:00").getDay();

  if (data.scope === "all") {
    const scheduledForDay = getStudentsForDay(students, dayOfWeek, dateKey);
    const lessonIds: string[] = [];
    const studentIds: string[] = [];
    for (const s of scheduledForDay) {
      studentIds.push(s.id);
      const lesson = getLessonForStudentOnDate(lessons, s.id, dateKey);
      if (lesson) lessonIds.push(lesson.id);
    }
    const names = scheduledForDay.map((s) => `${s.firstName} ${s.lastName}`).join(", ");
    const summary =
      data.present && studentIds.length > 0
        ? `Mark ${names} attended for ${dateKey}`
        : data.present
          ? `Mark all attended for ${dateKey}`
          : `Mark all absent for ${dateKey}`;
    return {
      intent: "ATTENDANCE_MARK",
      present: data.present,
      dateKey,
      lessonIds,
      studentIds,
      summary: studentIds.length > 0 ? summary : `No students scheduled for ${dateKey}`,
    };
  }

  const resolved = resolveNamesToStudentsAndLessons(
    data.nameFragments,
    students,
    lessons,
    dateKey
  );
  if (resolved.length === 0) return null;
  const lessonIds = resolved.map((r) => r.lessonId).filter((id): id is string => id != null);
  const studentIds = resolved.map((r) => r.studentId);
  const names = resolved.map((r) => `${r.student.firstName} ${r.student.lastName}`).join(" + ");
  const summary = data.present
    ? `Mark ${names} attended for ${dateKey}`
    : `Mark ${names} absent for ${dateKey}`;
  return {
    intent: "ATTENDANCE_MARK",
    present: data.present,
    dateKey,
    lessonIds,
    studentIds,
    summary,
  };
}

/**
 * Find the lesson to reschedule: by (studentId + fromDateKey) or next upcoming for that student.
 */
function findLessonToReschedule(
  studentId: string,
  fromDateKey: string | null,
  lessons: Lesson[],
  todayKey: string
): Lesson | null {
  if (fromDateKey) {
    const onFrom = getLessonForStudentOnDate(lessons, studentId, fromDateKey);
    if (onFrom) return onFrom;
  }
  const studentLessons = lessons
    .filter((l) => l.studentId === studentId && l.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  return studentLessons[0] ?? null;
}

/**
 * Resolve LESSON_RESCHEDULE payload: match student name, find lesson (from_date or next upcoming).
 */
export function resolveLessonReschedule(
  payload: VoiceCommandPayload,
  ctx: ResolveContext
): ResolvedLessonReschedule | null {
  if (payload.intent !== "LESSON_RESCHEDULE" || !payload.data) return null;
  const data = payload.data as import("./types").LessonRescheduleData;
  const { students, lessons, dashboardDateKey } = ctx;
  const fragment = data.studentNameFragment?.trim();
  if (!fragment) return null;

  const candidates = students
    .map((s) => ({ student: s, score: scoreMatch(fragment, s) }))
    .filter((c) => c.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return null;
  const best = candidates[0];
  if (candidates.length >= 2 && candidates[0].score - candidates[1].score < 0.1) return null;
  const student = best.student;
  const lesson = findLessonToReschedule(
    student.id,
    data.fromDateKey,
    lessons,
    dashboardDateKey
  );
  if (!lesson) return null;

  const studentName = `${student.firstName} ${student.lastName}`;
  const toTime = data.toTime ?? lesson.timeOfDay ?? undefined;
  const durationMinutes = data.durationMinutes ?? lesson.durationMinutes;
  const amountCents = lesson.amountCents;
  const summary = `Move ${studentName} from ${lesson.date} → ${data.toDateKey}${toTime ? ` ${toTime}` : ""}${durationMinutes ? ` (${durationMinutes} min)` : ""}`;
  return {
    intent: "LESSON_RESCHEDULE",
    lessonId: lesson.id,
    studentId: student.id,
    toDateKey: data.toDateKey,
    toTime: data.toTime ?? null,
    durationMinutes,
    amountCents: amountCents ?? null,
    summary,
  };
}

/**
 * Resolve a parsed voice command into an executable resolved command (or null if ambiguous/unresolvable).
 */
export function resolveVoiceCommand(
  payload: VoiceCommandPayload,
  ctx: ResolveContext
): ResolvedAttendanceMark | ResolvedLessonReschedule | null {
  if (payload.intent === "ATTENDANCE_MARK") return resolveAttendanceMark(payload, ctx);
  if (payload.intent === "LESSON_RESCHEDULE") return resolveLessonReschedule(payload, ctx);
  return null;
}
