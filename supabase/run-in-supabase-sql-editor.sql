-- =============================================================================
-- RESCHEDULE FIX: Run this ENTIRE file in Supabase Dashboard → SQL Editor → New query → Run.
-- If you ran it before, run it again so move_lesson_to_date uses the latest 2-arg version.
-- =============================================================================

-- 1) Rename "date" to "lesson_date" only if the column is still named "date"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'date'
  ) THEN
    ALTER TABLE public.lessons RENAME COLUMN date TO lesson_date;
  END IF;
END $$;

-- 2) RPC: update one lesson's date (used by app for simple date change)
CREATE OR REPLACE FUNCTION public.update_lesson_date(
  lesson_id uuid,
  new_lesson_date date
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.lessons
  SET lesson_date = new_lesson_date
  WHERE id = lesson_id
    AND user_id = auth.uid();
$$;

-- 3) RPC: move a lesson to a new date and remove any other lessons for that student on old or new date (so only one lesson remains)
-- Uses auth.uid() from the JWT so no client uid is needed.
CREATE OR REPLACE FUNCTION public.move_lesson_to_date(
  lesson_id uuid,
  new_lesson_date date
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_student_id uuid;
  v_old_date date;
  v_updated int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT l.student_id, l.lesson_date INTO v_student_id, v_old_date
  FROM public.lessons l
  WHERE l.id = lesson_id AND l.user_id = v_user_id;

  IF v_student_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Remove any other lesson for this student on the NEW date (so we don't end up with two on that day)
  DELETE FROM public.lessons
  WHERE user_id = v_user_id
    AND student_id = v_student_id
    AND lesson_date = new_lesson_date
    AND id != lesson_id;

  -- Remove any other lesson for this student on the OLD date
  DELETE FROM public.lessons
  WHERE user_id = v_user_id
    AND student_id = v_student_id
    AND lesson_date = v_old_date
    AND id != lesson_id;

  -- Move this lesson to the new date
  UPDATE public.lessons
  SET lesson_date = new_lesson_date
  WHERE id = lesson_id AND user_id = v_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Drop old 3-arg version if it exists (so the new 2-arg version is the one used)
DROP FUNCTION IF EXISTS public.move_lesson_to_date(uuid, date, uuid);

GRANT EXECUTE ON FUNCTION public.update_lesson_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_lesson_date(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_lesson_date(uuid, date) TO anon;
GRANT EXECUTE ON FUNCTION public.move_lesson_to_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_lesson_to_date(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_lesson_to_date(uuid, date) TO anon;
