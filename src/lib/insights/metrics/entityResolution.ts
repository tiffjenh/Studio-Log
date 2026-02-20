/**
 * Resolve student name(s) from query to student_id(s). Case-insensitive;
 * supports "Leo Chen", "Leo" (if unique), and "Tyler and Emily" -> multiple ids.
 * Never silently drop names; if 2 names found, return both.
 */

import type { Student } from "@/types";

function fullName(s: Student): string {
  return `${s.firstName} ${s.lastName}`.trim();
}

function matchesName(s: Student, q: string): boolean {
  const full = fullName(s).toLowerCase();
  const first = s.firstName?.toLowerCase() ?? "";
  const last = s.lastName?.toLowerCase() ?? "";
  const qq = q.toLowerCase().trim();
  if (full === qq) return true;
  if (first === qq || last === qq) return true;
  if (full.includes(qq) || qq.includes(full)) return true;
  return false;
}

/**
 * Split "Tyler and Emily" or "Tyler, Emily" into ["Tyler", "Emily"].
 */
function splitNames(phrase: string): string[] {
  const and = phrase.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  if (and.length > 1) return and;
  const comma = phrase.split(",").map((s) => s.trim()).filter(Boolean);
  if (comma.length > 1) return comma;
  return [phrase.trim()].filter(Boolean);
}

/**
 * Resolve one name to a single student_id or null. Prefer exact full name match.
 */
export function resolveStudentName(students: Student[], rawName: string): string | null {
  if (!rawName?.trim()) return null;
  const q = rawName.trim();
  const matches = students.filter((s) => matchesName(s, q));
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) {
    const exact = matches.find((s) => fullName(s).toLowerCase() === q.toLowerCase());
    if (exact) return exact.id;
    return null; // ambiguous
  }
  return null;
}

/**
 * Resolve "Tyler and Emily" or a single name to one or more student_ids.
 * Returns [] if any name is ambiguous or not found.
 */
export function resolveStudentNames(students: Student[], rawPhrase: string): string[] {
  if (!rawPhrase?.trim()) return [];
  const names = splitNames(rawPhrase);
  const ids: string[] = [];
  for (const name of names) {
    const id = resolveStudentName(students, name);
    if (id == null) return []; // fail fast on ambiguous/missing
    ids.push(id);
  }
  return ids;
}
