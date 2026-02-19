-- Student change history for schedule/rate/termination events.
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

create policy "Users can CRUD own student_change_events"
  on public.student_change_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists student_change_events_student_created
  on public.student_change_events (student_id, created_at desc);
