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
    avatarIcon: (r.avatar_icon as string) || undefined,
    additionalSchedules: r.additional_schedules ? (typeof r.additional_schedules === "string" ? JSON.parse(r.additional_schedules as string) : r.additional_schedules as Student["additionalSchedules"]) : undefined,
    scheduleChangeAdditionalSchedules: r.schedule_change_additional_schedules ? (typeof r.schedule_change_additional_schedules === "string" ? JSON.parse(r.schedule_change_additional_schedules as string) : r.schedule_change_additional_schedules as Student["scheduleChangeAdditionalSchedules"]) : undefined,
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

/** Resend signup confirmation email. Use when user gets "Email not confirmed" on login. */
export async function resendConfirmationSupabase(email: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
  if (error) return { error: error.message };
  return {};
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

/**
 * Send a magic-link to the user's CURRENT (old) email to verify ownership
 * before changing to a new email.  The new email is stored in localStorage
 * so the callback handler can pick it up.
 */
export async function initiateEmailChange(
  currentEmail: string,
  newEmail: string,
  redirectUrl: string,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase not configured" };

  // Store the intended new email for the callback handler
  localStorage.setItem("pendingEmailChange", newEmail.trim());

  const { error } = await supabase.auth.signInWithOtp({
    email: currentEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectUrl,
    },
  });
  if (error) {
    localStorage.removeItem("pendingEmailChange");
    return { error: error.message };
  }
  return {};
}

/**
 * Call the admin API endpoint to apply the email change after the user
 * verified ownership by clicking the magic link sent to their old email.
 */
export async function applyEmailChange(newEmail: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase not configured" };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "No active session" };

  try {
    const resp = await fetch("/api/change-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ newEmail }),
    });
    const json = await resp.json();
    if (!resp.ok) return { error: json.error || "Failed to change email" };
    return {};
  } catch {
    return { error: "Network error — please try again" };
  }
}

export async function addStudentSupabase(uid: string, student: Omit<Student, "id">): Promise<Student> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expired. Please log out and log in again.");
  // Build insert row with only required columns + optional columns that have values.
  // This avoids 400 errors when optional columns haven't been added to the DB yet.
  const row: Record<string, unknown> = {
    user_id: uid,
    first_name: student.firstName,
    last_name: student.lastName,
    duration_minutes: student.durationMinutes,
    rate_cents: student.rateCents,
    day_of_week: student.dayOfWeek,
    time_of_day: student.timeOfDay,
  };
  if (student.location != null) row.location = student.location;
  if (student.scheduleChangeFromDate != null) row.schedule_change_from_date = student.scheduleChangeFromDate;
  if (student.scheduleChangeDayOfWeek != null) row.schedule_change_day_of_week = student.scheduleChangeDayOfWeek;
  if (student.scheduleChangeTimeOfDay != null) row.schedule_change_time_of_day = student.scheduleChangeTimeOfDay;
  if (student.scheduleChangeDurationMinutes != null) row.schedule_change_duration_minutes = student.scheduleChangeDurationMinutes;
  if (student.scheduleChangeRateCents != null) row.schedule_change_rate_cents = student.scheduleChangeRateCents;
  if (student.terminatedFromDate != null) row.terminated_from_date = student.terminatedFromDate;
  if (student.avatarIcon != null) row.avatar_icon = student.avatarIcon;
  if (student.additionalSchedules?.length) row.additional_schedules = JSON.stringify(student.additionalSchedules);
  if (student.scheduleChangeAdditionalSchedules?.length) row.schedule_change_additional_schedules = JSON.stringify(student.scheduleChangeAdditionalSchedules);

  const { data, error } = await supabase
    .from("students")
    .insert(row)
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
  if (updates.additionalSchedules !== undefined) row.additional_schedules = updates.additionalSchedules?.length ? JSON.stringify(updates.additionalSchedules) : null;
  if (updates.scheduleChangeAdditionalSchedules !== undefined) row.schedule_change_additional_schedules = updates.scheduleChangeAdditionalSchedules?.length ? JSON.stringify(updates.scheduleChangeAdditionalSchedules) : null;
  if (updates.avatarIcon !== undefined) row.avatar_icon = updates.avatarIcon || null;
  if (Object.keys(row).length) await supabase.from("students").update(row).eq("id", id).eq("user_id", uid);
}

export async function deleteStudentSupabase(uid: string, id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("students").delete().eq("id", id).eq("user_id", uid);
  if (error) throw error;
}

const BULK_INSERT_CHUNK = 200;

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

/** Insert many lessons in chunks. Returns all created lessons. Use for matrix import so 2025/2026 don't fail partway. */
export async function bulkInsertLessonsSupabase(uid: string, lessons: Omit<Lesson, "id">[]): Promise<Lesson[]> {
  if (!supabase) throw new Error("Supabase not configured");
  const rows = lessons.map((l) => ({
    user_id: uid,
    student_id: l.studentId,
    date: l.date,
    duration_minutes: l.durationMinutes,
    amount_cents: l.amountCents,
    completed: l.completed ?? true,
    note: l.note ?? null,
  }));
  const out: Lesson[] = [];
  for (let i = 0; i < rows.length; i += BULK_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + BULK_INSERT_CHUNK);
    const { data, error } = await supabase.from("lessons").insert(chunk).select();
    if (error) throw error;
    const list = (data ?? []) as Record<string, unknown>[];
    for (const r of list) out.push(rowToLesson(r));
  }
  return out;
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

export async function deleteAllLessonsSupabase(uid: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("lessons").delete().eq("user_id", uid);
  if (error) throw error;
}
