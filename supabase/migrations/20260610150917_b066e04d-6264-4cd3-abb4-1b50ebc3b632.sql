
-- 1) Expand status check
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft','calculating','approved','paid','reversed'));

-- 2) Line-item breakdown table
CREATE TABLE IF NOT EXISTS public.payroll_item_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.payroll_items(id) ON DELETE CASCADE,
  -- 'earning' | 'employee_tax' | 'pre_tax_deduction' | 'post_tax_deduction' | 'garnishment' | 'employer_tax' | 'reimbursement'
  line_type text NOT NULL,
  code text NOT NULL,           -- e.g. 'regular','overtime','federal','social_security','401k','child_support'
  description text,
  hours numeric(10,2),
  rate numeric(12,4),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  taxable boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_item_lines_run ON public.payroll_item_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_item_lines_item ON public.payroll_item_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_payroll_item_lines_company ON public.payroll_item_lines(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_item_lines TO authenticated;
GRANT ALL ON public.payroll_item_lines TO service_role;

ALTER TABLE public.payroll_item_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_item_lines_admin_manage" ON public.payroll_item_lines
  TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]));

CREATE POLICY "payroll_item_lines_self_view" ON public.payroll_item_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payroll_items pi
      WHERE pi.id = payroll_item_lines.item_id
        AND pi.employee_id = public.current_employee_id(payroll_item_lines.company_id)
    )
  );

CREATE TRIGGER audit_payroll_item_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_item_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

-- 3) Lock-enforcement trigger function
CREATE OR REPLACE FUNCTION public.tg_block_if_run_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_locked boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_run_id := (to_jsonb(OLD) ->> 'run_id')::uuid;
  ELSE
    v_run_id := (to_jsonb(NEW) ->> 'run_id')::uuid;
  END IF;

  SELECT (locked_at IS NOT NULL OR status IN ('paid','reversed'))
    INTO v_locked
  FROM public.payroll_runs WHERE id = v_run_id;

  IF v_locked THEN
    RAISE EXCEPTION 'Payroll run % is locked and cannot be modified', v_run_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DROP TRIGGER IF EXISTS block_locked_payroll_items ON public.payroll_items;
CREATE TRIGGER block_locked_payroll_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_if_run_locked();

DROP TRIGGER IF EXISTS block_locked_payroll_item_lines ON public.payroll_item_lines;
CREATE TRIGGER block_locked_payroll_item_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_item_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_if_run_locked();

DROP TRIGGER IF EXISTS block_locked_employer_tax ON public.employer_tax_liabilities;
CREATE TRIGGER block_locked_employer_tax
  BEFORE INSERT OR UPDATE OR DELETE ON public.employer_tax_liabilities
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_if_run_locked();

-- 4) payroll_runs: block sensitive edits when locked + auto-stamp lock on paid
CREATE OR REPLACE FUNCTION public.tg_payroll_runs_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-stamp locked_at when moving to 'paid'
  IF NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.locked_at IS NULL THEN
    NEW.locked_at := now();
    NEW.locked_by := auth.uid();
    IF NEW.processed_at IS NULL THEN NEW.processed_at := now(); END IF;
  END IF;

  -- Once locked, prevent editing financial / period fields (allow status flow to 'reversed' and reversal metadata)
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.gross_total IS DISTINCT FROM OLD.gross_total
       OR NEW.tax_total IS DISTINCT FROM OLD.tax_total
       OR NEW.net_total IS DISTINCT FROM OLD.net_total
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.pay_date IS DISTINCT FROM OLD.pay_date THEN
      RAISE EXCEPTION 'Payroll run % is locked; financial and period fields are immutable', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payroll_runs_lock_guard ON public.payroll_runs;
CREATE TRIGGER payroll_runs_lock_guard
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_runs_lock_guard();

-- 5) Helpful YTD view for the engine
CREATE OR REPLACE VIEW public.employee_ytd_wages AS
SELECT
  pi.company_id,
  pi.employee_id,
  date_part('year', pr.pay_date)::int AS tax_year,
  COALESCE(SUM(pi.gross_pay), 0)::numeric(14,2) AS ytd_gross,
  COALESCE(SUM(pi.gross_pay), 0)::numeric(14,2) AS ytd_ss_wages
FROM public.payroll_items pi
JOIN public.payroll_runs pr ON pr.id = pi.run_id
WHERE pr.status IN ('approved','paid')
GROUP BY pi.company_id, pi.employee_id, date_part('year', pr.pay_date);

GRANT SELECT ON public.employee_ytd_wages TO authenticated;
GRANT SELECT ON public.employee_ytd_wages TO service_role;

REVOKE EXECUTE ON FUNCTION public.tg_block_if_run_locked() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_payroll_runs_lock_guard() FROM PUBLIC, anon;
