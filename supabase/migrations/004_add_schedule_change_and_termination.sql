-- Add schedule-change columns so a student's day/time/duration/rate can change from a given date.
alter table public.students add column if not exists schedule_change_from_date text default null;
alter table public.students add column if not exists schedule_change_day_of_week int default null;
alter table public.students add column if not exists schedule_change_time_of_day text default null;
alter table public.students add column if not exists schedule_change_duration_minutes int default null;
alter table public.students add column if not exists schedule_change_rate_cents int default null;
alter table public.students add column if not exists schedule_change_additional_schedules jsonb default null;

-- Add termination date so students can stop appearing on the calendar after a date.
alter table public.students add column if not exists terminated_from_date text default null;
