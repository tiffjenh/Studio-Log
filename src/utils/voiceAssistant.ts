/**
 * Voice Assistant — on-device, rule-based NLP for marking attendance via speech.
 *
 * Supports English, Spanish, and Chinese (Simplified).
 * Converts a spoken transcript into structured actions (set_attendance, set_duration, set_rate).
 */

import type { Student } from "@/types";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type DetectedLanguage = "en" | "es" | "zh";
export type ActionType = "set_attendance" | "set_duration" | "set_rate";
export type Intent = "mark_attendance" | "edit_lesson" | "query" | "clarify";

export interface AttendanceAction {
  type: "set_attendance";
  student_id: string;
  date: string;
  present: boolean;
  confidence: number;
}

export interface DurationAction {
  type: "set_duration";
  student_id: string;
  date: string;
  duration_minutes: number;
  confidence: number;
}

export interface RateAction {
  type: "set_rate";
  student_id: string;
  date: string;
  rate: number;
  confidence: number;
}

export type VoiceAction = AttendanceAction | DurationAction | RateAction;

export interface UnmatchedMention {
  spoken_name: string;
  reason: "not_found" | "ambiguous" | "not_scheduled_today";
}

export interface VoiceResult {
  language_detected: DetectedLanguage[];
  intent: Intent;
  actions: VoiceAction[];
  clarifying_question: string | null;
  unmatched_mentions: UnmatchedMention[];
  /** If the user requested navigation to a specific date, this will be set (YYYY-MM-DD). */
  navigated_date: string | null;
}

export interface ScheduledLesson {
  student_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  scheduled_time: string;
  default_duration_minutes: number;
  default_rate: number;
}

/* ------------------------------------------------------------------ */
/*  Language detection                                                 */
/* ------------------------------------------------------------------ */

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const SPANISH_WORDS = /\b(vino|asisti[óo]|asistieron|no\s+vino|estuvo\s+ausente|hoy|ayer|lección|lecciones|minutos|hora|horas|vino\s+hoy|también|todos|todas|clase)\b/i;
const ENGLISH_WORDS = /\b(came|attended|absent|didn'?t\s+come|today|yesterday|lesson|minutes|hours?|present|showed\s+up|was\s+here|no\s+show)\b/i;

function detectLanguages(text: string): DetectedLanguage[] {
  const langs: DetectedLanguage[] = [];
  if (CJK_RANGE.test(text)) langs.push("zh");
  if (SPANISH_WORDS.test(text)) langs.push("es");
  if (ENGLISH_WORDS.test(text) || (!langs.length)) langs.push("en");
  return langs.length ? langs : ["en"];
}

/* ------------------------------------------------------------------ */
/*  Date parsing                                                       */
/* ------------------------------------------------------------------ */

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0, febrero: 1, february: 1, feb: 1, march: 2, mar: 2, marzo: 2,
  april: 3, apr: 3, abril: 3, may: 4, mayo: 4, june: 5, jun: 5, junio: 5,
  july: 6, jul: 6, julio: 6, august: 7, aug: 7, agosto: 7,
  september: 8, sep: 8, sept: 8, septiembre: 8, october: 9, oct: 9, octubre: 9,
  november: 10, nov: 10, noviembre: 10, december: 11, dec: 11, diciembre: 11,
};

const DAY_NAME_MAP: Record<string, number> = {
  sunday: 0, sun: 0, domingo: 0,
  monday: 1, mon: 1, lunes: 1,
  tuesday: 2, tue: 2, tues: 2, martes: 2,
  wednesday: 3, wed: 3, miercoles: 3, miércoles: 3,
  thursday: 4, thu: 4, thurs: 4, jueves: 4,
  friday: 5, fri: 5, viernes: 5,
  saturday: 6, sat: 6, sabado: 6, sábado: 6,
};

interface DateInfo {
  date: string; // YYYY-MM-DD
  isExplicitNonToday: boolean;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(text: string, todayKey: string): DateInfo {
  const today = new Date(todayKey + "T12:00:00");
  const lower = text.toLowerCase();

  // Yesterday / 昨天 / ayer
  if (/\b(yesterday|ayer)\b|昨天/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { date: toYMD(d), isExplicitNonToday: true };
  }

  // "last Monday", "last Tuesday" etc.
  const lastDayMatch = lower.match(/\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/);
  if (lastDayMatch) {
    const targetDay = DAY_NAME_MAP[lastDayMatch[1]];
    if (targetDay != null) {
      const d = new Date(today);
      // Go back to find the most recent occurrence of that day (always in the past)
      const diff = (today.getDay() - targetDay + 7) % 7 || 7;
      d.setDate(d.getDate() - diff);
      return { date: toYMD(d), isExplicitNonToday: true };
    }
  }

  // "Monday February 9", "Feb 9", "February 9th", "Monday Feb 9"
  // Pattern: optional day name + month name + day number
  const monthDayMatch = lower.match(
    /(?:(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\s+)?(?:go\s+to\s+)?(?:(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  );
  if (monthDayMatch) {
    const month = MONTH_MAP[monthDayMatch[1]];
    const day = parseInt(monthDayMatch[2], 10);
    if (month != null && day >= 1 && day <= 31) {
      // Use current year, or previous year if the date is far in the future
      let year = today.getFullYear();
      const candidate = new Date(year, month, day);
      // If the date is more than 6 months in the future, assume previous year
      if (candidate.getTime() - today.getTime() > 180 * 24 * 60 * 60 * 1000) {
        year--;
      }
      const d = new Date(year, month, day);
      const key = toYMD(d);
      return { date: key, isExplicitNonToday: key !== todayKey };
    }
  }

  // "go to Monday", "on Wednesday" — day name without a month (find nearest past/future occurrence)
  const gotoDay = lower.match(/(?:go\s+to|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/);
  if (gotoDay) {
    const targetDay = DAY_NAME_MAP[gotoDay[1]];
    if (targetDay != null) {
      const d = new Date(today);
      // Find the nearest occurrence (past first, then future)
      const backDiff = (today.getDay() - targetDay + 7) % 7;
      if (backDiff === 0) {
        // It's today
        return { date: todayKey, isExplicitNonToday: false };
      }
      d.setDate(d.getDate() - backDiff);
      return { date: toYMD(d), isExplicitNonToday: true };
    }
  }

  // Bare day name at the start of the sentence (e.g. "Monday, waffles came")
  const bareDayMatch = lower.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (bareDayMatch) {
    const targetDay = DAY_NAME_MAP[bareDayMatch[1]];
    if (targetDay != null && targetDay !== today.getDay()) {
      const d = new Date(today);
      const backDiff = (today.getDay() - targetDay + 7) % 7 || 7;
      d.setDate(d.getDate() - backDiff);
      return { date: toYMD(d), isExplicitNonToday: true };
    }
  }

  // Default to today
  return { date: todayKey, isExplicitNonToday: false };
}

/**
 * Strip date-related phrases from the transcript so they don't interfere with name extraction.
 */
function stripDatePhrases(text: string): string {
  return text
    .replace(/\b(?:go\s+to|on)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/gi, " ")
    .replace(/\blast\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/gi, " ")
    .replace(/\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, " ")
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, " ")
    .replace(/\b(?:go\s+to)\b/gi, " ");
}

/* ------------------------------------------------------------------ */
/*  Absence detection                                                  */
/* ------------------------------------------------------------------ */

const ABSENT_PATTERNS = [
  // English
  /didn'?t\s+come/i,
  /\babsent\b/i,
  /\bno[\s-]show\b/i,
  /\bnot\s+here\b/i,
  /\bwasn'?t\s+here\b/i,
  /\bdidn'?t\s+attend\b/i,
  /\bdidn'?t\s+show/i,
  /\bskipped\b/i,
  /\bmissed\b/i,
  // Spanish
  /\bno\s+vino\b/i,
  /\bestuvo\s+ausente\b/i,
  /\bno\s+asisti[óo]\b/i,
  /\bausente\b/i,
  /\bno\s+lleg[óo]\b/i,
  /\bfalt[óo]\b/i,
  // Chinese
  /没来/,
  /缺席/,
  /没有来/,
  /没到/,
  /缺课/,
];

function isAbsent(textAroundName: string): boolean {
  return ABSENT_PATTERNS.some((p) => p.test(textAroundName));
}

/* ------------------------------------------------------------------ */
/*  Duration parsing                                                   */
/* ------------------------------------------------------------------ */

interface ParsedDuration {
  minutes: number;
  studentHint: string; // text fragment near the duration for matching
}

function parseDurations(text: string): ParsedDuration[] {
  const results: ParsedDuration[] = [];
  // English: "90 minutes", "1.5 hours", "1 hour", "2 hours"
  const enMin = text.matchAll(/(\d+)\s*(?:minutes?|mins?)\b/gi);
  for (const m of enMin) {
    results.push({ minutes: parseInt(m[1], 10), studentHint: text.slice(Math.max(0, m.index! - 40), m.index!) });
  }
  const enHr = text.matchAll(/([\d.]+)\s*(?:hours?|hrs?)\b/gi);
  for (const m of enHr) {
    results.push({ minutes: Math.round(parseFloat(m[1]) * 60), studentHint: text.slice(Math.max(0, m.index! - 40), m.index!) });
  }
  // Spanish: "90 minutos", "1.5 horas"
  const esMin = text.matchAll(/(\d+)\s*minutos?\b/gi);
  for (const m of esMin) {
    results.push({ minutes: parseInt(m[1], 10), studentHint: text.slice(Math.max(0, m.index! - 40), m.index!) });
  }
  const esHr = text.matchAll(/([\d.]+)\s*horas?\b/gi);
  for (const m of esHr) {
    results.push({ minutes: Math.round(parseFloat(m[1]) * 60), studentHint: text.slice(Math.max(0, m.index! - 40), m.index!) });
  }
  // Chinese: "九十分钟", "90分钟", "一个半小时", "1.5小时"
  const zhMin = text.matchAll(/([\d]+)\s*分钟/g);
  for (const m of zhMin) {
    results.push({ minutes: parseInt(m[1], 10), studentHint: text.slice(Math.max(0, m.index! - 20), m.index!) });
  }
  const zhHr = text.matchAll(/([\d.]+)\s*小时/g);
  for (const m of zhHr) {
    results.push({ minutes: Math.round(parseFloat(m[1]) * 60), studentHint: text.slice(Math.max(0, m.index! - 20), m.index!) });
  }
  // Chinese number words
  if (/三十分钟/.test(text)) results.push({ minutes: 30, studentHint: "" });
  if (/四十五分钟/.test(text)) results.push({ minutes: 45, studentHint: "" });
  if (/六十分钟/.test(text)) results.push({ minutes: 60, studentHint: "" });
  if (/九十分钟/.test(text)) results.push({ minutes: 90, studentHint: "" });
  if (/一百二十分钟/.test(text)) results.push({ minutes: 120, studentHint: "" });
  if (/一个半小时/.test(text)) results.push({ minutes: 90, studentHint: "" });
  if (/两个小时|两小时/.test(text)) results.push({ minutes: 120, studentHint: "" });

  return results;
}

/* ------------------------------------------------------------------ */
/*  Rate parsing                                                       */
/* ------------------------------------------------------------------ */

interface ParsedRate {
  amount: number;
  studentHint: string;
}

function parseRates(text: string): ParsedRate[] {
  const results: ParsedRate[] = [];
  // "$100", "100 dollars", "100 dólares", "100块", "100元"
  const dollar = text.matchAll(/\$\s*([\d.]+)/g);
  for (const m of dollar) {
    results.push({ amount: parseFloat(m[1]), studentHint: text.slice(Math.max(0, m.index! - 40), m.index!) });
  }
  const dollarWord = text.matchAll(/([\d.]+)\s*(?:dollars?|bucks?|dólares?)\b/gi);
  for (const m of dollarWord) {
    results.push({ amount: parseFloat(m[1]), studentHint: text.slice(Math.max(0, m.index! - 40), m.index!) });
  }
  const yuan = text.matchAll(/([\d.]+)\s*[块元]/g);
  for (const m of yuan) {
    results.push({ amount: parseFloat(m[1]), studentHint: text.slice(Math.max(0, m.index! - 20), m.index!) });
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Fuzzy name matching                                                */
/* ------------------------------------------------------------------ */

/** Normalize a string for comparison: lowercase, strip accents, trim. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Simple Levenshtein distance. */
function levenshtein(a: string, b: string): number {
  const an = a.length, bn = b.length;
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

interface NameMatch {
  student: ScheduledLesson;
  confidence: number;
}

/**
 * Try to match a spoken name fragment against today's scheduled lessons.
 * Returns matched students sorted by confidence (descending).
 */
function matchStudentName(
  spoken: string,
  lessons: ScheduledLesson[],
  allStudents: ScheduledLesson[]
): { scheduled: NameMatch[]; unscheduled: NameMatch[] } {
  const s = norm(spoken);
  if (!s) return { scheduled: [], unscheduled: [] };

  const score = (student: ScheduledLesson): number => {
    const first = norm(student.first_name);
    const last = norm(student.last_name);
    const full = norm(student.full_name);

    // Exact full name
    if (s === full) return 1.0;
    // Exact last name + first name (reversed)
    if (s === `${last} ${first}` || s === `${first} ${last}`) return 1.0;
    // Exact first name only
    if (s === first) return 0.9;
    // Exact last name only
    if (s === last) return 0.85;
    // Full name starts with spoken
    if (full.startsWith(s) || `${first} ${last}`.startsWith(s)) return 0.8;
    // Spoken contains first or last name
    if (s.includes(first) && first.length > 1) return 0.75;
    if (s.includes(last) && last.length > 1) return 0.75;
    // Fuzzy match on first name (Levenshtein ≤ 2)
    const dFirst = levenshtein(s, first);
    if (dFirst <= 2 && first.length >= 3) return Math.max(0.4, 0.8 - dFirst * 0.15);
    // Fuzzy match on last name
    const dLast = levenshtein(s, last);
    if (dLast <= 2 && last.length >= 3) return Math.max(0.4, 0.75 - dLast * 0.15);
    // Fuzzy on full name
    const dFull = levenshtein(s, full);
    if (dFull <= 3 && full.length >= 5) return Math.max(0.3, 0.7 - dFull * 0.1);

    return 0;
  };

  const scheduledMatches: NameMatch[] = [];
  for (const l of lessons) {
    const c = score(l);
    if (c >= 0.3) scheduledMatches.push({ student: l, confidence: c });
  }
  scheduledMatches.sort((a, b) => b.confidence - a.confidence);

  // Also check unscheduled students
  const scheduledIds = new Set(lessons.map((l) => l.student_id));
  const unscheduledMatches: NameMatch[] = [];
  for (const st of allStudents) {
    if (scheduledIds.has(st.student_id)) continue;
    const c = score(st);
    if (c >= 0.3) unscheduledMatches.push({ student: st, confidence: c });
  }
  unscheduledMatches.sort((a, b) => b.confidence - a.confidence);

  return { scheduled: scheduledMatches, unscheduled: unscheduledMatches };
}

/* ------------------------------------------------------------------ */
/*  Name extraction from transcript                                    */
/* ------------------------------------------------------------------ */

/**
 * Extract name-like segments from the transcript.
 * Strategy: strip known non-name words, then split on connectors ("and", "y", "和", commas).
 */
function extractNameSegments(text: string): string[] {
  // Remove date phrases first
  let cleaned = stripDatePhrases(text);
  const stripPatterns = [
    // English
    /\b(came|attended|was\s+here|showed\s+up|present|didn'?t\s+come|absent|no[\s-]show|wasn'?t\s+here|didn'?t\s+attend|didn'?t\s+show|skipped|missed|today|yesterday|this\s+morning|this\s+afternoon|did|had|took|lesson|lessons?|class)\b/gi,
    // Spanish
    /\b(vino|asisti[óo]|asistieron|estuvo\s+ausente|no\s+vino|no\s+asisti[óo]|ausente|falt[óo]|hoy|ayer|esta\s+mañana|esta\s+tarde|lección|lecciones|clase|tuvieron?|tom[óo])\b/gi,
    // Chinese attendance words
    /今天|昨天|今早|今天早上|今天下午|来了|没来|缺席|没有来|没到|缺课|上课了|的课/g,
    // Duration/rate words
    /\d+\s*(minutes?|mins?|hours?|hrs?|minutos?|horas?|dollars?|bucks?|dólares?|分钟|小时|块|元)\b/gi,
    /\$[\d.]+/g,
    // Day/month names that might remain after date phrase stripping
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi,
    // Filler
    /\b(the|a|an|to|for|on|at|in|el|la|los|las|de|del|了|的|和|都)\b/gi,
  ];
  for (const p of stripPatterns) {
    cleaned = cleaned.replace(p, " ");
  }

  // Split on connectors
  const parts = cleaned
    .split(/\s*(?:,|，|;|；|\band\b|\by\b|和|跟|还有)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Further clean each segment
  return parts
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0 && !/^\d+$/.test(p));
}

/* ------------------------------------------------------------------ */
/*  Main processing function                                           */
/* ------------------------------------------------------------------ */

export function processVoiceTranscript(
  transcript: string,
  scheduledLessons: ScheduledLesson[],
  allStudents: ScheduledLesson[],
  todayKey: string
): VoiceResult {
  const text = transcript.trim();
  if (!text) {
    return {
      language_detected: ["en"],
      intent: "clarify",
      actions: [],
      clarifying_question: "I didn't catch that. Could you say that again?",
      unmatched_mentions: [],
      navigated_date: null,
    };
  }

  const languages = detectLanguages(text);
  const { date, isExplicitNonToday } = parseDate(text, todayKey);
  const durations = parseDurations(text);
  const rates = parseRates(text);
  const nameSegments = extractNameSegments(text);

  const actions: VoiceAction[] = [];
  const unmatched: UnmatchedMention[] = [];
  let needsClarification = false;
  let clarifyQuestion: string | null = null;

  // If no names found, try treating the whole transcript as a name query
  const segments = nameSegments.length > 0 ? nameSegments : [text];

  for (const seg of segments) {
    const { scheduled, unscheduled } = matchStudentName(seg, scheduledLessons, allStudents);

    if (scheduled.length === 0 && unscheduled.length === 0) {
      // No match at all — only flag if segment looks like a name (has uppercase or CJK)
      if (/[A-Z]/.test(seg) || CJK_RANGE.test(seg) || seg.length >= 2) {
        unmatched.push({ spoken_name: seg, reason: "not_found" });
        needsClarification = true;
      }
      continue;
    }

    if (scheduled.length === 0 && unscheduled.length > 0) {
      // Student exists but not scheduled today
      const best = unscheduled[0];
      unmatched.push({ spoken_name: seg, reason: "not_scheduled_today" });
      clarifyQuestion = `${best.student.full_name} isn't on today's schedule — log it anyway?`;
      needsClarification = true;
      continue;
    }

    // Ambiguous: multiple high-confidence matches among scheduled
    if (scheduled.length >= 2 && scheduled[0].confidence - scheduled[1].confidence < 0.1) {
      const names = scheduled.slice(0, 3).map((m) => m.student.full_name).join(", ");
      unmatched.push({ spoken_name: seg, reason: "ambiguous" });
      clarifyQuestion = `Did you mean ${names}?`;
      needsClarification = true;
      continue;
    }

    const best = scheduled[0];
    const absent = isAbsent(text);

    // Check for duration edit
    const durationForStudent = durations.find((d) =>
      d.studentHint.length === 0 || norm(d.studentHint).includes(norm(best.student.first_name))
    );
    if (durationForStudent) {
      actions.push({
        type: "set_duration",
        student_id: best.student.student_id,
        date,
        duration_minutes: durationForStudent.minutes,
        confidence: best.confidence * 0.95,
      });
    }

    // Check for rate edit
    const rateForStudent = rates.find((r) =>
      r.studentHint.length === 0 || norm(r.studentHint).includes(norm(best.student.first_name))
    );
    if (rateForStudent) {
      actions.push({
        type: "set_rate",
        student_id: best.student.student_id,
        date,
        rate: rateForStudent.amount,
        confidence: best.confidence * 0.9,
      });
    }

    // Main attendance action
    actions.push({
      type: "set_attendance",
      student_id: best.student.student_id,
      date,
      present: !absent,
      confidence: best.confidence,
    });
  }

  // Determine intent
  let intent: Intent;
  if (needsClarification) {
    intent = "clarify";
  } else if (actions.some((a) => a.type === "set_duration" || a.type === "set_rate")) {
    intent = "edit_lesson";
  } else if (actions.some((a) => a.type === "set_attendance")) {
    intent = "mark_attendance";
  } else {
    intent = "clarify";
    clarifyQuestion = clarifyQuestion ?? "I didn't understand. Could you say that again?";
  }

  // navigated_date is set if user mentioned a specific date (even today explicitly)
  const navigated_date = isExplicitNonToday ? date : null;

  return {
    language_detected: languages,
    intent,
    actions,
    clarifying_question: clarifyQuestion,
    unmatched_mentions: unmatched,
    navigated_date,
  };
}

/* ------------------------------------------------------------------ */
/*  Helper: build ScheduledLesson[] from app data                      */
/* ------------------------------------------------------------------ */

export function buildScheduledLessons(students: Student[], dateKey: string, _dayOfWeek?: number): ScheduledLesson[] {
  // Import is circular-safe because this only depends on types
  const results: ScheduledLesson[] = [];
  for (const s of students) {
    // Check termination
    if (s.terminatedFromDate && dateKey > s.terminatedFromDate) continue;
    results.push({
      student_id: s.id,
      full_name: `${s.firstName} ${s.lastName}`,
      first_name: s.firstName,
      last_name: s.lastName,
      scheduled_time: s.timeOfDay,
      default_duration_minutes: s.durationMinutes,
      default_rate: s.rateCents,
    });
  }
  return results;
}

export function buildAllStudentList(students: Student[]): ScheduledLesson[] {
  return students.map((s) => ({
    student_id: s.id,
    full_name: `${s.firstName} ${s.lastName}`,
    first_name: s.firstName,
    last_name: s.lastName,
    scheduled_time: s.timeOfDay,
    default_duration_minutes: s.durationMinutes,
    default_rate: s.rateCents,
  }));
}
