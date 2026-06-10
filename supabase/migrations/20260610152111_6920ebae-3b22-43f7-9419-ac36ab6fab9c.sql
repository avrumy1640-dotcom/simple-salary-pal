
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS workweek_start_dow smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_ot_threshold numeric(6,2) NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS daily_ot_threshold numeric(6,2),
  ADD COLUMN IF NOT EXISTS daily_double_ot_threshold numeric(6,2),
  ADD COLUMN IF NOT EXISTS overtime_multiplier numeric(4,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS double_overtime_multiplier numeric(4,2) NOT NULL DEFAULT 2.0;

ALTER TABLE public.time_clock_punches
  ADD COLUMN IF NOT EXISTS corrected_from_id uuid REFERENCES public.time_clock_punches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_by uuid REFERENCES auth.users(id);

DROP TRIGGER IF EXISTS audit_time_clock_punches ON public.time_clock_punches;
CREATE TRIGGER audit_time_clock_punches
  AFTER INSERT OR UPDATE OR DELETE ON public.time_clock_punches
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS timesheet_id uuid REFERENCES public.timesheets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS double_overtime_hours numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holiday_hours numeric(6,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_time_entries_timesheet ON public.time_entries(timesheet_id);

DROP TRIGGER IF EXISTS audit_time_entries ON public.time_entries;
CREATE TRIGGER audit_time_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

CREATE OR REPLACE FUNCTION public.tg_block_if_timesheet_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts_id uuid;
  v_status timesheet_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ts_id := (to_jsonb(OLD) ->> 'timesheet_id')::uuid;
  ELSE
    v_ts_id := (to_jsonb(NEW) ->> 'timesheet_id')::uuid;
  END IF;
  IF v_ts_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  SELECT status INTO v_status FROM public.timesheets WHERE id = v_ts_id;
  IF v_status IN ('approved','locked') THEN
    RAISE EXCEPTION 'Timesheet % is %, cannot modify its time entries', v_ts_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DROP TRIGGER IF EXISTS block_locked_time_entries ON public.time_entries;
CREATE TRIGGER block_locked_time_entries
  BEFORE UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_if_timesheet_locked();

REVOKE EXECUTE ON FUNCTION public.tg_block_if_timesheet_locked() FROM PUBLIC, anon, authenticated;
