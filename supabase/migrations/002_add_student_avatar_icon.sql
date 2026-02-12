-- Optional avatar icon for students (e.g. dog, cat, bear). Null = show initials.
alter table public.students
  add column if not exists avatar_icon text default null;
