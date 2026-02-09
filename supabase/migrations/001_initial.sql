-- Profiles: name and phone for each auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text default null,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Students: per-user roster
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

alter table public.students enable row level security;

create policy "Users can CRUD own students"
  on public.students for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lessons: per-user lesson records
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  duration_minutes int not null,
  amount_cents int not null,
  completed boolean not null default false,
  note text default null,
  created_at timestamptz default now()
);

alter table public.lessons enable row level security;

create policy "Users can CRUD own lessons"
  on public.lessons for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create profile on signup (optional trigger; we'll upsert from app)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do update set
    name = coalesce(excluded.name, profiles.name),
    phone = coalesce(excluded.phone, profiles.phone),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
