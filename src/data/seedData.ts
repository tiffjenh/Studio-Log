import type { Lesson, Student } from "@/types";

/** 10 demo students. Created in order; lesson generator uses same index for studentId. */
export const SEED_STUDENTS: Omit<Student, "id">[] = [
  { firstName: "Emma", lastName: "Chen", durationMinutes: 30, rateCents: 4500, dayOfWeek: 1, timeOfDay: "4:00 PM" },
  { firstName: "Liam", lastName: "Martinez", durationMinutes: 45, rateCents: 6000, dayOfWeek: 2, timeOfDay: "5:30 PM" },
  { firstName: "Olivia", lastName: "Kim", durationMinutes: 60, rateCents: 7500, dayOfWeek: 3, timeOfDay: "3:00 PM" },
  { firstName: "Noah", lastName: "Johnson", durationMinutes: 30, rateCents: 4000, dayOfWeek: 4, timeOfDay: "4:30 PM" },
  { firstName: "Ava", lastName: "Garcia", durationMinutes: 45, rateCents: 5500, dayOfWeek: 5, timeOfDay: "5:00 PM" },
  { firstName: "Ethan", lastName: "Williams", durationMinutes: 60, rateCents: 7000, dayOfWeek: 0, timeOfDay: "10:00 AM" },
  { firstName: "Sophia", lastName: "Brown", durationMinutes: 30, rateCents: 5000, dayOfWeek: 1, timeOfDay: "3:30 PM" },
  { firstName: "Mason", lastName: "Davis", durationMinutes: 45, rateCents: 6500, dayOfWeek: 2, timeOfDay: "6:00 PM" },
  { firstName: "Isabella", lastName: "Rodriguez", durationMinutes: 60, rateCents: 8000, dayOfWeek: 3, timeOfDay: "4:00 PM" },
  { firstName: "James", lastName: "Wilson", durationMinutes: 45, rateCents: 6000, dayOfWeek: 4, timeOfDay: "5:30 PM" },
];

/** One lesson per student per quarter (4 per year) for 2024, 2025, 2026. studentIds must match SEED_STUDENTS order. */
export function getSeedLessons(studentIds: string[]): Omit<Lesson, "id">[] {
  const lessons: Omit<Lesson, "id">[] = [];
  const monthsPerYear = [1, 4, 7, 10]; // Jan, Apr, Jul, Oct
  const years = [2024, 2025, 2026];

  for (let sIdx = 0; sIdx < studentIds.length; sIdx++) {
    const studentId = studentIds[sIdx]!;
    const student = SEED_STUDENTS[sIdx];
    if (!student) continue;
    const { durationMinutes, rateCents } = student;

    for (const year of years) {
      for (const month of monthsPerYear) {
        const day = 10 + (sIdx % 5); // 10–14 so valid for all months
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const completed = year < 2026 || (year === 2026 && month <= 2);
        lessons.push({
          studentId,
          date,
          durationMinutes,
          amountCents: rateCents,
          completed,
        });
      }
    }
  }

  return lessons;
}
