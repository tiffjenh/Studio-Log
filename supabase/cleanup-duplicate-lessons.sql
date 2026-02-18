-- =============================================================================
-- ONE-TIME CLEANUP: Run in Supabase SQL Editor if the same lesson still appears on two dates.
-- =============================================================================

-- 1) Remove duplicates where the same student has multiple rows on the SAME date (keeps one per student per date)
DELETE FROM public.lessons a
USING public.lessons b
WHERE a.user_id = b.user_id
  AND a.student_id = b.student_id
  AND a.lesson_date = b.lesson_date
  AND a.id > b.id;

-- 2) To fix "lesson on both Feb 18 and Feb 19": list lessons so you can delete the wrong one by id.
--    Run this, then delete the row you don't want (e.g. the one on the old date) in Table Editor → lessons.
-- SELECT id, student_id, lesson_date, duration_minutes, amount_cents, completed
-- FROM public.lessons
-- WHERE user_id = auth.uid()
-- ORDER BY student_id, lesson_date;
