-- =============================================================================
-- BOOTSTRAP SCHEMA: Run this in Supabase Dashboard → SQL Editor → New query → Run
-- Use this when you see: "Could not find the table 'public.students' in the schema cache"
-- (If it works in one browser but not another, same fix: run this script and reload schema.)
-- Creates profiles, students, lessons, and student_change_events with all columns.
-- Safe to run multiple times (uses "if not exists" / "add column if not exists").
-- =============================================================================

-- 1) Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text default null,
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- 2) Students (base + all migration columns)
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  duration_minutes int not null,
  rate_cents int not null,
  day_of_week int not null,
  time_of_day text not null default '',
  location text default null,
  created_at timestamptz default now()
);
alter table public.students add column if not exists avatar_icon text default null;
alter table public.students add column if not exists additional_schedules jsonb default null;
alter table public.students add column if not exists schedule_change_from_date text default null;
alter table public.students add column if not exists schedule_change_day_of_week int default null;
alter table public.students add column if not exists schedule_change_time_of_day text default null;
alter table public.students add column if not exists schedule_change_duration_minutes int default null;
alter table public.students add column if not exists schedule_change_rate_cents int default null;
alter table public.students add column if not exists schedule_change_additional_schedules jsonb default null;
alter table public.students add column if not exists terminated_from_date text default null;

alter table public.students enable row level security;
drop policy if exists "Users can CRUD own students" on public.students;
create policy "Users can CRUD own students" on public.students for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Lessons (use lesson_date from the start to avoid reserved word "date")
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_date date not null,
  duration_minutes int not null,
  amount_cents int not null,
  completed boolean not null default false,
  note text default null,
  created_at timestamptz default now()
);
alter table public.lessons add column if not exists time_of_day text default null;

-- If an old project has "date" instead of "lesson_date", rename it
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lessons' and column_name = 'date')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lessons' and column_name = 'lesson_date') then
    alter table public.lessons rename column date to lesson_date;
  end if;
end $$;

alter table public.lessons enable row level security;
drop policy if exists "Users can CRUD own lessons" on public.lessons;
create policy "Users can CRUD own lessons" on public.lessons for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Student change events
create table if not exists public.student_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  event_type text not null,
  effective_from_date date default null,
  old_value jsonb default null,
  new_value jsonb default null,
  created_at timestamptz default now()
);
alter table public.student_change_events enable row level security;
drop policy if exists "Users can CRUD own student_change_events" on public.student_change_events;
create policy "Users can CRUD own student_change_events" on public.student_change_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists student_change_events_student_created
  on public.student_change_events (student_id, created_at desc);

-- 5) New user trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.raw_user_meta_data->>'phone')
  on conflict (id) do update set
    name = coalesce(excluded.name, profiles.name),
    phone = coalesce(excluded.phone, profiles.phone),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 6) RPCs for lessons (drop first so return type can change if needed)
drop function if exists public.update_lesson_date(uuid, date);
drop function if exists public.move_lesson_to_date(uuid, date);
-- Old 3-arg version if it existed
drop function if exists public.move_lesson_to_date(uuid, date, uuid);

create or replace function public.update_lesson_date(lesson_id uuid, new_lesson_date date)
returns void language sql security definer set search_path = public as $$
  update public.lessons set lesson_date = new_lesson_date where id = lesson_id and user_id = auth.uid();
$$;
create or replace function public.move_lesson_to_date(lesson_id uuid, new_lesson_date date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_student_id uuid;
  v_old_date date;
  v_updated int;
begin
  if v_user_id is null then return 0; end if;
  select l.student_id, l.lesson_date into v_student_id, v_old_date from public.lessons l where l.id = lesson_id and l.user_id = v_user_id;
  if v_student_id is null then return 0; end if;
  delete from public.lessons where user_id = v_user_id and student_id = v_student_id and lesson_date = new_lesson_date and id != lesson_id;
  delete from public.lessons where user_id = v_user_id and student_id = v_student_id and lesson_date = v_old_date and id != lesson_id;
  update public.lessons set lesson_date = new_lesson_date where id = lesson_id and user_id = v_user_id;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
grant execute on function public.update_lesson_date(uuid, date) to authenticated, service_role, anon;
grant execute on function public.move_lesson_to_date(uuid, date) to authenticated, service_role, anon;

-- Reload schema cache so PostgREST sees the new tables
notify pgrst, 'reload schema';
