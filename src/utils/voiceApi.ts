/**
 * voiceApi.ts — Frontend client for the /api/voice serverless function.
 *
 * Builds context from app data, calls the LLM-backed API, and returns
 * the structured VoiceAPIResult.
 */

import type { Student, Lesson } from "@/types";
import {
  getStudentsForDay,
  getEffectiveSchedule,
  getEffectiveDurationMinutes,
  getEffectiveRateCents,
  getLessonForStudentOnDate,
  toDateKey,
} from "@/utils/earnings";

/* ------------------------------------------------------------------ */
/*  Types matching the LLM JSON schema                                 */
/* ------------------------------------------------------------------ */

export interface VoiceAPIResolvedDates {
  type: "single" | "range" | null;
  start_date: string | null;
  end_date: string | null;
}

export interface NavigateToDateAction {
  type: "navigate_to_date";
  date: string;
  confidence: number;
}

export interface SetAttendanceAction {
  type: "set_attendance";
  lesson_id: string | null;
  student_id: string;
  date: string;
  present: boolean;
  confidence: number;
}

export interface SetAttendanceBulkAction {
  type: "set_attendance_bulk";
  date?: string;
  range?: { start_date: string; end_date: string };
  present: boolean;
  scope: string;
  confidence: number;
}

export interface ClearAttendanceAction {
  type: "clear_attendance";
  date: string;
  student_id: string;
  confidence: number;
}

export interface SetDurationAction {
  type: "set_duration";
  date: string;
  student_id: string;
  duration_minutes: number;
  confidence: number;
}

export interface SetRateAction {
  type: "set_rate";
  date: string;
  student_id: string;
  rate: number;
  confidence: number;
}

export interface SetTimeAction {
  type: "set_time";
  date: string;
  student_id: string;
  start_time: string;
  confidence: number;
}

export interface NavigateToTabAction {
  type: "navigate_to_tab";
  tab: string;
  confidence: number;
}

export type VoiceAPIAction =
  | NavigateToDateAction
  | SetAttendanceAction
  | SetAttendanceBulkAction
  | ClearAttendanceAction
  | SetDurationAction
  | SetRateAction
  | SetTimeAction
  | NavigateToTabAction;

export interface VoiceAPIUnmatchedMention {
  spoken_text: string;
  reason: "not_found" | "ambiguous" | "no_lessons_on_date" | "missing_date";
}

export interface VoiceAPIResult {
  language_detected: string[];
  intent: "navigate" | "mark_attendance" | "edit_lesson" | "query" | "clarify";
  resolved_dates: VoiceAPIResolvedDates;
  actions: VoiceAPIAction[];
  clarifying_question: string | null;
  unmatched_mentions: VoiceAPIUnmatchedMention[];
}

/* ------------------------------------------------------------------ */
/*  Build context from app data                                        */
/* ------------------------------------------------------------------ */

interface VoiceContext {
  today_date: string;
  timezone: string;
  students: {
    student_id: string;
    full_name: string;
    nicknames: string[];
    aliases: string[];
  }[];
  schedule: {
    date: string;
    lessons: {
      lesson_id: string | null;
      student_id: string;
      student_name: string;
      start_time: string;
      duration_minutes: number;
      rate: number;
      attended: boolean | null;
    }[];
  }[];
}

/**
 * Build the context payload to send to /api/voice.
 * Includes the current date's schedule + surrounding dates for common references.
 */
export function buildVoiceContext(
  students: Student[],
  lessons: Lesson[],
  currentDateKey: string
): VoiceContext {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Student list
  const studentList = students.map((s) => ({
    student_id: s.id,
    full_name: `${s.firstName} ${s.lastName}`,
    nicknames: [] as string[],
    aliases: [] as string[],
  }));

  // Build schedules for a window of dates (today + yesterday + surrounding week)
  const currentDate = new Date(currentDateKey + "T12:00:00");
  const datesToInclude: Date[] = [];
  for (let offset = -7; offset <= 7; offset++) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + offset);
    datesToInclude.push(d);
  }

  const scheduleEntries: VoiceContext["schedule"] = [];
  for (const d of datesToInclude) {
    const dk = toDateKey(d);
    const dow = d.getDay();
    const dayStudents = getStudentsForDay(students, dow, dk);
    if (dayStudents.length === 0) continue;

    const dayLessons = dayStudents.map((student) => {
      const existing = getLessonForStudentOnDate(lessons, student.id, dk);
      const schedule = getEffectiveSchedule(student, dk);
      return {
        lesson_id: existing?.id ?? null,
        student_id: student.id,
        student_name: `${student.firstName} ${student.lastName}`,
        start_time: schedule.timeOfDay || "00:00",
        duration_minutes: existing?.durationMinutes ?? getEffectiveDurationMinutes(student, dk),
        rate: (existing?.amountCents ?? getEffectiveRateCents(student, dk)) / 100,
        attended: existing ? existing.completed : null,
      };
    });

    scheduleEntries.push({ date: dk, lessons: dayLessons });
  }

  return {
    today_date: currentDateKey,
    timezone,
    students: studentList,
    schedule: scheduleEntries,
  };
}

/* ------------------------------------------------------------------ */
/*  API call                                                           */
/* ------------------------------------------------------------------ */

export async function callVoiceAPI(
  transcript: string,
  context: VoiceContext
): Promise<VoiceAPIResult> {
  const resp = await fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, context }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error || `API error ${resp.status}`);
  }

  return resp.json();
}
