/**
 * Voice Command Router — step 3: execute resolved intents (Supabase-safe).
 * Attendance: update lessons by id (completed), or add lesson if none. Reschedule: UPDATE existing lesson by id only.
 */

import type { ResolvedVoiceCommand } from "./types";
import type { Lesson, Student } from "@/types";
import { getLessonForStudentOnDate, getEffectiveDurationMinutes, getEffectiveRateCents } from "@/utils/earnings";

export interface ExecuteContext {
  updateLesson: (id: string, updates: Partial<Lesson>) => Promise<void>;
  addLesson: (lesson: Omit<Lesson, "id">) => Promise<string>;
  lessons: Lesson[];
  students: Student[];
}

/**
 * Execute a resolved ATTENDANCE_MARK: set completed on existing lessons or create lessons.
 * Does not insert duplicates; updates by lesson id.
 */
export async function executeAttendanceMark(
  resolved: Extract<ResolvedVoiceCommand, { intent: "ATTENDANCE_MARK" }>,
  ctx: ExecuteContext
): Promise<void> {
  const { updateLesson, addLesson, lessons, students } = ctx;
  const { dateKey, present, studentIds } = resolved;

  for (const studentId of studentIds) {
    const student = students.find((s) => s.id === studentId);
    if (!student) continue;
    const existing = getLessonForStudentOnDate(lessons, studentId, dateKey);
    if (existing) {
      await updateLesson(existing.id, { completed: present });
    } else {
      await addLesson({
        studentId,
        date: dateKey,
        durationMinutes: getEffectiveDurationMinutes(student, dateKey),
        amountCents: getEffectiveRateCents(student, dateKey),
        completed: present,
      });
    }
  }
}

/**
 * Execute a resolved LESSON_RESCHEDULE: UPDATE the existing lesson row by id (date, timeOfDay, durationMinutes, amountCents).
 * Never insert a new row for reschedule.
 */
export async function executeLessonReschedule(
  resolved: Extract<ResolvedVoiceCommand, { intent: "LESSON_RESCHEDULE" }>,
  ctx: ExecuteContext
): Promise<void> {
  const { updateLesson, lessons } = ctx;
  const { lessonId, toDateKey, toTime, durationMinutes, amountCents } = resolved;

  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return;

  const updates: Partial<Lesson> = {
    date: toDateKey,
  };
  if (toTime != null) updates.timeOfDay = toTime;
  if (durationMinutes != null) updates.durationMinutes = durationMinutes;
  if (amountCents != null) updates.amountCents = amountCents;
  await updateLesson(lessonId, updates);
}

export async function executeVoiceIntent(
  resolved: ResolvedVoiceCommand,
  ctx: ExecuteContext
): Promise<void> {
  if (resolved.intent === "ATTENDANCE_MARK") {
    await executeAttendanceMark(resolved, ctx);
    return;
  }
  if (resolved.intent === "LESSON_RESCHEDULE") {
    await executeLessonReschedule(resolved, ctx);
    return;
  }
}
