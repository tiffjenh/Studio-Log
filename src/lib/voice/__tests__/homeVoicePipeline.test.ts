import { describe, expect, it } from "vitest";
import type { Lesson, Student } from "@/types";
import {
  handleVoiceCommand,
  resumePendingVoiceCommand,
  type DashboardContext,
  type VoicePipelineAdapter,
} from "@/lib/voice/homeVoicePipeline";

function makeStudent(id: string, firstName: string, lastName: string): Student {
  return {
    id,
    firstName,
    lastName,
    durationMinutes: 60,
    rateCents: 6000,
    dayOfWeek: 2,
    timeOfDay: "4:00 PM",
  };
}

function makeLesson(id: string, studentId: string, date: string, timeOfDay = "4:00 PM"): Lesson {
  return {
    id,
    studentId,
    date,
    timeOfDay,
    durationMinutes: 60,
    amountCents: 6000,
    completed: false,
  };
}

function buildAdapter(students: Student[], startingLessons: Lesson[]): VoicePipelineAdapter & { lessonsRef: Lesson[] } {
  const lessonsRef = [...startingLessons];
  return {
    students,
    lessons: lessonsRef,
    lessonsRef,
    getScheduledLessonsForDate: (dateKey: string) =>
      students.map((student) => {
        const lesson = lessonsRef.find((l) => l.studentId === student.id && l.date === dateKey);
        return {
          lesson_id: lesson?.id ?? null,
          student_id: student.id,
          student_name: `${student.firstName} ${student.lastName}`,
          date: dateKey,
          time: lesson?.timeOfDay ?? student.timeOfDay,
          duration_minutes: lesson?.durationMinutes ?? student.durationMinutes,
          amount_cents: lesson?.amountCents ?? student.rateCents,
          completed: lesson?.completed ?? false,
        };
      }),
    updateLessonById: async (lessonId: string, updates: Partial<Lesson>) => {
      const idx = lessonsRef.findIndex((l) => l.id === lessonId);
      if (idx >= 0) lessonsRef[idx] = { ...lessonsRef[idx], ...updates };
    },
    addLesson: async (lesson: Omit<Lesson, "id">) => {
      const newId = `new-${lessonsRef.length + 1}`;
      lessonsRef.push({ ...lesson, id: newId });
      return newId;
    },
    fetchLessonsForVerification: async () => lessonsRef,
  };
}

describe("homeVoicePipeline disambiguation resume", () => {
  it("resumes a pending time update after selecting the right student", async () => {
    const students = [
      makeStudent("s-leo-garcia", "Leo", "Garcia"),
      makeStudent("s-leo-chen", "Leo", "Chen"),
    ];
    const lessons = [
      makeLesson("l-garcia", "s-leo-garcia", "2026-02-17", "3:00 PM"),
      makeLesson("l-chen", "s-leo-chen", "2026-02-17", "5:00 PM"),
    ];
    const adapter = buildAdapter(students, lessons);
    const context: DashboardContext = {
      user_id: "u1",
      selected_date: "2026-02-17",
      timezone: "America/Los_Angeles",
      scheduled_lessons: adapter.getScheduledLessonsForDate("2026-02-17"),
    };

    const first = await handleVoiceCommand("Leo's class now at 6 PM", context, adapter);
    expect(first.status).toBe("needs_clarification");
    expect(first.pending_command).toBeTruthy();
    expect(first.clarification_options).toContain("Leo Garcia");
    expect(first.clarification_options).toContain("Leo Chen");

    const resumed = await resumePendingVoiceCommand(
      first.pending_command!,
      { studentId: "s-leo-garcia" },
      adapter
    );
    expect(resumed.status).toBe("success");
    const updated = adapter.lessonsRef.find((l) => l.id === "l-garcia");
    const untouched = adapter.lessonsRef.find((l) => l.id === "l-chen");
    expect(updated?.timeOfDay).toBe("6:00 PM");
    expect(untouched?.timeOfDay).toBe("5:00 PM");
  });

  it("resumes a pending move command after selecting the correct student", async () => {
    const students = [
      makeStudent("s-leo-garcia", "Leo", "Garcia"),
      makeStudent("s-leo-chen", "Leo", "Chen"),
    ];
    const lessons = [
      makeLesson("l-garcia", "s-leo-garcia", "2026-02-17", "3:00 PM"),
      makeLesson("l-chen", "s-leo-chen", "2026-02-17", "5:00 PM"),
    ];
    const adapter = buildAdapter(students, lessons);
    const context: DashboardContext = {
      user_id: "u1",
      selected_date: "2026-02-17",
      timezone: "America/Los_Angeles",
      scheduled_lessons: adapter.getScheduledLessonsForDate("2026-02-17"),
    };

    const first = await handleVoiceCommand("Move Leo's lesson to tomorrow", context, adapter);
    expect(first.status).toBe("needs_clarification");
    expect(first.pending_command).toBeTruthy();

    const resumed = await resumePendingVoiceCommand(
      first.pending_command!,
      { studentId: "s-leo-chen" },
      adapter
    );
    expect(resumed.status).toBe("success");
    const moved = adapter.lessonsRef.find((l) => l.id === "l-chen");
    const unchanged = adapter.lessonsRef.find((l) => l.id === "l-garcia");
    expect(moved?.date).toBe("2026-02-18");
    expect(unchanged?.date).toBe("2026-02-17");
  });
});

describe("homeVoicePipeline natural parsing", () => {
  it("supports natural duration phrasing", async () => {
    const students = [makeStudent("s-ava", "Ava", "Kim"), makeStudent("s-emma", "Emma", "Stone")];
    const lessons = [makeLesson("l-ava", "s-ava", "2026-02-17"), makeLesson("l-emma", "s-emma", "2026-02-17")];
    const adapter = buildAdapter(students, lessons);
    const context: DashboardContext = {
      user_id: "u1",
      selected_date: "2026-02-17",
      timezone: "America/Los_Angeles",
      scheduled_lessons: adapter.getScheduledLessonsForDate("2026-02-17"),
    };

    const one = await handleVoiceCommand("Change Ava's lesson to an hour and a half", context, adapter);
    expect(one.status).toBe("success");
    expect(adapter.lessonsRef.find((l) => l.id === "l-ava")?.durationMinutes).toBe(90);

    const two = await handleVoiceCommand("Change Emma's lesson to two hours", context, adapter);
    expect(two.status).toBe("success");
    expect(adapter.lessonsRef.find((l) => l.id === "l-emma")?.durationMinutes).toBe(120);
  });

  it("maps class amount updates to set_amount and asks when ambiguous", async () => {
    const students = [makeStudent("s-leo", "Leo", "Chen")];
    const lessons = [makeLesson("l-leo", "s-leo", "2026-02-17")];
    const adapter = buildAdapter(students, lessons);
    const context: DashboardContext = {
      user_id: "u1",
      selected_date: "2026-02-17",
      timezone: "America/Los_Angeles",
      scheduled_lessons: adapter.getScheduledLessonsForDate("2026-02-17"),
    };

    const amount = await handleVoiceCommand("Leo Chen's class is now $100", context, adapter);
    expect(amount.status, amount.human_message).toBe("success");
    expect(adapter.lessonsRef.find((l) => l.id === "l-leo")?.amountCents).toBe(10000);

    const ambiguous = await handleVoiceCommand("Leo Chen is now $100", context, adapter);
    expect(ambiguous.status).toBe("needs_clarification");
    expect(ambiguous.clarification_options).toContain("Set lesson amount");
    expect(ambiguous.clarification_options).toContain("Set hourly rate");
  });
});
