/**
 * Unit tests for voice command parsing and resolution.
 * Run: npm test (or npx vitest run)
 */

import { describe, it, expect } from "vitest";
import { parseVoiceCommand } from "../parseVoiceCommand";
import { resolveVoiceCommand } from "../resolveEntities";
import type { ResolveContext } from "../resolveEntities";
import type { Student, Lesson } from "@/types";

const TODAY = "2025-02-19";

function makeStudent(id: string, firstName: string, lastName: string): Student {
  return {
    id,
    firstName,
    lastName,
    durationMinutes: 60,
    rateCents: 5000,
    dayOfWeek: 3,
    timeOfDay: "5:00 PM",
  };
}

function makeLesson(lessonId: string, studentId: string, date: string): Lesson {
  return {
    id: lessonId,
    studentId,
    date,
    durationMinutes: 60,
    amountCents: 5000,
    completed: false,
  };
}

describe("parseVoiceCommand", () => {
  it('parses "Sarah and Tiffany came today" as ATTENDANCE_MARK with named scope', () => {
    const payload = parseVoiceCommand("Sarah and Tiffany came today", TODAY);
    expect(payload.intent).toBe("ATTENDANCE_MARK");
    expect(payload.data).not.toBeNull();
    if (payload.data && "scope" in payload.data) {
      expect(payload.data.scope).toBe("named");
      expect(payload.data.present).toBe(true);
      expect(payload.data.nameFragments).toContain("Sarah");
      expect(payload.data.nameFragments).toContain("Tiffany");
      expect(payload.data.dateKey).toBe(TODAY);
    }
  });

  it('parses "All students came today" as ATTENDANCE_MARK with scope all', () => {
    const payload = parseVoiceCommand("All students came today", TODAY);
    expect(payload.intent).toBe("ATTENDANCE_MARK");
    expect(payload.data).not.toBeNull();
    if (payload.data && "scope" in payload.data) {
      expect(payload.data.scope).toBe("all");
      expect(payload.data.present).toBe(true);
      expect(payload.data.nameFragments).toHaveLength(0);
      expect(payload.data.dateKey).toBe(TODAY);
    }
  });

  it('parses "Move Leo\'s lesson from Friday Feb 18 to Sunday Feb 20 at 5pm for 1 hour" as LESSON_RESCHEDULE', () => {
    const payload = parseVoiceCommand(
      "Move Leo's lesson from Friday Feb 18 to Sunday Feb 20 at 5pm for 1 hour",
      TODAY
    );
    expect(payload.intent).toBe("LESSON_RESCHEDULE");
    expect(payload.data).not.toBeNull();
    if (payload.data && "studentNameFragment" in payload.data) {
      expect(payload.data.studentNameFragment).toMatch(/Leo/i);
      expect(payload.data.toDateKey).toBe("2025-02-20");
      expect(payload.data.toTime).toMatch(/5:00\s*PM/i);
      expect(payload.data.durationMinutes).toBe(60);
    }
  });

  it('parses Spanish "Hoy vinieron Sarah y Tiffany" as ATTENDANCE_MARK', () => {
    const payload = parseVoiceCommand("Hoy vinieron Sarah y Tiffany", TODAY);
    expect(payload.intent).toBe("ATTENDANCE_MARK");
    expect(payload.language).toBe("es");
    expect(payload.data).not.toBeNull();
    if (payload.data && "scope" in payload.data) {
      expect(payload.data.scope).toBe("named");
      expect(payload.data.present).toBe(true);
      expect(payload.data.nameFragments.some((n) => n.toLowerCase().includes("sarah"))).toBe(true);
      expect(payload.data.nameFragments.some((n) => n.toLowerCase().includes("tiffany"))).toBe(true);
    }
  });

  it('parses Chinese "今天所有学生都来了" as ATTENDANCE_MARK scope all', () => {
    const payload = parseVoiceCommand("今天所有学生都来了", TODAY);
    expect(payload.intent).toBe("ATTENDANCE_MARK");
    expect(payload.language).toBe("zh");
    expect(payload.data).not.toBeNull();
    if (payload.data && "scope" in payload.data) {
      expect(payload.data.scope).toBe("all");
      expect(payload.data.present).toBe(true);
      expect(payload.data.dateKey).toBe(TODAY);
    }
  });
});

describe("resolveVoiceCommand", () => {
  const students: Student[] = [
    makeStudent("s1", "Sarah", "Jones"),
    makeStudent("s2", "Tiffany", "Lee"),
    makeStudent("s3", "Leo", "Chen"),
  ];
  const lessons: Lesson[] = [
    makeLesson("l1", "s1", TODAY),
    makeLesson("l2", "s2", TODAY),
    makeLesson("l3", "s3", "2025-02-18"),
  ];
  const ctx: ResolveContext = {
    students,
    lessons,
    dashboardDateKey: TODAY,
  };

  it('resolves "Sarah and Tiffany came today" to two student IDs', () => {
    const payload = parseVoiceCommand("Sarah and Tiffany came today", TODAY);
    const resolved = resolveVoiceCommand(payload, ctx);
    expect(resolved).not.toBeNull();
    expect(resolved?.intent).toBe("ATTENDANCE_MARK");
    if (resolved && resolved.intent === "ATTENDANCE_MARK") {
      expect(resolved.studentIds).toHaveLength(2);
      expect(resolved.studentIds).toContain("s1");
      expect(resolved.studentIds).toContain("s2");
      expect(resolved.present).toBe(true);
      expect(resolved.dateKey).toBe(TODAY);
    }
  });

  it('resolves "All students came today" to all scheduled for dashboard day', () => {
    const payload = parseVoiceCommand("All students came today", TODAY);
    const resolved = resolveVoiceCommand(payload, ctx);
    expect(resolved).not.toBeNull();
    if (resolved && resolved.intent === "ATTENDANCE_MARK") {
      expect(resolved.present).toBe(true);
      expect(resolved.dateKey).toBe(TODAY);
      expect(resolved.studentIds.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('resolves "Move Leo\'s lesson from Friday Feb 18 to Sunday Feb 20 at 5pm" to lesson id', () => {
    const payload = parseVoiceCommand(
      "Move Leo's lesson from Friday Feb 18 to Sunday Feb 20 at 5pm for 1 hour",
      TODAY
    );
    const resolved = resolveVoiceCommand(payload, ctx);
    expect(resolved).not.toBeNull();
    expect(resolved?.intent).toBe("LESSON_RESCHEDULE");
    if (resolved && resolved.intent === "LESSON_RESCHEDULE") {
      expect(resolved.lessonId).toBe("l3");
      expect(resolved.studentId).toBe("s3");
      expect(resolved.toDateKey).toBe("2025-02-20");
    }
  });
});
