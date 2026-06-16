
-- Partial unique index to identify auto-generated rollup rows
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_auto_punches_uniq
  ON public.time_entries (employee_id, work_date)
  WHERE notes = 'auto:punches';

-- Rollup function: recompute one (employee, date) auto entry from punches
CREATE OR REPLACE FUNCTION public.rollup_punches_to_entry(_employee_id uuid, _work_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_hours numeric(6,2) := 0;
  v_locked boolean := false;
BEGIN
  SELECT company_id INTO v_company FROM public.employees WHERE id = _employee_id;
  IF v_company IS NULL THEN RETURN; END IF;

  WITH ordered AS (
    SELECT punch_type, punched_at,
           LAG(punch_type) OVER (ORDER BY punched_at) AS prev_type,
           LAG(punched_at) OVER (ORDER BY punched_at) AS prev_at
      FROM public.time_clock_punches
     WHERE employee_id = _employee_id
       AND (punched_at AT TIME ZONE 'UTC')::date = _work_date
  )
  SELECT COALESCE(SUM(
    CASE
      WHEN punch_type IN ('out','break_start') AND prev_type IN ('in','break_end')
        THEN EXTRACT(EPOCH FROM (punched_at - prev_at)) / 3600.0
      ELSE 0
    END
  ), 0)::numeric(6,2)
    INTO v_hours
    FROM ordered;

  -- Skip when the existing auto entry is on a locked/approved timesheet
  SELECT EXISTS (
    SELECT 1 FROM public.time_entries te
    LEFT JOIN public.timesheets ts ON ts.id = te.timesheet_id
    WHERE te.employee_id = _employee_id
      AND te.work_date = _work_date
      AND te.notes = 'auto:punches'
      AND ts.status IN ('approved','locked')
  ) INTO v_locked;
  IF v_locked THEN RETURN; END IF;

  IF v_hours > 0 THEN
    INSERT INTO public.time_entries (employee_id, company_id, work_date, hours, notes)
    VALUES (_employee_id, v_company, _work_date, v_hours, 'auto:punches')
    ON CONFLICT (employee_id, work_date) WHERE notes = 'auto:punches'
    DO UPDATE SET hours = EXCLUDED.hours;
  ELSE
    DELETE FROM public.time_entries
     WHERE employee_id = _employee_id
       AND work_date = _work_date
       AND notes = 'auto:punches';
  END IF;
END $$;

-- Trigger function on time_clock_punches
CREATE OR REPLACE FUNCTION public.tg_punches_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_emp := OLD.employee_id;
    v_date := (OLD.punched_at AT TIME ZONE 'UTC')::date;
  ELSE
    v_emp := NEW.employee_id;
    v_date := (NEW.punched_at AT TIME ZONE 'UTC')::date;
  END IF;
  IF v_emp IS NOT NULL THEN
    BEGIN
      PERFORM public.rollup_punches_to_entry(v_emp, v_date);
    EXCEPTION WHEN OTHERS THEN
      -- Never block the punch on rollup failure
      RAISE WARNING 'tg_punches_rollup failed for emp % date %: %', v_emp, v_date, SQLERRM;
    END;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS punches_rollup_to_entry ON public.time_clock_punches;
CREATE TRIGGER punches_rollup_to_entry
AFTER INSERT OR UPDATE OR DELETE ON public.time_clock_punches
FOR EACH ROW EXECUTE FUNCTION public.tg_punches_rollup();

-- Backfill: roll up all existing punches into auto entries
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT employee_id, (punched_at AT TIME ZONE 'UTC')::date AS d
      FROM public.time_clock_punches
     WHERE employee_id IS NOT NULL
  LOOP
    PERFORM public.rollup_punches_to_entry(r.employee_id, r.d);
  END LOOP;
END $$;
