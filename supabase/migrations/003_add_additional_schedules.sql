-- Add additional_schedules column for multi-day students.
-- Stores a JSON array of { dayOfWeek, timeOfDay, durationMinutes, rateCents }.
alter table public.students add column if not exists additional_schedules jsonb default null;
