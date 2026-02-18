-- Per-lesson reschedule time (e.g. "4:00 PM"). When set, overrides student default for display.
alter table public.lessons
  add column if not exists time_of_day text default null;
