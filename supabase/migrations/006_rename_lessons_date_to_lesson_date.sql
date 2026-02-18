-- Rename "date" to "lesson_date" so PostgREST/Supabase reliably accept updates.
-- The column name "date" is a PostgreSQL reserved word and can be skipped in PATCH bodies.
alter table public.lessons
  rename column date to lesson_date;
