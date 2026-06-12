
CREATE OR REPLACE FUNCTION public.tg_payroll_runs_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'reversed' THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.payroll_runs r
    WHERE r.company_id = NEW.company_id
      AND r.id <> NEW.id
      AND r.status <> 'reversed'
      AND daterange(r.period_start, r.period_end, '[]')
       && daterange(NEW.period_start, NEW.period_end, '[]')
  ) THEN
    RAISE EXCEPTION 'Payroll run overlaps an existing run for this company (% to %)',
      NEW.period_start, NEW.period_end USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payroll_runs_no_overlap ON public.payroll_runs;
CREATE TRIGGER payroll_runs_no_overlap
  BEFORE INSERT OR UPDATE OF company_id, period_start, period_end, status
  ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_runs_no_overlap();

CREATE UNIQUE INDEX IF NOT EXISTS time_clock_punches_no_duplicate
  ON public.time_clock_punches (employee_id, punch_type, punched_at);

CREATE INDEX IF NOT EXISTS payroll_items_run_id_idx          ON public.payroll_items (run_id);
CREATE INDEX IF NOT EXISTS payroll_items_employee_id_idx     ON public.payroll_items (employee_id);
CREATE INDEX IF NOT EXISTS payroll_item_lines_run_id_idx     ON public.payroll_item_lines (run_id);
CREATE INDEX IF NOT EXISTS time_clock_punches_emp_at_idx     ON public.time_clock_punches (employee_id, punched_at DESC);
CREATE INDEX IF NOT EXISTS time_entries_employee_idx         ON public.time_entries (employee_id);
CREATE INDEX IF NOT EXISTS timesheets_employee_period_idx    ON public.timesheets (employee_id, period_start DESC);
CREATE INDEX IF NOT EXISTS pto_ledger_employee_idx           ON public.pto_ledger (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx    ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_company_occurred_idx ON public.audit_events (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx           ON public.audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS user_roles_user_company_idx       ON public.user_roles (user_id, company_id);
