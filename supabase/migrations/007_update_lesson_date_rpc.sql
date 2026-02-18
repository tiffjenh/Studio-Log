-- RPC to update lesson_date so the change always persists (avoids PostgREST PATCH quirks).
-- Call from the app when rescheduling a lesson.
create or replace function public.update_lesson_date(
  lesson_id uuid,
  new_lesson_date date
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.lessons
  set lesson_date = new_lesson_date
  where id = lesson_id
    and user_id = auth.uid();
$$;

grant execute on function public.update_lesson_date(uuid, date) to authenticated;
grant execute on function public.update_lesson_date(uuid, date) to service_role;
