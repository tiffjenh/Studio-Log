import { useCallback, useEffect, useRef, useState } from "react";
import type { AppData, Lesson, Student, User } from "@/types";
import { hasSupabase } from "@/lib/supabase";
import {
  loadFromSupabase,
  signOutSupabase,
  addStudentSupabase,
  insertStudentsBulkSupabase,
  fetchStudents,
  updateStudentSupabase,
  deleteStudentSupabase,
  deleteAllStudentsSupabase,
  addLessonSupabase,
  bulkInsertLessonsSupabase,
  updateLessonSupabase,
  deleteLessonSupabase,
  deleteOtherLessonsForStudentOnDates,
  deleteOtherLessonsForStudentOnOldDateSafe,
  debugFetchLessonsForStudentOnDates,
  deleteAllLessonsSupabase,
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

/** One lesson per (studentId, date). If duplicates exist, keep the one with completed: true so earnings and toggles stay correct. */
function dedupeLessonsByStudentDate(lessons: Lesson[]): Lesson[] {
  const byKey = new Map<string, Lesson>();
  for (const l of lessons) {
    const key = `${l.studentId}|${l.date}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, l);
    } else if (l.completed && !existing.completed) {
      byKey.set(key, l);
    }
  }
  return [...byKey.values()];
}

/** Guardrail: one lesson per id. Use when building lesson lists to avoid duplicates. */
function dedupeLessonsById(lessons: Lesson[]): Lesson[] {
  const byId = new Map<string, Lesson>();
  for (const l of lessons) {
    if (!byId.has(l.id)) byId.set(l.id, l);
  }
  return [...byId.values()];
}

/** Skip reload for this long after a bulk student import so we don't overwrite with a stale fetch. */
const SKIP_RELOAD_AFTER_BULK_IMPORT_MS = 30_000;

export function useStore() {
  const [data, setData] = useState<AppData>(defaultData);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importableLocalData, setImportableLocalData] = useState<{ students: Student[]; lessons: Lesson[] } | null>(null);
  const lastBulkImportAtRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    if (hasSupabase()) {
      if (lastBulkImportAtRef.current != null && Date.now() - lastBulkImportAtRef.current < SKIP_RELOAD_AFTER_BULK_IMPORT_MS) {
        setLoaded(true);
        return;
      }
      try {
        const raw = await loadFromSupabase();
        const appData = raw
          ? { ...raw, lessons: dedupeLessonsById(dedupeLessonsByStudentDate(raw.lessons)) }
          : null;
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
        const lessons = dedupeLessonsByStudentDate(cleaned.lessons);
        const final = lessons.length !== cleaned.lessons.length ? { ...cleaned, lessons } : cleaned;
        setData(final);
        if (cleaned !== parsed || lessons.length !== cleaned.lessons.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(final));
        }
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
          avatarIcon: student.avatarIcon,
        });
        setData((prev) => ({ ...prev, students: [...prev.students, created] }));
        return;
      }
      persist({ ...data, students: [...data.students, student] });
    },
    [data, persist]
  );

  const addStudentsBulk = useCallback(
    async (
      students: Omit<Student, "id">[],
      onProgress?: (inserted: number, total: number) => void
    ): Promise<{ created: Student[]; addedCount: number; chunkErrors: string[] }> => {
      if (students.length === 0) return { created: [], addedCount: 0, chunkErrors: [] };
      if (hasSupabase() && data.user) {
        const prevStudents = data.students;
        const { inserted, errors: chunkErrors } = await insertStudentsBulkSupabase(
          data.user.id,
          students,
          onProgress
        );
        setData((prev) => ({ ...prev, students: [...prev.students, ...inserted] }));
        lastBulkImportAtRef.current = Date.now();
        const fetched = await fetchStudents(data.user.id);
        if (fetched.length >= prevStudents.length + inserted.length) {
          setData((prev) => ({ ...prev, students: fetched }));
        }
        return { created: inserted, addedCount: inserted.length, chunkErrors };
      }
      const withIds = students.map((s, i) => ({ ...s, id: `s_${Date.now()}_${i}` }));
      persist({ ...data, students: [...data.students, ...withIds] });
      return { created: withIds, addedCount: withIds.length, chunkErrors: [] };
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
        const existingIdRef = { current: "" };
        const pendingId = `pending_${lesson.studentId}_${lesson.date}`;
        setData((prev) => {
          const ex = prev.lessons.find((l) => l.studentId === lesson.studentId && l.date === lesson.date);
          if (ex) {
            existingIdRef.current = ex.id;
            return prev;
          }
          existingIdRef.current = "";
          return { ...prev, lessons: [...prev.lessons, { ...lesson, id: pendingId }] };
        });
        if (existingIdRef.current) {
          updateLesson(existingIdRef.current, lesson);
          return existingIdRef.current;
        }
        try {
          const created = await addLessonSupabase(data.user.id, lesson);
          const syncAfterMerge = { current: null as { completed: boolean; amountCents: number; durationMinutes: number } | null };
          setData((prev) => {
            const pending = prev.lessons.find((l) => l.id === pendingId);
            const merged = pending
              ? { ...created, completed: pending.completed, amountCents: pending.amountCents, durationMinutes: pending.durationMinutes }
              : created;
            if (pending && (pending.completed !== created.completed || pending.amountCents !== created.amountCents)) {
              syncAfterMerge.current = { completed: merged.completed, amountCents: merged.amountCents, durationMinutes: merged.durationMinutes };
            }
            return {
              ...prev,
              lessons: prev.lessons.map((l) => (l.id === pendingId ? merged : l)),
            };
          });
          if (syncAfterMerge.current) {
            try {
              await updateLessonSupabase(data.user.id, created.id, syncAfterMerge.current);
            } catch {
              /* ignore */
            }
          }
          return created.id;
        } catch (e) {
          console.error(e);
          setData((prev) => ({ ...prev, lessons: prev.lessons.filter((l) => l.id !== pendingId) }));
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
      const newDate = updates.date;
      const current = data.lessons.find((l) => l.id === id);
      const isDateMove = current && newDate != null && /^\d{4}-\d{2}-\d{2}$/.test(String(newDate)) && current.date !== newDate;
      const oldDate = isDateMove ? current.date : null;
      const duplicatesOnNewDate =
        isDateMove ? data.lessons.filter((l) => l.id !== id && l.studentId === current.studentId && l.date === newDate) : [];
      const duplicatesOnOldDate =
        isDateMove && oldDate
          ? data.lessons.filter((l) => l.id !== id && l.studentId === current.studentId && l.date === oldDate)
          : [];
      const allToRemove = [...duplicatesOnNewDate, ...duplicatesOnOldDate];
      const removeIds = new Set(allToRemove.map((l) => l.id));

      if (hasSupabase() && data.user) {
        // TEMP DEBUG: lessonId being saved; DB call is update only (no insert/upsert)
        console.log("[RESCHEDULE DEBUG] updateLesson Supabase path", {
          lessonId: id,
          oldDate: oldDate ?? null,
          newDate: newDate ?? null,
          isDateMove,
          dbCall: "update",
          method: isDateMove && oldDate ? "deleteOtherLessonsForStudentOnDates + updateLessonSupabase (update only)" : "updateLessonSupabase only",
        });
        if (isDateMove && oldDate) {
          await deleteOtherLessonsForStudentOnDates(
            data.user.id,
            current.studentId,
            oldDate,
            newDate as string,
            id,
          );
        } else {
          for (const dup of allToRemove) {
            await deleteLessonSupabase(data.user.id, dup.id);
          }
        }
        // Edit lesson: update this lesson only by id. Remove any other lesson for this student on old/new date so no duplicate remains.
        await updateLessonSupabase(data.user.id, id, updates);
        const cur = current!;
        const updatedLesson: Lesson = {
          ...cur,
          ...updates,
          id: cur.id,
          studentId: cur.studentId,
          date: (updates.date ?? cur.date) as string,
          durationMinutes: (updates.durationMinutes ?? cur.durationMinutes) as number,
          amountCents: (updates.amountCents ?? cur.amountCents) as number,
          completed: updates.completed ?? cur.completed,
        };
        setData((prev) => {
          const nextLessons = prev.lessons
            .filter((l) => !removeIds.has(l.id))
            .map((l) => (l.id === id ? updatedLesson : l));
          return { ...prev, lessons: dedupeLessonsById(nextLessons) };
        });
        if (isDateMove && oldDate) {
          // Safe cleanup: remove any other scheduled lesson for this student on the OLD date (duplicate/orphan).
          try {
            await deleteOtherLessonsForStudentOnOldDateSafe(data.user.id, cur.studentId, oldDate, id);
          } catch (e) {
            console.warn("[Reschedule] Safe cleanup on old date failed:", e);
          }
          await load();
          // TEMP DEBUG: after save, query DB for this student on old/new date. If 2 rows → DB bug (delete didn't work). If 1 → DB OK.
          const rows = await debugFetchLessonsForStudentOnDates(data.user.id, cur.studentId, oldDate, newDate as string);
          console.log("[RESCHEDULE DEBUG] After save: lessons in DB for this student on old/new date", {
            count: rows.length,
            rows: rows.map((r) => ({ id: r.id, student_id: r.student_id, lesson_date: r.lesson_date, created_at: r.created_at })),
            rootCause: rows.length > 1 ? "DB: delete did not remove the other row" : "DB has 1 row (OK)",
          });
          if (rows.length > 1) {
            console.log("[RESCHEDULE DEBUG] Two rows — both IDs and created_at:", rows.map((r) => ({ id: r.id, created_at: r.created_at })));
          }
          // Fix: if DB still has 2 rows, delete the other(s) by id so only our lesson remains
          if (rows.length > 1) {
            for (const r of rows) {
              if (r.id !== id) {
                await deleteLessonSupabase(data.user.id, r.id);
                console.log("[RESCHEDULE DEBUG] Fallback: deleted duplicate row", r.id);
              }
            }
            await load();
          }
        }
        return;
      }
      const nextLessons = data.lessons
        .filter((l) => !removeIds.has(l.id))
        .map((l) => (l.id === id ? { ...l, ...updates } : l));
      const deduped = dedupeLessonsById(nextLessons);
      setData((prev) => ({ ...prev, lessons: deduped }));
      persist({ ...data, lessons: deduped });
    },
    [data, persist, load]
  );

  /** Add many lessons in one go (bulk insert when Supabase). Used by matrix import so 2025/2026 don't fail partway. */
  const addLessonsBulk = useCallback(
    async (lessons: Omit<Lesson, "id">[]): Promise<Lesson[]> => {
      if (lessons.length === 0) return [];
      if (hasSupabase() && data.user) {
        const created = await bulkInsertLessonsSupabase(data.user.id, lessons);
        setData((prev) => ({ ...prev, lessons: [...prev.lessons, ...created] }));
        return created;
      }
      const withIds = lessons.map((l, i) => ({ ...l, id: `l_${Date.now()}_${i}` }));
      persist({ ...data, lessons: [...data.lessons, ...withIds] });
      return withIds;
    },
    [data, persist]
  );

  const deleteLesson = useCallback(
    async (lessonId: string): Promise<void> => {
      if (hasSupabase() && data.user) {
        await deleteLessonSupabase(data.user.id, lessonId);
        setData((prev) => ({ ...prev, lessons: prev.lessons.filter((l) => l.id !== lessonId) }));
        await load();
        return;
      }
      const next = data.lessons.filter((l) => l.id !== lessonId);
      setData((prev) => ({ ...prev, lessons: next }));
      persist({ ...data, lessons: next });
    },
    [data, persist, load]
  );

  const clearAllLessons = useCallback(
    async (): Promise<void> => {
      if (hasSupabase() && data.user) {
        await deleteAllLessonsSupabase(data.user.id);
        setData((prev) => ({ ...prev, lessons: [] }));
        return;
      }
      persist({ ...data, lessons: [] });
    },
    [data, persist]
  );

  const clearAllStudents = useCallback(
    async (): Promise<void> => {
      if (hasSupabase() && data.user) {
        await deleteAllLessonsSupabase(data.user.id);
        await deleteAllStudentsSupabase(data.user.id);
        setData((prev) => ({ ...prev, students: [], lessons: [] }));
        return;
      }
      persist({ ...data, students: [], lessons: [] });
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
    addStudentsBulk,
    updateStudent,
    deleteStudent,
    addLesson,
    addLessonsBulk,
    updateLesson,
    deleteLesson,
    clearAllLessons,
    clearAllStudents,
    updateUserProfile,
    reload: load,
  };
}
