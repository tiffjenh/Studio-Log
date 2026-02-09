import { useCallback, useEffect, useState } from "react";
import type { AppData, Lesson, Student, User } from "@/types";
import { hasSupabase } from "@/lib/supabase";
import {
  loadFromSupabase,
  signOutSupabase,
  addStudentSupabase,
  updateStudentSupabase,
  deleteStudentSupabase,
  addLessonSupabase,
  updateLessonSupabase,
  updateProfileSupabase,
} from "@/store/supabaseSync";

const STORAGE_KEY = "studio_log_data";
const SEED_STUDENT_IDS = ["s1", "s2", "s3", "s4"];
const defaultData: AppData = { user: null, students: [], lessons: [] };
const initialData: AppData = { user: null, students: [], lessons: [] };

function stripSeedData(parsed: AppData): AppData {
  const students = parsed.students.filter((s) => !SEED_STUDENT_IDS.includes(s.id));
  const lessons = parsed.lessons.filter((l) => !SEED_STUDENT_IDS.includes(l.studentId));
  if (students.length !== parsed.students.length || lessons.length !== parsed.lessons.length) {
    return { ...parsed, students, lessons };
  }
  return parsed;
}

export function useStore() {
  const [data, setData] = useState<AppData>(defaultData);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importableLocalData, setImportableLocalData] = useState<{ students: Student[]; lessons: Lesson[] } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    if (hasSupabase()) {
      try {
        const appData = await loadFromSupabase();
        setData(appData ?? initialData);
        const d = appData ?? initialData;
        if (d.user && d.students.length === 0 && d.lessons.length === 0) {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
              const parsed = stripSeedData(JSON.parse(raw) as AppData);
              if (parsed.students.length > 0 || parsed.lessons.length > 0) {
                setImportableLocalData({ students: parsed.students, lessons: parsed.lessons });
              }
            }
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Failed to load data";
        setLoadError(msg);
        setData(initialData);
      }
      setLoaded(true);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppData;
        const cleaned = stripSeedData(parsed);
        setData(cleaned);
        if (cleaned !== parsed) localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      } else {
        setData(initialData);
      }
    } catch {
      setData(initialData);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback((next: AppData) => {
    setData(next);
    if (!hasSupabase()) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
    }
  }, []);

  const setUser = useCallback(
    (user: User | null) => {
      if (hasSupabase()) {
        if (!user) {
          signOutSupabase();
          setData(initialData);
          return;
        }
        setData((prev) => ({ ...prev, user, students: [], lessons: [] }));
        (async () => {
          const full = await loadFromSupabase();
          if (full?.user) {
            setData(full);
            if (full.students.length === 0 && full.lessons.length === 0) {
              try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                  const parsed = stripSeedData(JSON.parse(raw) as AppData);
                  if (parsed.students.length > 0 || parsed.lessons.length > 0) {
                    setImportableLocalData({ students: parsed.students, lessons: parsed.lessons });
                  }
                }
              } catch {
                /* ignore */
              }
            }
          }
        })();
        return;
      }
      persist({ ...data, user });
    },
    [data, persist]
  );

  const addStudent = useCallback(
    async (student: Student): Promise<void> => {
      if (hasSupabase() && data.user) {
        const created = await addStudentSupabase(data.user.id, {
          firstName: student.firstName,
          lastName: student.lastName,
          durationMinutes: student.durationMinutes,
          rateCents: student.rateCents,
          dayOfWeek: student.dayOfWeek,
          timeOfDay: student.timeOfDay,
          location: student.location,
        });
        setData((prev) => ({ ...prev, students: [...prev.students, created] }));
        return;
      }
      persist({ ...data, students: [...data.students, student] });
    },
    [data, persist]
  );

  const updateStudent = useCallback(
    async (id: string, updates: Partial<Student>) => {
      if (hasSupabase() && data.user) {
        await updateStudentSupabase(data.user.id, id, updates);
        setData((prev) => ({
          ...prev,
          students: prev.students.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        }));
        return;
      }
      persist({
        ...data,
        students: data.students.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      });
    },
    [data, persist]
  );

  const deleteStudent = useCallback(
    async (id: string) => {
      if (hasSupabase() && data.user) {
        await deleteStudentSupabase(data.user.id, id);
        setData((prev) => ({
          ...prev,
          students: prev.students.filter((s) => s.id !== id),
          lessons: prev.lessons.filter((l) => l.studentId !== id),
        }));
        return;
      }
      persist({
        ...data,
        students: data.students.filter((s) => s.id !== id),
        lessons: data.lessons.filter((l) => l.studentId !== id),
      });
    },
    [data, persist]
  );

  const addLesson = useCallback(
    async (lesson: Omit<Lesson, "id">) => {
      if (hasSupabase() && data.user) {
        try {
          const created = await addLessonSupabase(data.user.id, lesson);
          setData((prev) => ({ ...prev, lessons: [...prev.lessons, created] }));
          return created.id;
        } catch (e) {
          console.error(e);
          return "";
        }
      }
      const id = `l_${Date.now()}`;
      persist({ ...data, lessons: [...data.lessons, { ...lesson, id }] });
      return id;
    },
    [data, persist]
  );

  const updateLesson = useCallback(
    async (id: string, updates: Partial<Lesson>) => {
      if (hasSupabase() && data.user) {
        try {
          await updateLessonSupabase(data.user.id, id, updates);
          setData((prev) => ({
            ...prev,
            lessons: prev.lessons.map((l) => (l.id === id ? { ...l, ...updates } : l)),
          }));
        } catch (e) {
          console.error(e);
        }
        return;
      }
      persist({
        ...data,
        lessons: data.lessons.map((l) => (l.id === id ? { ...l, ...updates } : l)),
      });
    },
    [data, persist]
  );

  const importLocalData = useCallback(async (): Promise<void> => {
    const toImport = importableLocalData;
    if (!toImport || !hasSupabase() || !data.user) return;
    const idMap = new Map<string, string>();
    const newStudents: Student[] = [];
    for (const s of toImport.students) {
      const created = await addStudentSupabase(data.user.id, {
        firstName: s.firstName,
        lastName: s.lastName,
        durationMinutes: s.durationMinutes,
        rateCents: s.rateCents,
        dayOfWeek: s.dayOfWeek,
        timeOfDay: s.timeOfDay,
        location: s.location,
      });
      idMap.set(s.id, created.id);
      newStudents.push(created);
    }
    const newLessons: Lesson[] = [];
    for (const l of toImport.lessons) {
      const newStudentId = idMap.get(l.studentId);
      if (!newStudentId) continue;
      const created = await addLessonSupabase(data.user.id, {
        studentId: newStudentId,
        date: l.date,
        durationMinutes: l.durationMinutes,
        amountCents: l.amountCents,
        completed: l.completed,
        note: l.note,
      });
      newLessons.push(created);
    }
    setData((prev) => ({
      ...prev,
      students: [...prev.students, ...newStudents],
      lessons: [...prev.lessons, ...newLessons],
    }));
    setImportableLocalData(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [importableLocalData, data.user]);

  const clearImportableData = useCallback(() => {
    setImportableLocalData(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const updateUserProfile = useCallback(
    async (updates: { name?: string; phone?: string }) => {
      if (hasSupabase() && data.user) {
        try {
          await updateProfileSupabase(data.user.id, updates);
          setData((prev) => (prev.user ? { ...prev, user: { ...prev.user, ...updates } } : prev));
        } catch (e) {
          console.error(e);
        }
        return;
      }
      if (data.user) persist({ ...data, user: { ...data.user, ...updates } });
    },
    [data, persist]
  );

  return {
    data,
    loaded,
    loadError,
    importableLocalData,
    importLocalData,
    clearImportableData,
    setUser,
    addStudent,
    updateStudent,
    deleteStudent,
    addLesson,
    updateLesson,
    updateUserProfile,
    reload: load,
  };
}
