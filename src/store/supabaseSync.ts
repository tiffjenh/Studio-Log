import { supabase, hasSupabase } from "@/lib/supabase";
import type { AppData, Lesson, Student, User } from "@/types";

function rowToStudent(r: Record<string, unknown>): Student {
  return {
    id: r.id as string,
    firstName: r.first_name as string,
    lastName: r.last_name as string,
    durationMinutes: r.duration_minutes as number,
    rateCents: r.rate_cents as number,
    dayOfWeek: r.day_of_week as number,
    timeOfDay: (r.time_of_day as string) || "",
    location: (r.location as string) || undefined,
    scheduleChangeFromDate: (r.schedule_change_from_date as string) || undefined,
    scheduleChangeDayOfWeek: r.schedule_change_day_of_week != null ? (r.schedule_change_day_of_week as number) : undefined,
    scheduleChangeTimeOfDay: (r.schedule_change_time_of_day as string) || undefined,
    scheduleChangeDurationMinutes: r.schedule_change_duration_minutes != null ? (r.schedule_change_duration_minutes as number) : undefined,
    scheduleChangeRateCents: r.schedule_change_rate_cents != null ? (r.schedule_change_rate_cents as number) : undefined,
    terminatedFromDate: (r.terminated_from_date as string) || undefined,
  };
}

function rowToLesson(r: Record<string, unknown>): Lesson {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    date: r.date as string,
    durationMinutes: r.duration_minutes as number,
    amountCents: r.amount_cents as number,
    completed: (r.completed as boolean) ?? false,
    note: (r.note as string) || undefined,
  };
}

export async function fetchUser(uid: string): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("profiles").select("id, name, phone").eq("id", uid).single();
  if (error) {
    console.error("[Studio Log] Failed to fetch profile:", error.message, error);
  }
  if (!data) return null;
  const { data: authUser } = await supabase.auth.getUser();
  const email = authUser?.user?.email ?? "";
  return { id: data.id, email, name: (data.name as string) || "", phone: (data.phone as string) || undefined };
}

export async function fetchStudents(uid: string): Promise<Student[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("students").select("*").eq("user_id", uid).order("created_at", { ascending: true });
  if (error) {
    console.error("[Studio Log] Failed to fetch students:", error.message, error);
    throw error;
  }
  return (data || []).map((r) => rowToStudent(r as Record<string, unknown>));
}

export async function fetchLessons(uid: string): Promise<Lesson[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("lessons").select("*").eq("user_id", uid);
  if (error) {
    console.error("[Studio Log] Failed to fetch lessons:", error.message, error);
    throw error;
  }
  return (data || []).map((r) => rowToLesson(r as Record<string, unknown>));
}

export async function signUpSupabase(
  email: string,
  password: string,
  name: string,
  phone?: string
): Promise<{ user: User } | { error: string }> {
  if (!supabase) return { error: "Supabase not configured" };
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, phone: phone || null } },
  });
  if (authError) return { error: authError.message };
  const user = authData?.user;
  if (!user) return { error: "Sign up failed" };
  const profile = await fetchUser(user.id);
  return { user: profile || { id: user.id, email: user.email || "", name, phone } };
}

export async function signInSupabase(email: string, password: string): Promise<{ user: User } | { error: string }> {
  if (!supabase) return { error: "Supabase not configured" };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  const user = data?.user;
  if (!user) return { error: "Login failed" };
  const profile = await fetchUser(user.id);
  return { user: profile || { id: user.id, email: user.email || "", name: "", phone: undefined } };
}

export async function signOutSupabase(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

export async function updatePasswordSupabase(newPassword: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return {};
}

export async function loadFromSupabase(): Promise<AppData | null> {
  if (!hasSupabase() || !supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, students: [], lessons: [] };
  const [profile, students, lessons] = await Promise.all([
    fetchUser(user.id),
    fetchStudents(user.id),
    fetchLessons(user.id),
  ]);
  return { user: profile, students, lessons };
}

export async function updateProfileSupabase(uid: string, updates: { name?: string; phone?: string }): Promise<void> {
  if (!supabase) return;
  await supabase.from("profiles").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", uid);
}

export async function addStudentSupabase(uid: string, student: Omit<Student, "id">): Promise<Student> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expired. Please log out and log in again.");
  const { data, error } = await supabase
    .from("students")
    .insert({
      user_id: uid,
      first_name: student.firstName,
      last_name: student.lastName,
      duration_minutes: student.durationMinutes,
      rate_cents: student.rateCents,
      day_of_week: student.dayOfWeek,
      time_of_day: student.timeOfDay,
      location: student.location ?? null,
      schedule_change_from_date: student.scheduleChangeFromDate ?? null,
      schedule_change_day_of_week: student.scheduleChangeDayOfWeek ?? null,
      schedule_change_time_of_day: student.scheduleChangeTimeOfDay ?? null,
      schedule_change_duration_minutes: student.scheduleChangeDurationMinutes ?? null,
      schedule_change_rate_cents: student.scheduleChangeRateCents ?? null,
      terminated_from_date: student.terminatedFromDate ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToStudent(data as Record<string, unknown>);
}

export async function updateStudentSupabase(uid: string, id: string, updates: Partial<Student>): Promise<void> {
  if (!supabase) return;
  const row: Record<string, unknown> = {};
  if (updates.firstName != null) row.first_name = updates.firstName;
  if (updates.lastName != null) row.last_name = updates.lastName;
  if (updates.durationMinutes != null) row.duration_minutes = updates.durationMinutes;
  if (updates.rateCents != null) row.rate_cents = updates.rateCents;
  if (updates.dayOfWeek != null) row.day_of_week = updates.dayOfWeek;
  if (updates.timeOfDay != null) row.time_of_day = updates.timeOfDay;
  if (updates.location !== undefined) row.location = updates.location ?? null;
  if (updates.scheduleChangeFromDate !== undefined) row.schedule_change_from_date = updates.scheduleChangeFromDate || null;
  if (updates.scheduleChangeDayOfWeek !== undefined) row.schedule_change_day_of_week = updates.scheduleChangeDayOfWeek ?? null;
  if (updates.scheduleChangeTimeOfDay !== undefined) row.schedule_change_time_of_day = updates.scheduleChangeTimeOfDay || null;
  if (updates.scheduleChangeDurationMinutes !== undefined) row.schedule_change_duration_minutes = updates.scheduleChangeDurationMinutes ?? null;
  if (updates.scheduleChangeRateCents !== undefined) row.schedule_change_rate_cents = updates.scheduleChangeRateCents ?? null;
  if (updates.terminatedFromDate !== undefined) row.terminated_from_date = updates.terminatedFromDate || null;
  if (Object.keys(row).length) await supabase.from("students").update(row).eq("id", id).eq("user_id", uid);
}

export async function deleteStudentSupabase(uid: string, id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("students").delete().eq("id", id).eq("user_id", uid);
  if (error) throw error;
}

export async function addLessonSupabase(uid: string, lesson: Omit<Lesson, "id">): Promise<Lesson> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("lessons")
    .insert({
      user_id: uid,
      student_id: lesson.studentId,
      date: lesson.date,
      duration_minutes: lesson.durationMinutes,
      amount_cents: lesson.amountCents,
      completed: lesson.completed,
      note: lesson.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToLesson(data as Record<string, unknown>);
}

export async function updateLessonSupabase(uid: string, id: string, updates: Partial<Lesson>): Promise<void> {
  if (!supabase) return;
  const row: Record<string, unknown> = {};
  if (updates.date != null) row.date = updates.date;
  if (updates.durationMinutes != null) row.duration_minutes = updates.durationMinutes;
  if (updates.amountCents != null) row.amount_cents = updates.amountCents;
  if (updates.completed !== undefined) row.completed = updates.completed;
  if (updates.note !== undefined) row.note = updates.note ?? null;
  if (Object.keys(row).length) await supabase.from("lessons").update(row).eq("id", id).eq("user_id", uid);
}
