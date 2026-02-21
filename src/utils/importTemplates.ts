/**
 * CSV template content and download helper for Import students and Import lessons.
 */

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Template for Import students: first_name, last_name, rate, duration_minutes, day_of_week, time_of_day */
export function getStudentTemplateCsv(): string {
  return [
    "first_name,last_name,rate,duration_minutes,day_of_week,time_of_day",
    "Jane,Doe,70,60,Monday,4:30 PM",
    "John,Smith,60,45,Tuesday,3:00 PM",
  ].join("\n");
}

/** Escape a CSV cell (quote and double internal quotes if needed). */
function escapeCsvCell(val: string): string {
  if (!/[\n\r,"]/.test(val)) return val;
  return `"${val.replace(/"/g, '""')}"`;
}

/** Template for Import lessons (attendance matrix): date column + student name columns, Y = attended */
export function getMatrixTemplateCsv(): string {
  return [
    "date,Student One,Student Two,Student Three",
    "1/15/2024,Y,,",
    "1/16/2024,,Y,",
    "1/17/2024,Y,,Y",
  ].join("\n");
}

/**
 * Build CSV in the exact same format as the Import lessons (attendance matrix) template.
 * Header: date, then one column per student (firstName + " " + lastName, same order as students).
 * Rows: one per unique lesson date (M/D/YYYY), Y in student column if they have a completed lesson that date.
 * Use for "Download student lessons" so the file can be re-imported via Settings → Import Data.
 */
export function getStudentLessonsMatrixCsv(
  students: { id: string; firstName: string; lastName: string }[],
  lessons: { studentId: string; date: string; completed: boolean }[]
): string {
  const completedLessons = lessons.filter((l) => l.completed);
  const dateToStudentIds = new Map<string, Set<string>>();
  for (const l of completedLessons) {
    let set = dateToStudentIds.get(l.date);
    if (!set) {
      set = new Set();
      dateToStudentIds.set(l.date, set);
    }
    set.add(l.studentId);
  }
  const sortedDates = [...dateToStudentIds.keys()].sort();
  const headerCells = ["date", ...students.map((s) => `${s.firstName} ${s.lastName}`.trim() || " ")];
  const headerRow = headerCells.map(escapeCsvCell).join(",");
  const rows: string[] = [headerRow];
  if (sortedDates.length === 0) {
    const placeholderDate = "1/1/2024";
    rows.push([placeholderDate, ...students.map(() => "")].map(escapeCsvCell).join(","));
  }
  for (const dateKey of sortedDates) {
    const [y, m, d] = dateKey.split("-");
    const dateDisplay = `${parseInt(m!, 10)}/${parseInt(d!, 10)}/${y}`;
    const studentIds = dateToStudentIds.get(dateKey)!;
    const cells = [dateDisplay];
    for (const s of students) {
      cells.push(studentIds.has(s.id) ? "Y" : "");
    }
    rows.push(cells.map(escapeCsvCell).join(","));
  }
  return rows.join("\n");
}

/** Filename for student-lessons matrix export: wweekly_student_lessons_matrix_YYYY-MM-DD.csv */
export function getStudentLessonsMatrixFilename(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `wweekly_student_lessons_matrix_${y}-${m}-${d}.csv`;
}

/** Template for Import lessons (row format): one row per lesson */
export function getLessonsRowTemplateCsv(): string {
  return [
    "first_name,last_name,date,duration_minutes,amount,completed,note",
    "Jane,Doe,2024-01-15,60,70,true,",
    "John,Smith,2024-01-16,45,60,true,",
  ].join("\n");
}
