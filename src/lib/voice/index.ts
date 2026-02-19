/**
 * Voice Command Router — public API.
 * 1) parseVoiceCommand: transcript → intent payload (local deterministic parsing)
 * 2) resolveVoiceCommand: payload + context → resolved command (student/lesson IDs)
 * 3) executeVoiceIntent: resolved + context → Supabase writes (attendance UPDATE, reschedule UPDATE by id)
 */

export { parseVoiceCommand } from "./parseVoiceCommand";
export { resolveVoiceCommand, resolveAttendanceMark, resolveLessonReschedule } from "./resolveEntities";
export type { ResolveContext } from "./resolveEntities";
export { executeVoiceIntent, executeAttendanceMark, executeLessonReschedule } from "./executeVoiceIntent";
export type { ExecuteContext } from "./executeVoiceIntent";
export type {
  VoiceCommandPayload,
  VoiceIntent,
  VoiceLanguage,
  AttendanceMarkData,
  LessonRescheduleData,
  ResolvedVoiceCommand,
  ResolvedAttendanceMark,
  ResolvedLessonReschedule,
} from "./types";
