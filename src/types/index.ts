export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  durationMinutes: number;
  rateCents: number;
  dayOfWeek: number;
  timeOfDay: string;
  location?: string;
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
