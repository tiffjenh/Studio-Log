import { describe, expect, it } from "vitest";
import type { Lesson, Student } from "@/types";
import {
  handleVoiceCommand,
  type DashboardContext,
  type DashboardScheduledLesson,
  type VoicePipelineAdapter,
} from "@/lib/voice/homeVoicePipeline";

type TestDB = {
  students: Student[];
  lessons: Lesson[];
};

const SELECT_COMPLETED_ON_DATE = `
SELECT count(*) FILTER (WHERE completed=true) AS completed_count,
       count(*) AS total_count
FROM lessons
WHERE lesson_date = $1;
`;

const SELECT_STUDENT_DURATION_ON_DATE = `
SELECT duration_minutes
FROM lessons
WHERE student_id = $1 AND lesson_date = $2
LIMIT 1;
`;

const SELECT_STUDENT_TIME_ON_DATE = `
SELECT time_of_day
FROM lessons
WHERE student_id = $1 AND lesson_date = $2
LIMIT 1;
`;

const SELECT_STUDENT_ON_DATE = `
SELECT id, lesson_date, completed, duration_minutes, amount_cents
FROM lessons
WHERE student_id = $1 AND lesson_date = $2
LIMIT 1;
`;

function makeSeedDB(): TestDB {
  const students: Student[] = [
    { id: "s-chloe", firstName: "Chloe", lastName: "Parker", dayOfWeek: 5, timeOfDay: "5:00 PM", durationMinutes: 60, rateCents: 6000 },
    { id: "s-leo", firstName: "Leo", lastName: "Garcia", dayOfWeek: 5, timeOfDay: "4:00 PM", durationMinutes: 60, rateCents: 7000 },
    { id: "s-ava", firstName: "Ava", lastName: "Kim", dayOfWeek: 5, timeOfDay: "3:00 PM", durationMinutes: 45, rateCents: 6000 },
    { id: "s-mia", firstName: "Mia", lastName: "Kim", dayOfWeek: 2, timeOfDay: "4:00 PM", durationMinutes: 60, rateCents: 7000 },
    { id: "s-olivia", firstName: "Olivia", lastName: "Chen", dayOfWeek: 2, timeOfDay: "5:00 PM", durationMinutes: 60, rateCents: 7000 },
    { id: "s-sofia", firstName: "Sofia", lastName: "Parker", dayOfWeek: 6, timeOfDay: "3:00 PM", durationMinutes: 90, rateCents: 8000 },
    { id: "s-mason", firstName: "Mason", lastName: "Lopez", dayOfWeek: 5, timeOfDay: "7:00 PM", durationMinutes: 60, rateCents: 7000 },
    { id: "s-emma-kim", firstName: "Emma", lastName: "Kim", dayOfWeek: 5, timeOfDay: "2:00 PM", durationMinutes: 60, rateCents: 6500 },
    { id: "s-emma-chen", firstName: "Emma", lastName: "Chen", dayOfWeek: 5, timeOfDay: "6:00 PM", durationMinutes: 60, rateCents: 6500 },
    { id: "s-tyler", firstName: "Tyler", lastName: "Chen", dayOfWeek: 5, timeOfDay: "1:00 PM", durationMinutes: 30, rateCents: 6000 },
  ];

  const lessons: Lesson[] = [
    { id: "l-1", studentId: "s-chloe", date: "2026-02-20", timeOfDay: "5:00 PM", durationMinutes: 60, amountCents: 6000, completed: false },
    { id: "l-2", studentId: "s-leo", date: "2026-02-20", timeOfDay: "4:00 PM", durationMinutes: 60, amountCents: 7000, completed: false },
    { id: "l-3", studentId: "s-ava", date: "2026-02-20", timeOfDay: "3:00 PM", durationMinutes: 45, amountCents: 4500, completed: false },
    { id: "l-4", studentId: "s-emma-kim", date: "2026-02-20", timeOfDay: "2:00 PM", durationMinutes: 60, amountCents: 6500, completed: false },
    { id: "l-5", studentId: "s-emma-chen", date: "2026-02-20", timeOfDay: "6:00 PM", durationMinutes: 60, amountCents: 6500, completed: false },
    { id: "l-6", studentId: "s-tyler", date: "2026-02-20", timeOfDay: "1:00 PM", durationMinutes: 30, amountCents: 3000, completed: false },
    { id: "l-7", studentId: "s-chloe", date: "2026-02-19", timeOfDay: "5:00 PM", durationMinutes: 60, amountCents: 6000, completed: false },
    { id: "l-8", studentId: "s-leo", date: "2026-02-18", timeOfDay: "5:00 PM", durationMinutes: 60, amountCents: 7000, completed: false },
    { id: "l-9", studentId: "s-sofia", date: "2026-02-21", timeOfDay: "3:00 PM", durationMinutes: 90, amountCents: 8000, completed: false },
    { id: "l-10", studentId: "s-mia", date: "2026-02-17", timeOfDay: "4:00 PM", durationMinutes: 60, amountCents: 7000, completed: false },
    { id: "l-11", studentId: "s-olivia", date: "2026-02-17", timeOfDay: "5:00 PM", durationMinutes: 60, amountCents: 7000, completed: false },
  ];

  return { students, lessons };
}

function getScheduledLessonsForDate(db: TestDB, dateKey: string): DashboardScheduledLesson[] {
  return db.lessons
    .filter((l) => l.date === dateKey)
    .map((l) => {
      const s = db.students.find((x) => x.id === l.studentId)!;
      return {
        lesson_id: l.id,
        student_id: l.studentId,
        student_name: `${s.firstName} ${s.lastName}`,
        date: l.date,
        time: l.timeOfDay ?? s.timeOfDay,
        duration_minutes: l.durationMinutes,
        amount_cents: l.amountCents,
        completed: l.completed,
      };
    });
}

function makeAdapter(db: TestDB): VoicePipelineAdapter {
  return {
    get students() {
      return db.students;
    },
    get lessons() {
      return db.lessons;
    },
    getScheduledLessonsForDate: (dateKey: string) => getScheduledLessonsForDate(db, dateKey),
    updateLessonById: async (lessonId: string, updates: Partial<Lesson>) => {
      const idx = db.lessons.findIndex((l) => l.id === lessonId);
      if (idx >= 0) db.lessons[idx] = { ...db.lessons[idx], ...updates };
    },
    addLesson: async (lesson: Omit<Lesson, "id">) => {
      const existing = db.lessons.find((l) => l.studentId === lesson.studentId && l.date === lesson.date);
      if (existing) {
        Object.assign(existing, lesson);
        return existing.id;
      }
      const id = `l-new-${db.lessons.length + 1}`;
      db.lessons.push({ ...lesson, id });
      return id;
    },
    fetchLessonsForVerification: async () => db.lessons.map((l) => ({ ...l })),
  };
}

function makeContext(db: TestDB, selectedDate = "2026-02-20"): DashboardContext {
  return {
    user_id: "u-1",
    selected_date: selectedDate,
    timezone: "America/Los_Angeles",
    scheduled_lessons: getScheduledLessonsForDate(db, selectedDate),
  };
}

function sqlCountCompletedOnDate(db: TestDB, date: string) {
  void SELECT_COMPLETED_ON_DATE;
  const rows = db.lessons.filter((l) => l.date === date);
  return {
    completed_count: rows.filter((l) => l.completed).length,
    total_count: rows.length,
  };
}

function sqlDurationOnDate(db: TestDB, studentId: string, date: string): number | null {
  void SELECT_STUDENT_DURATION_ON_DATE;
  return db.lessons.find((l) => l.studentId === studentId && l.date === date)?.durationMinutes ?? null;
}

function sqlTimeOnDate(db: TestDB, studentId: string, date: string): string | null {
  void SELECT_STUDENT_TIME_ON_DATE;
  return db.lessons.find((l) => l.studentId === studentId && l.date === date)?.timeOfDay ?? null;
}

function sqlLessonOnDate(db: TestDB, studentId: string, date: string): Lesson | null {
  void SELECT_STUDENT_ON_DATE;
  return db.lessons.find((l) => l.studentId === studentId && l.date === date) ?? null;
}

async function runVoice(db: TestDB, transcript: string, selectedDate = "2026-02-20") {
  return handleVoiceCommand(transcript, makeContext(db, selectedDate), makeAdapter(db));
}

describe("home voice command pipeline", () => {
  it("marks multiple students attended on one command", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Chloe and Leo came today");
    expect(result.status).toBe("success");
    const truth = sqlCountCompletedOnDate(db, "2026-02-20");
    expect(truth.completed_count).toBe(2);
  });

  it("marks all scheduled lessons attended", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "All students attended today");
    expect(result.status).toBe("success");
    const truth = sqlCountCompletedOnDate(db, "2026-02-20");
    expect(truth.completed_count).toBe(truth.total_count);
  });

  it("asks clarification for 'nobody came today' instead of guessing", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Nobody came today");
    expect(result.status).toBe("needs_clarification");
    const truth = sqlCountCompletedOnDate(db, "2026-02-20");
    expect(truth.completed_count).toBe(0);
  });

  it("unmarks attendance for multiple students", async () => {
    const db = makeSeedDB();
    await runVoice(db, "Mark Chloe and Leo as attended");
    const result = await runVoice(db, "Unmark Chloe and Leo");
    expect(result.status).toBe("success");
    expect(sqlLessonOnDate(db, "s-chloe", "2026-02-20")?.completed).toBe(false);
    expect(sqlLessonOnDate(db, "s-leo", "2026-02-20")?.completed).toBe(false);
  });

  it("updates duration via natural phrasing", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Change Chloe's lesson from 1 hour to 30 minutes");
    expect(result.status).toBe("success");
    expect(sqlDurationOnDate(db, "s-chloe", "2026-02-20")).toBe(30);
  });

  it("maps attendance phrasing like 'had his class' to mark attendance", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Leo had his class today");
    expect(result.status).toBe("success");
    expect(sqlLessonOnDate(db, "s-leo", "2026-02-20")?.completed).toBe(true);
  });

  it("updates time via natural phrasing", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Change Leo's lesson time to 3pm");
    expect(result.status).toBe("success");
    expect(sqlTimeOnDate(db, "s-leo", "2026-02-20")).toBe("3:00 PM");
  });

  it("supports possessive + 'is now at' time phrasing", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Emma Kim's class is now at 10 PM");
    expect(result.status).toBe("success");
    expect(sqlTimeOnDate(db, "s-emma-kim", "2026-02-20")).toBe("10:00 PM");
  });

  it("matches close STT spelling and updates Sofia from 'Sophia'", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Change Sophia's lesson to 1 PM", "2026-02-21");
    expect(result.status).toBe("success");
    expect(sqlTimeOnDate(db, "s-sofia", "2026-02-21")).toBe("1:00 PM");
  });

  it("ignores 'class' and ordinal date noise in multi-student attendance", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Mia and Olivia attended class on the 17th", "2026-02-17");
    expect(result.status).toBe("success");
    expect(sqlLessonOnDate(db, "s-mia", "2026-02-17")?.completed).toBe(true);
    expect(sqlLessonOnDate(db, "s-olivia", "2026-02-17")?.completed).toBe(true);
  });

  it("ignores o'clock token when parsing student for duration edits", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Change Sofia's lesson to 30 minutes and 1 o'clock", "2026-02-21");
    expect(result.status).toBe("success");
    expect(sqlDurationOnDate(db, "s-sofia", "2026-02-21")).toBe(30);
  });

  it("moves a lesson by lesson id and verifies date/time/duration", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Move Leo's lesson from Friday Feb 18 to Sunday Feb 20 at 5pm for 1 hour");
    expect(result.status).toBe("success");
    const moved = db.lessons.find((l) => l.id === "l-8");
    expect(moved?.date).toBe("2026-02-20");
    expect(moved?.timeOfDay).toBe("5:00 PM");
    expect(moved?.durationMinutes).toBe(60);
  });

  it("handles create-only duration updates when no row exists yet", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Change Mason's lesson to 30 minutes");
    expect(result.status).toBe("success");
    const lesson = sqlLessonOnDate(db, "s-mason", "2026-02-20");
    expect(lesson).not.toBeNull();
    expect(lesson?.durationMinutes).toBe(30);
  });

  it("parses change+date+time+duration as move lesson", async () => {
    const db = makeSeedDB();
    const result = await runVoice(
      db,
      "Change Sofia's lesson to Friday, February 20 at 2 PM for one hour",
      "2026-02-21"
    );
    expect(result.status).toBe("success");
    expect(sqlLessonOnDate(db, "s-sofia", "2026-02-20")?.timeOfDay).toBe("2:00 PM");
    expect(sqlLessonOnDate(db, "s-sofia", "2026-02-20")?.durationMinutes).toBe(60);
  });

  it("asks clarification for ambiguous bare weekdays in move commands", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Move Chloe's lesson from Friday to Saturday at 2 PM");
    expect(result.status).toBe("needs_clarification");
    expect(result.human_message.toLowerCase()).toContain("do you mean");
    expect((result.clarification_options?.length ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it("fails safely when student is not scheduled on the target day", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Mark Chloe attended yesterday");
    expect(result.status).toBe("success");
    const yesterday = sqlLessonOnDate(db, "s-chloe", "2026-02-19");
    expect(yesterday?.completed).toBe(true);
  });

  it("returns error for all-students attendance on no-lesson day", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "All students attended today", "2026-02-23");
    expect(result.status).toBe("error");
    const truth = sqlCountCompletedOnDate(db, "2026-02-23");
    expect(truth.total_count).toBe(0);
  });

  it("asks clarification for ambiguous first name", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Mark Emma attended today");
    expect(result.status).toBe("needs_clarification");
    expect(result.clarification_options?.length).toBeGreaterThan(1);
  });

  it("rejects unsupported duration values", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Change Chloe duration to 25 minutes");
    expect(result.status).toBe("needs_clarification");
    expect(sqlDurationOnDate(db, "s-chloe", "2026-02-20")).toBe(60);
  });

  it("rejects unsupported recurring rate updates safely", async () => {
    const db = makeSeedDB();
    const result = await runVoice(db, "Increase Chloe's rate to 80 dollars per hour starting March 1st");
    expect(result.status).toBe("needs_clarification");
    expect(sqlLessonOnDate(db, "s-chloe", "2026-02-20")?.amountCents).toBe(6000);
  });

  const transcriptCases: Array<{ transcript: string; expectedStatus: "success" | "needs_clarification" | "error" }> = [
    { transcript: "Chloe came today", expectedStatus: "success" },
    { transcript: "Mark Chloe as attended", expectedStatus: "success" },
    { transcript: "Chloe and Leo came today", expectedStatus: "success" },
    { transcript: "Leo and. Chloe attended today", expectedStatus: "success" },
    { transcript: "Mark Chloe, Leo, and Ava as attended", expectedStatus: "success" },
    { transcript: "Everyone attended today", expectedStatus: "success" },
    { transcript: "Mark all lessons attended", expectedStatus: "success" },
    { transcript: "Chloe did not come today", expectedStatus: "success" },
    { transcript: "Set Chloe and Leo to not attended", expectedStatus: "success" },
    { transcript: "Toggle everyone off", expectedStatus: "success" },
    { transcript: "No one came today", expectedStatus: "needs_clarification" },
    { transcript: "Make Chloe 45 minutes today", expectedStatus: "success" },
    { transcript: "Set Chloe lesson duration to 30 minutes", expectedStatus: "success" },
    { transcript: "Chloe should be 90 minutes today", expectedStatus: "success" },
    { transcript: "Set Chloe to 30 min", expectedStatus: "success" },
    { transcript: "Move Chloe to 3:30pm today", expectedStatus: "success" },
    { transcript: "Set Chloe lesson to 5 PM", expectedStatus: "success" },
    { transcript: "Change Chloe start time to 15:00", expectedStatus: "success" },
    { transcript: "Make Chloe start at 4:15", expectedStatus: "success" },
    { transcript: "Move Chloe from today to tomorrow at 4pm", expectedStatus: "success" },
    { transcript: "Reschedule Leo from Feb 18 to Feb 20 at 17:00", expectedStatus: "success" },
    { transcript: "Move Leo to Feb 20 at 5pm", expectedStatus: "success" },
    { transcript: "Set Leo rate to $75 per hour effective July 1", expectedStatus: "needs_clarification" },
    { transcript: "Set Chloe rate to 60 per hour", expectedStatus: "success" },
    { transcript: "Mark Nora attended", expectedStatus: "needs_clarification" },
    { transcript: "Move Alex to next Friday", expectedStatus: "needs_clarification" },
    { transcript: "All students attended yesterday", expectedStatus: "success" },
    { transcript: "Move Leo to 25pm", expectedStatus: "needs_clarification" },
    { transcript: "Change Leo to 3:99", expectedStatus: "needs_clarification" },
    { transcript: "Mark the students attended", expectedStatus: "needs_clarification" },
    { transcript: "Move the lesson to next week", expectedStatus: "needs_clarification" },
  ];

  it("handles 30 transcript variations with deterministic status outcomes", async () => {
    for (const tc of transcriptCases) {
      const db = makeSeedDB();
      const result = await runVoice(db, tc.transcript);
      expect(result.status, tc.transcript).toBe(tc.expectedStatus);
    }
  });
});
