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

/** Template for Import lessons (attendance matrix): date column + student name columns, Y = attended */
export function getMatrixTemplateCsv(): string {
  return [
    "date,Student One,Student Two,Student Three",
    "1/15/2024,Y,,",
    "1/16/2024,,Y,",
    "1/17/2024,Y,,Y",
  ].join("\n");
}

/** Template for Import lessons (row format): one row per lesson */
export function getLessonsRowTemplateCsv(): string {
  return [
    "first_name,last_name,date,duration_minutes,amount,completed,note",
    "Jane,Doe,2024-01-15,60,70,true,",
    "John,Smith,2024-01-16,45,60,true,",
  ].join("\n");
}
