/**
 * Voice Command Router — strict intent payload types.
 */

export type VoiceIntent = "ATTENDANCE_MARK" | "LESSON_RESCHEDULE" | "UNKNOWN";
export type VoiceLanguage = "en" | "es" | "zh";

/** Raw parsed data for ATTENDANCE_MARK (before entity resolution). */
export interface AttendanceMarkData {
  /** "all" = all students on the selected day; otherwise parsed name fragments. */
  scope: "all" | "named";
  /** Present vs absent. */
  present: boolean;
  /** Name fragments from transcript (e.g. ["Sarah", "Tiffany"], ["Jason"]). */
  nameFragments: string[];
  /** Resolved date key YYYY-MM-DD from relative/absolute phrase. */
  dateKey: string;
}

/** Raw parsed data for LESSON_RESCHEDULE (before entity resolution). */
export interface LessonRescheduleData {
  /** Student name fragment (e.g. "Leo", "Jason"). */
  studentNameFragment: string;
  /** From date key if mentioned (optional). */
  fromDateKey: string | null;
  /** To date key (required for reschedule). */
  toDateKey: string;
  /** To time of day e.g. "5:00 PM" (optional). */
  toTime: string | null;
  /** Duration minutes (optional). */
  durationMinutes: number | null;
}

export interface VoiceCommandPayload {
  intent: VoiceIntent;
  language: VoiceLanguage;
  confidence: number;
  data: AttendanceMarkData | LessonRescheduleData | null;
}

/** After resolution: ready to execute. */
export interface ResolvedAttendanceMark {
  intent: "ATTENDANCE_MARK";
  present: boolean;
  dateKey: string;
  /** Lesson ids to update (or studentId+dateKey to create). */
  lessonIds: string[];
  /** studentId for each; if no existing lesson, we have studentId + dateKey. */
  studentIds: string[];
  /** Human-readable summary for confirmation/toast. */
  summary: string;
}

export interface ResolvedLessonReschedule {
  intent: "LESSON_RESCHEDULE";
  lessonId: string;
  studentId: string;
  toDateKey: string;
  toTime: string | null;
  durationMinutes: number | null;
  amountCents: number | null;
  summary: string;
}

export type ResolvedVoiceCommand = ResolvedAttendanceMark | ResolvedLessonReschedule;
