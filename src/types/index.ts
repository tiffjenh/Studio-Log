export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  durationMinutes: number;
  rateCents: number;
  dayOfWeek: number;
  timeOfDay: string;
  location?: string;
  /** From this date (YYYY-MM-DD), use scheduleChange* fields instead of dayOfWeek/timeOfDay/duration/rate. */
  scheduleChangeFromDate?: string;
  scheduleChangeDayOfWeek?: number;
  scheduleChangeTimeOfDay?: string;
  scheduleChangeDurationMinutes?: number;
  scheduleChangeRateCents?: number;
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
