
-- IMMUTABLE AUDIT
CREATE OR REPLACE FUNCTION public.tg_audit_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END $$;
DROP TRIGGER IF EXISTS trg_audit_events_immutable ON public.audit_events;
CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_events_immutable();

-- GL TABLES
CREATE TABLE IF NOT EXISTS public.gl_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  posting_date date NOT NULL,
  memo text,
  total_debit numeric(14,2) NOT NULL DEFAULT 0,
  total_credit numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'posted',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gl_journal_entries TO authenticated;
GRANT ALL ON public.gl_journal_entries TO service_role;
ALTER TABLE public.gl_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gl_je_admin_manage" ON public.gl_journal_entries
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]));

CREATE TABLE IF NOT EXISTS public.gl_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  journal_id uuid NOT NULL REFERENCES public.gl_journal_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_name text NOT NULL,
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  memo text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit = 0) OR (credit = 0))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gl_journal_lines TO authenticated;
GRANT ALL ON public.gl_journal_lines TO service_role;
ALTER TABLE public.gl_journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gl_jl_admin_manage" ON public.gl_journal_lines
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]));

CREATE INDEX IF NOT EXISTS idx_gl_lines_journal ON public.gl_journal_lines(journal_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_journal_per_run ON public.gl_journal_entries(run_id) WHERE run_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_gl_for_run(_run_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_journal_id uuid;
  v_sort integer := 0;
  v_total_gross numeric(14,2) := 0;
  v_total_ee_tax numeric(14,2) := 0;
  v_total_er_tax numeric(14,2) := 0;
  v_total_ded numeric(14,2) := 0;
  v_total_net numeric(14,2) := 0;
  r record;
BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = _run_id;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'run not found'; END IF;
  IF NOT public.has_any_role(auth.uid(), v_run.company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN line_type='earning' THEN amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN line_type='employee_tax' THEN amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN line_type='employer_tax' THEN amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN line_type='deduction' THEN amount ELSE 0 END),0)
  INTO v_total_gross, v_total_ee_tax, v_total_er_tax, v_total_ded
  FROM public.payroll_item_lines WHERE run_id = _run_id;

  v_total_net := v_total_gross - v_total_ee_tax - v_total_ded;

  DELETE FROM public.gl_journal_entries WHERE run_id = _run_id;

  INSERT INTO public.gl_journal_entries(company_id, run_id, posting_date, memo, total_debit, total_credit, created_by)
  VALUES (v_run.company_id, _run_id, COALESCE(v_run.pay_date, CURRENT_DATE),
          'Payroll run ' || _run_id::text || ' (' || v_run.period_start || ' – ' || v_run.period_end || ')',
          v_total_gross + v_total_er_tax,
          v_total_ee_tax + v_total_er_tax + v_total_ded + v_total_net,
          auth.uid())
  RETURNING id INTO v_journal_id;

  IF v_total_gross > 0 THEN
    v_sort := v_sort + 1;
    INSERT INTO public.gl_journal_lines(company_id, journal_id, account_code, account_name, debit, sort_order, memo)
    VALUES (v_run.company_id, v_journal_id, '6000', 'Wages Expense', v_total_gross, v_sort, 'Gross wages');
  END IF;

  IF v_total_er_tax > 0 THEN
    v_sort := v_sort + 1;
    INSERT INTO public.gl_journal_lines(company_id, journal_id, account_code, account_name, debit, sort_order, memo)
    VALUES (v_run.company_id, v_journal_id, '6100', 'Employer Payroll Tax Expense', v_total_er_tax, v_sort, 'Employer FICA / FUTA / SUTA');
  END IF;

  FOR r IN
    SELECT code, SUM(amount) AS amt
      FROM public.payroll_item_lines
     WHERE run_id = _run_id AND line_type IN ('employee_tax','employer_tax')
     GROUP BY code
     HAVING SUM(amount) > 0
     ORDER BY code
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.gl_journal_lines(company_id, journal_id, account_code, account_name, credit, sort_order, memo)
    VALUES (v_run.company_id, v_journal_id, '2100-' || r.code, 'Payroll Tax Payable — ' || r.code, r.amt, v_sort, 'Tax withheld/owed for ' || r.code);
  END LOOP;

  IF v_total_ded > 0 THEN
    v_sort := v_sort + 1;
    INSERT INTO public.gl_journal_lines(company_id, journal_id, account_code, account_name, credit, sort_order, memo)
    VALUES (v_run.company_id, v_journal_id, '2200', 'Employee Deductions Payable', v_total_ded, v_sort, 'Pre/post-tax deductions');
  END IF;

  IF v_total_net > 0 THEN
    v_sort := v_sort + 1;
    INSERT INTO public.gl_journal_lines(company_id, journal_id, account_code, account_name, credit, sort_order, memo)
    VALUES (v_run.company_id, v_journal_id, '1010', 'Payroll Cash', v_total_net, v_sort, 'Net pay disbursed');
  END IF;

  RETURN v_journal_id;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_gl_for_run(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_payroll_runs_post_gl()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    BEGIN
      PERFORM public.generate_gl_for_run(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payroll_runs_post_gl ON public.payroll_runs;
CREATE TRIGGER trg_payroll_runs_post_gl
  AFTER UPDATE OF status ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_runs_post_gl();

-- W-2 / 1099 SUMMARIES
CREATE OR REPLACE VIEW public.w2_annual_summary
WITH (security_invoker = on) AS
SELECT
  e.company_id,
  e.id          AS employee_id,
  e.full_name   AS employee_name,
  e.ssn_last4,
  EXTRACT(YEAR FROM r.pay_date)::int AS tax_year,
  SUM(COALESCE(pi.gross_pay,0))      AS gross_wages,
  SUM(COALESCE(pi.federal_tax,0))    AS federal_withheld,
  SUM(COALESCE(pi.state_tax,0))      AS state_withheld,
  SUM(COALESCE(pi.social_security,0)) AS social_security_withheld,
  SUM(COALESCE(pi.medicare,0))       AS medicare_withheld,
  SUM(COALESCE(pi.net_pay,0))        AS net_pay
FROM public.payroll_items pi
JOIN public.payroll_runs r ON r.id = pi.run_id
JOIN public.employees e ON e.id = pi.employee_id
WHERE r.status IN ('paid','reversed') AND r.pay_date IS NOT NULL
GROUP BY e.company_id, e.id, e.full_name, e.ssn_last4, EXTRACT(YEAR FROM r.pay_date);
GRANT SELECT ON public.w2_annual_summary TO authenticated;

CREATE OR REPLACE VIEW public.form_1099_annual_summary
WITH (security_invoker = on) AS
SELECT
  c.company_id,
  c.id                AS contractor_id,
  c.full_name         AS contractor_name,
  c.tax_id_last4,
  EXTRACT(YEAR FROM cp.payment_date)::int AS tax_year,
  SUM(COALESCE(cp.amount,0)) AS total_paid,
  COUNT(*)                   AS payment_count
FROM public.contractor_payments cp
JOIN public.contractors c ON c.id = cp.contractor_id
WHERE cp.status IN ('paid','processed') AND cp.payment_date IS NOT NULL
GROUP BY c.company_id, c.id, c.full_name, c.tax_id_last4, EXTRACT(YEAR FROM cp.payment_date);
GRANT SELECT ON public.form_1099_annual_summary TO authenticated;
