/** Per-day schedule entry for students with multiple lesson days per week. */
export interface DaySchedule {
  dayOfWeek: number;
  timeOfDay: string;
  durationMinutes: number;
  rateCents: number;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  /** Primary lesson duration (used for the first / only day). */
  durationMinutes: number;
  /** Primary lesson rate (used for the first / only day). */
  rateCents: number;
  /** Primary day of week (0=Sun … 6=Sat). */
  dayOfWeek: number;
  /** Primary time of day (e.g. "5:00 PM"). */
  timeOfDay: string;
  location?: string;
  /** Additional lesson days beyond the primary. Each entry has its own time, duration, and rate. */
  additionalSchedules?: DaySchedule[];
  /** From this date (YYYY-MM-DD), use scheduleChange* fields instead of dayOfWeek/timeOfDay/duration/rate. */
  scheduleChangeFromDate?: string;
  scheduleChangeDayOfWeek?: number;
  scheduleChangeTimeOfDay?: string;
  scheduleChangeDurationMinutes?: number;
  scheduleChangeRateCents?: number;
  /** Additional schedule-change entries beyond the primary schedule change. */
  scheduleChangeAdditionalSchedules?: DaySchedule[];
  /** Last lesson date (YYYY-MM-DD). After this date the student no longer appears on the calendar/dashboard. */
  terminatedFromDate?: string;
  /** Optional avatar icon: dog | cat | koala. Omit for initials (gradient). */
  avatarIcon?: string;
}

export interface Lesson {
  id: string;
  studentId: string;
  date: string;
  durationMinutes: number;
  amountCents: number;
  completed: boolean;
  note?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
}

export interface AppData {
  user: User | null;
  students: Student[];
  lessons: Lesson[];
}
