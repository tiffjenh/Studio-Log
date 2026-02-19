/**
 * Voice Command Router — step 1: deterministic local parsing + language detection.
 * Converts speech transcript into structured intents (ATTENDANCE_MARK, LESSON_RESCHEDULE, UNKNOWN).
 */

import type {
  VoiceCommandPayload,
  VoiceLanguage,
  AttendanceMarkData,
  LessonRescheduleData,
} from "./types";

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const SPANISH_WORDS = /\b(vino|asisti[óo]|asistieron|hoy|ayer|mañana|todos|todas|mover|reprogramar|vinieron)\b/i;
function detectLanguage(text: string): VoiceLanguage {
  if (CJK_RANGE.test(text)) return "zh";
  if (SPANISH_WORDS.test(text)) return "es";
  return "en";
}

/* ---------- Date parsing (local, timezone-agnostic YYYY-MM-DD) ---------- */
const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0, febrero: 1, feb: 1, february: 1,
  march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5,
  july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
  enero: 0, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};
const DAY_NAMES = "sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat";
const DAY_NUM: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5,
  saturday: 6, sat: 6,
  lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 0,
};

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateFromText(text: string, todayKey: string): string {
  const today = new Date(todayKey + "T12:00:00");
  const lower = text.toLowerCase();

  if (/\b(yesterday|ayer)\b|昨天/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return toYMD(d);
  }
  if (/\b(tomorrow|mañana)\b|明天/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toYMD(d);
  }
  if (/\b(today|hoy)\b|今天/.test(lower)) return todayKey;

  const nextDayRe = new RegExp(`\\bnext\\s+(${DAY_NAMES})\\b`);
  const nextM = lower.match(nextDayRe);
  if (nextM && DAY_NUM[nextM[1]] != null) {
    const d = new Date(today);
    const target = DAY_NUM[nextM[1]];
    const fwd = (target - today.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + fwd);
    return toYMD(d);
  }

  const lastDayRe = new RegExp(`\\blast\\s+(${DAY_NAMES})\\b`);
  const lastM = lower.match(lastDayRe);
  if (lastM && DAY_NUM[lastM[1]] != null) {
    const d = new Date(today);
    const target = DAY_NUM[lastM[1]];
    const back = (today.getDay() - target + 7) % 7 || 7;
    d.setDate(d.getDate() - back);
    return toYMD(d);
  }

  const monthDayRe = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const mm = lower.match(monthDayRe);
  if (mm) {
    const month = MONTH_MAP[mm[1].toLowerCase()];
    const day = parseInt(mm[2], 10);
    if (month != null && day >= 1 && day <= 31) {
      let year = today.getFullYear();
      const candidate = new Date(year, month, day);
      if (candidate.getTime() - today.getTime() > 180 * 24 * 60 * 60 * 1000) year--;
      return toYMD(new Date(year, month, day));
    }
  }

  const numericRe = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
  const nm = text.match(numericRe);
  if (nm) {
    const m = parseInt(nm[1], 10);
    const d = parseInt(nm[2], 10);
    const y = nm[3] ? parseInt(nm[3], 10) : today.getFullYear();
    const year = y < 100 ? 2000 + y : y;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return toYMD(new Date(year, m - 1, d));
    }
  }

  return todayKey;
}

/** Extract from/to date keys. Handles "from Friday Feb 18 to Sunday Feb 20 at 5pm". */
function extractFromToDates(text: string, todayKey: string): { fromKey: string | null; toKey: string } {
  const fromToMatch = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)/i);
  if (fromToMatch) {
    const fromPhrase = fromToMatch[1].replace(/\s+at\s+.*$/i, "").trim();
    const toPhrase = fromToMatch[2].replace(/\s+at\s+.*$/i, "").replace(/\s+for\s+.*$/i, "").trim();
    const fromKey = parseDateFromText(fromPhrase, todayKey);
    const toKey = parseDateFromText(toPhrase, todayKey);
    return { fromKey, toKey };
  }
  const toOnlyMatch = text.match(/\bto\s+([^.,]+?)(?:\s+at\s|\s+for\s|$)/i);
  if (toOnlyMatch) {
    const toKey = parseDateFromText(toOnlyMatch[1].trim(), todayKey);
    return { fromKey: null, toKey };
  }
  const toKey = parseDateFromText(text, todayKey);
  return { fromKey: null, toKey };
}

/* ---------- Time parsing (e.g. "5pm", "5:00 PM", "17:00") ---------- */
function parseTimeOfDay(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const match = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const period = (match[3] || "").toLowerCase();
  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  if (!period && hour <= 12) hour = hour < 12 ? hour + 12 : hour;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const amPm = hour < 12 ? "AM" : "PM";
  return `${displayHour}:${String(Math.min(59, Math.max(0, minute))).padStart(2, "0")} ${amPm}`;
}

function extractTimeFromText(text: string): string | null {
  const atTime = text.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (atTime) return parseTimeOfDay(atTime[1].trim());
  const timeOnly = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:for|$)/i);
  if (timeOnly) return parseTimeOfDay(timeOnly[1].trim());
  const end = text.match(/(\d{1,2})\s*(?:pm|am)\b/i);
  if (end) return parseTimeOfDay(end[0]);
  return null;
}

function extractDurationMinutes(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (m) return Math.min(120, Math.max(15, parseInt(m[1], 10)));
  const h = text.match(/([\d.]+)\s*(?:hours?|hrs?)\b/i);
  if (h) return Math.min(120, Math.max(30, Math.round(parseFloat(h[1]) * 60)));
  if (/\b1\s*hr\b|\bone\s+hour\b/i.test(text)) return 60;
  if (/\b1\.5\s*hr|\b1\s*hr\s*30\b/i.test(text)) return 90;
  if (/\b2\s*hr/i.test(text)) return 120;
  return null;
}

function isRescheduleIntent(text: string): boolean {
  const lower = text.toLowerCase();
  if (/move|reschedule|mover|reprogramar/.test(lower)) return true;
  if (/改到|挪到|改期|移到/.test(text)) return true;
  return false;
}

function extractStudentNameForReschedule(text: string): string | null {
  let name: string | null = null;
  const moveMatch = text.match(/\bmove\s+([A-Za-z\u4e00-\u9fff]+)(?:'s|s)?\s+(?:lesson\s+)?/i);
  if (moveMatch) name = moveMatch[1].trim();
  if (!name) {
    const rescheduleMatch = text.match(/\breschedule\s+([A-Za-z\u4e00-\u9fff]+)\s+(?:from|to)/i);
    if (rescheduleMatch) name = rescheduleMatch[1].trim();
  }
  if (!name) {
    const fromMatch = text.match(/([A-Za-z\u4e00-\u9fff]+)(?:'s|s)?\s+lesson\s+from/i);
    if (fromMatch) name = fromMatch[1].trim();
  }
  if (!name && /改到|挪到/.test(text)) {
    const zhMatch = text.match(/([A-Za-z\u4e00-\u9fff]{2,})?(?:的)?(?:课|课)?(?:改到|挪到)/);
    if (zhMatch && zhMatch[1]) name = zhMatch[1].trim();
  }
  return name || null;
}

/* ---------- Attendance bulk / absent patterns ---------- */
const BULK_ATTENDED = [
  /\b(?:all\s+students?|everyone|everybody)\s+(?:came|attended|were?\s+here|showed\s+up)\b/i,
  /\b(?:mark\s+)?all\s+as\s+attended\b/i,
  /\ball\s+(?:came|attended)\s+today\b/i,
  /\btodos\s+(?:vinieron|asistieron)\b/i,
  /所有学生.*(?:都)?来了/,
  /全部.*来了/,
  /所有人.*来了/,
];
const BULK_ABSENT = [
  /\b(?:all|everyone)\s+(?:absent|didn'?t\s+come)\b/i,
  /\bmark\s+all\s+as\s+absent\b/i,
  /都没来/,
  /全部缺席/,
];
const ABSENT_PHRASES = [
  /didn'?t\s+come/i, /\babsent\b/i, /\bno[\s-]show\b/i, /\bdidn'?t\s+attend\b/i,
  /\bno\s+vino\b/i, /\bno\s+asisti[óo]\b/i, /没来/, /缺席/,
];

function isBulkAttended(text: string): boolean {
  return BULK_ATTENDED.some((p) => p.test(text));
}
function isBulkAbsent(text: string): boolean {
  return BULK_ABSENT.some((p) => p.test(text));
}
function isAbsentPhrase(text: string): boolean {
  return ABSENT_PHRASES.some((p) => p.test(text));
}

/* ---------- Name extraction (and, y, 和) ---------- */
const NAME_CONNECTORS = /\s*(?:,|，|;\s*|\band\b|\by\b|和|跟|还有)\s*/i;

function extractNameFragments(text: string): string[] {
  let cleaned = text
    .replace(/\b(?:came|attended|didn'?t\s+come|absent|today|yesterday|mark|all|everyone)\b/gi, " ")
    .replace(/\b(?:vinieron|asistieron|vino|asisti[óo]|hoy|ayer|todos|todas)\b/gi, " ")
    .replace(/今天|昨天|来了|没来|缺席|所有|全部/g, " ")
    .replace(/\b(the|a|to|for|his|her|their|lesson|lessons?)\b/gi, " ");
  const parts = cleaned.split(NAME_CONNECTORS).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 1 && !/^\d+$/.test(s));
  return parts.filter((p) => /[A-Za-z\u4e00-\u9fff]/.test(p));
}

/**
 * Parse transcript into a strict intent payload (deterministic local parsing).
 * todayKey: current dashboard date (YYYY-MM-DD).
 */
export function parseVoiceCommand(transcript: string, todayKey: string): VoiceCommandPayload {
  const text = transcript.trim();
  if (!text) {
    return { intent: "UNKNOWN", language: "en", confidence: 0, data: null };
  }

  const language = detectLanguage(text);

  // 1) LESSON_RESCHEDULE
  if (isRescheduleIntent(text)) {
    const studentNameFragment = extractStudentNameForReschedule(text);
    const { fromKey, toKey } = extractFromToDates(text, todayKey);
    const toTime = extractTimeFromText(text);
    const durationMinutes = extractDurationMinutes(text);
    return {
      intent: "LESSON_RESCHEDULE",
      language,
      confidence: studentNameFragment && toKey ? 0.85 : 0.5,
      data: {
        studentNameFragment: studentNameFragment || "",
        fromDateKey: fromKey && fromKey !== toKey ? fromKey : null,
        toDateKey: toKey,
        toTime,
        durationMinutes,
      } as LessonRescheduleData,
    };
  }

  // 2) ATTENDANCE_MARK — bulk
  if (isBulkAttended(text)) {
    const dateKey = parseDateFromText(text, todayKey);
    return {
      intent: "ATTENDANCE_MARK",
      language,
      confidence: 0.9,
      data: {
        scope: "all",
        present: true,
        nameFragments: [],
        dateKey,
      } as AttendanceMarkData,
    };
  }
  if (isBulkAbsent(text)) {
    const dateKey = parseDateFromText(text, todayKey);
    return {
      intent: "ATTENDANCE_MARK",
      language,
      confidence: 0.9,
      data: {
        scope: "all",
        present: false,
        nameFragments: [],
        dateKey,
      } as AttendanceMarkData,
    };
  }

  // 3) ATTENDANCE_MARK — named (one or more)
  const nameFragments = extractNameFragments(text);
  const present = !isAbsentPhrase(text);
  const dateKey = parseDateFromText(text, todayKey);

  if (nameFragments.length > 0) {
    return {
      intent: "ATTENDANCE_MARK",
      language,
      confidence: nameFragments.length <= 3 ? 0.85 : 0.7,
      data: {
        scope: "named",
        present,
        nameFragments,
        dateKey,
      } as AttendanceMarkData,
    };
  }

  return { intent: "UNKNOWN", language, confidence: 0, data: null };
}
