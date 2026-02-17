/** Strip BOM if present (Excel/Sheets export can add it). */
function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse CSV text into rows. Handles quoted fields with commas.
 */
function parseCSV(text: string): string[][] {
  const cleaned = stripBOM(text);
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inQuotes) {
      if (c === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === "," || c === "\t") {
        current.push(cell.trim());
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && cleaned[i + 1] === "\n") i++;
        current.push(cell.trim());
        if (current.some((s) => s.length > 0)) rows.push(current);
        current = [];
        cell = "";
      } else {
        cell += c;
      }
    }
  }
  current.push(cell.trim());
  if (current.some((s) => s.length > 0)) rows.push(current);
  return rows;
}

function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
}

export interface ImportRow {
  first_name: string;
  last_name: string;
  date: string;
  duration_minutes: number;
  amount_cents: number;
  completed: boolean;
  note?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  /** For matrix import: date range of parsed dates (min, max) so user can see which year(s) were used */
  dateRange?: { min: string; max: string };
  /** For matrix import: years that appear in the imported date range (e.g. [2024, 2025, 2026]) */
  yearsInFile?: number[];
  /** For matrix import: number of lessons saved per year (e.g. { "2024": 500, "2025": 300, "2026": 44 }) */
  countsByYear?: Record<string, number>;
  /** For matrix import: rows skipped because date had no year */
  skippedRowsNoYear?: number;
}

const REQUIRED_COLS = ["first_name", "last_name", "date", "duration_minutes"];
const AMOUNT_COLS = ["amount_cents", "amount"];

export function parseLessonCSV(text: string): { headers: string[]; rows: Record<string, string>[]; error?: string } {
  const rows = parseCSV(text);
  if (rows.length < 2) return { headers: [], rows: [], error: "CSV needs a header row and at least one data row" };

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeKey);
  const dataRows = rows.slice(1);

  const hasAmount = AMOUNT_COLS.some((c) => headers.includes(c));
  if (!hasAmount) return { headers: rawHeaders, rows: [], error: "CSV must have an 'amount' or 'amount_cents' column" };

  const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
  if (missing.length) return { headers: rawHeaders, rows: [], error: `Missing required columns: ${missing.join(", ")}` };

  const result: Record<string, string>[] = [];
  for (const row of dataRows) {
    const obj: Record<string, string> = {};
    rawHeaders.forEach((h, i) => {
      obj[normalizeKey(h)] = (row[i] ?? "").trim();
    });
    result.push(obj);
  }
  return { headers: rawHeaders, rows: result };
}

// ——— Attendance matrix format (dates × students, Y = attended) ———

export interface MatrixParseResult {
  dates: string[]; // YYYY-MM-DD from CSV
  studentNames: string[]; // column headers
  attendance: { date: string; studentIndex: number }[]; // each Y cell
  error?: string;
  /** Rows skipped because date had no year (e.g. 1/15). Use full dates (1/15/2025) to fix. */
  skippedRowsNoYear?: number;
}

export function parseLessonMatrixCSV(text: string, year: number): MatrixParseResult {
  const rows = parseCSV(text);
  if (rows.length < 2) return { dates: [], studentNames: [], attendance: [], error: "CSV needs a header row and at least one data row" };

  const headerRow = rows[0];
  const studentNames = headerRow.slice(1).map((s) => s.trim()).filter(Boolean);
  if (studentNames.length === 0) return { dates: [], studentNames: [], attendance: [], error: "No student names in header row" };

  const attendance: { date: string; studentIndex: number }[] = [];
  const dateStrToKey: Record<string, string> = {};
  let skippedRowsNoYear = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const dateCell = (row[0] ?? "").trim();
    if (!dateCell) continue;

    const normalized = normalizeDateToYYYYMMDD(dateCell, year);
    if (!normalized) {
      if (/^\d{1,2}[\/-]\d{1,2}$/.test(dateCell.replace(/\s/g, ""))) skippedRowsNoYear++;
      continue;
    }
    dateStrToKey[dateCell] = normalized;

    for (let c = 1; c < row.length && c - 1 < studentNames.length; c++) {
      const cell = (row[c] ?? "").trim().toUpperCase();
      if (cell === "Y" || cell === "YES") {
        attendance.push({ date: normalized, studentIndex: c - 1 });
      }
    }
  }

  const dates = [...new Set(attendance.map((a) => a.date))].sort();
  return { dates, studentNames, attendance, skippedRowsNoYear: skippedRowsNoYear > 0 ? skippedRowsNoYear : undefined };
}

/** Parse month-day-year (M/D/YYYY, M-D-YYYY), year-month-day (YYYY-M-D, YYYY/M/D), or ISO YYYY-MM-DD. Returns YYYY-MM-DD. */
function normalizeDateToYYYYMMDD(val: string, year: number): string | null {
  const s = val.trim().replace(/\s+/g, " ").trim();
  const norm = s.replace(/\s/g, "");

  const slashMatch = norm.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    const month = parseInt(m!, 10);
    const day = parseInt(d!, 10);
    const yr = parseInt(y!, 10) < 100 ? 2000 + parseInt(y!, 10) : parseInt(y!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const slashShort = norm.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashShort) return null;
  const dashMatch = norm.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashMatch) {
    const [, m, d, y] = dashMatch;
    const month = parseInt(m!, 10);
    const day = parseInt(d!, 10);
    const yr = parseInt(y!, 10) < 100 ? 2000 + parseInt(y!, 10) : parseInt(y!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const dashShort = norm.match(/^(\d{1,2})-(\d{1,2})$/);
  if (dashShort) return null;
  const yearFirstSlash = norm.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (yearFirstSlash) {
    const [, yr, m, d] = yearFirstSlash;
    const month = parseInt(m!, 10);
    const day = parseInt(d!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const yearFirstDash = norm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yearFirstDash) {
    const [, yr, m, d] = yearFirstDash;
    const month = parseInt(m!, 10);
    const day = parseInt(d!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const isoMatch = norm.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return norm;
  return null;
}

export function rowToLesson(row: Record<string, string>): ImportRow | null {
  const first = (row.first_name ?? "").trim();
  const last = (row.last_name ?? "").trim();
  const dateStr = (row.date ?? "").trim();
  const durStr = (row.duration_minutes ?? "").trim();
  const amountStr = row.amount_cents ?? row.amount ?? "";
  const completedStr = (row.completed ?? "true").trim().toLowerCase();
  const note = (row.note ?? "").trim() || undefined;

  if (!first || !last || !dateStr || !durStr || !amountStr) return null;

  const durationMinutes = parseInt(durStr, 10);
  if (isNaN(durationMinutes) || durationMinutes <= 0) return null;

  let amountCents: number;
  if (row.amount_cents) {
    amountCents = parseInt(row.amount_cents, 10);
  } else {
    const amountDollars = parseFloat(amountStr);
    amountCents = Math.round(amountDollars * 100);
  }
  if (isNaN(amountCents) || amountCents < 0) return null;

  let normalizedDate = dateStr;
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    normalizedDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  } else {
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!isoMatch) return null;
  }

  const completed = completedStr === "true" || completedStr === "1" || completedStr === "yes" || completedStr === "";

  return {
    first_name: first,
    last_name: last,
    date: normalizedDate,
    duration_minutes: durationMinutes,
    amount_cents: amountCents,
    completed,
    note,
  };
}

// ——— Student CSV import ———

export interface StudentImportRow {
  first_name: string;
  last_name: string;
  duration_minutes: number;
  rate_cents: number;
  day_of_week: number;
  time_of_day: string;
  location?: string;
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function parseStudentCSV(text: string): { headers: string[]; rows: Record<string, string>[]; error?: string } {
  const rows = parseCSV(text);
  if (rows.length < 2) return { headers: [], rows: [], error: "CSV needs a header row and at least one data row" };

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeKey);
  const dataRows = rows.slice(1);

  const hasFirstLast = headers.includes("first_name") && headers.includes("last_name");
  const hasName = headers.includes("name");
  if (!hasFirstLast && !hasName) return { headers: rawHeaders, rows: [], error: "CSV must have first_name + last_name columns (or name)" };

  const hasRate = ["rate", "rate_cents"].some((c) => headers.includes(c));
  if (!hasRate) return { headers: rawHeaders, rows: [], error: "CSV must have a 'rate' column" };

  const result: Record<string, string>[] = [];
  for (const row of dataRows) {
    const obj: Record<string, string> = {};
    rawHeaders.forEach((h, i) => {
      obj[normalizeKey(h)] = (row[i] ?? "").trim();
    });
    result.push(obj);
  }
  return { headers: rawHeaders, rows: result };
}

function parseDayOfWeek(val: string): number {
  const s = val.trim().toLowerCase();
  const dayIdx = DAY_NAMES.indexOf(s);
  if (dayIdx >= 0) return dayIdx;
  const num = parseInt(s, 10);
  if (!isNaN(num) && num >= 0 && num <= 6) return num;
  const short = DAY_NAMES.findIndex((d) => d.startsWith(s) || s.startsWith(d.slice(0, 3)));
  return short >= 0 ? short : 1;
}

function parseDuration(val: string): number {
  const s = val.trim().toLowerCase();
  const hourMatch = s.match(/^(\d+(?:\.\d+)?)\s*h(?:our|r)?s?$/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
  const minMatch = s.match(/^(\d+)\s*m(?:in|inute)?s?$/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const num = parseInt(s, 10);
  if (!isNaN(num) && num > 0) return num <= 12 ? num * 60 : num; // assume hours if small
  return 60;
}

export function rowToStudent(row: Record<string, string>): StudentImportRow | null {
  const result = rowToStudentWithError(row);
  return result.ok ? result.data : null;
}

/** Like rowToStudent but returns a specific error string when the row is invalid (for import UI). */
export function rowToStudentWithError(row: Record<string, string>): { ok: true; data: StudentImportRow } | { ok: false; error: string } {
  let first: string;
  let last: string;
  if (row.name) {
    const parts = (row.name ?? "").trim().split(/\s+/);
    first = parts[0] ?? "";
    last = parts.slice(1).join(" ").trim() || first;
  } else {
    first = (row.first_name ?? "").trim();
    last = (row.last_name ?? "").trim() || first;
  }
  const durStr = (row.duration ?? row.duration_minutes ?? "60").trim();
  const rateStr = (row.rate_cents ?? row.rate ?? "").replace(/[$,]/g, "").trim();
  const dayStr = (row.day_of_week ?? "1").trim();
  const timeStr = (row.time_of_day ?? "").trim();
  const location = (row.location ?? "").trim() || undefined;

  if (!first && !last) return { ok: false, error: "Missing first name and last name (or name)" };
  if (!first) return { ok: false, error: "Missing first name" };
  if (!rateStr) return { ok: false, error: "Missing or invalid rate (e.g. 70 or $70.00)" };

  const durationMinutes = parseDuration(durStr);
  if (durationMinutes <= 0 || durationMinutes > 240) return { ok: false, error: "Duration must be 1–240 minutes or e.g. \"1 hour\", \"45 min\"" };

  let rateCents: number;
  if (row.rate_cents) {
    const cleaned = (row.rate_cents ?? "").replace(/[$,]/g, "");
    rateCents = cleaned.includes(".") ? Math.round(parseFloat(cleaned) * 100) : parseInt(cleaned, 10);
  } else {
    const num = parseFloat(rateStr);
    rateCents = Math.round(num * 100);
  }
  if (isNaN(rateCents) || rateCents < 0) return { ok: false, error: "Rate must be a number (e.g. 70 or $70.00)" };

  if (timeStr && timeStr !== "—" && !/am|pm/i.test(timeStr)) return { ok: false, error: "time_of_day must include AM or PM (e.g. 4:30 PM)" };

  const dayOfWeek = parseDayOfWeek(dayStr);
  const timeOfDay = timeStr || "—";

  return {
    ok: true,
    data: {
      first_name: first,
      last_name: last,
      duration_minutes: durationMinutes,
      rate_cents: rateCents,
      day_of_week: dayOfWeek,
      time_of_day: timeOfDay,
      location,
    },
  };
}
