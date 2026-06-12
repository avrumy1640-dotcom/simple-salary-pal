
-- D.1: taxable_wages_basis on payroll_item_lines (audit trail for box 1 / 3 / 5)
ALTER TABLE public.payroll_item_lines
  ADD COLUMN IF NOT EXISTS taxable_wages_basis numeric(14,2);

COMMENT ON COLUMN public.payroll_item_lines.taxable_wages_basis IS
  'Wage base the tax/deduction line was computed against. Used to reconcile W-2 box 1 vs box 3/5 differences.';

-- D.2: employer_tax_payments — actual EFTPS / state portal remittances.
CREATE TABLE IF NOT EXISTS public.employer_tax_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  liability_id uuid REFERENCES public.employer_tax_liabilities(id) ON DELETE SET NULL,
  agency text NOT NULL,                 -- 'IRS', 'CA-EDD', 'NY-DOL', etc.
  tax_kind text NOT NULL,               -- 'federal_941', 'futa', 'sui', 'sdi', 'fli', 'local'
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  paid_on date NOT NULL,
  confirmation_ref text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','confirmed','reconciled','rejected')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_etpay_company ON public.employer_tax_payments(company_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS ix_etpay_liability ON public.employer_tax_payments(liability_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_tax_payments TO authenticated;
GRANT ALL ON public.employer_tax_payments TO service_role;
ALTER TABLE public.employer_tax_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll admins manage tax payments" ON public.employer_tax_payments
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]));

CREATE POLICY "Auditors view tax payments" ON public.employer_tax_payments
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['auditor']::app_role[]));

CREATE TRIGGER trg_etpay_updated BEFORE UPDATE ON public.employer_tax_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- D.3: payroll_ytd_snapshots — fast YTD lookup per employee per pay date.
CREATE TABLE IF NOT EXISTS public.payroll_ytd_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tax_year integer NOT NULL,
  pay_date date NOT NULL,
  run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  ytd_gross numeric(14,2) NOT NULL DEFAULT 0,
  ytd_fed_tax numeric(14,2) NOT NULL DEFAULT 0,
  ytd_ss_wages numeric(14,2) NOT NULL DEFAULT 0,
  ytd_ss_tax numeric(14,2) NOT NULL DEFAULT 0,
  ytd_medicare_wages numeric(14,2) NOT NULL DEFAULT 0,
  ytd_medicare_tax numeric(14,2) NOT NULL DEFAULT 0,
  ytd_state_tax numeric(14,2) NOT NULL DEFAULT 0,
  ytd_pretax_deductions numeric(14,2) NOT NULL DEFAULT 0,
  ytd_posttax_deductions numeric(14,2) NOT NULL DEFAULT 0,
  ytd_net numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, tax_year, pay_date)
);
CREATE INDEX IF NOT EXISTS ix_ytd_company_year ON public.payroll_ytd_snapshots(company_id, tax_year);
CREATE INDEX IF NOT EXISTS ix_ytd_employee_year ON public.payroll_ytd_snapshots(employee_id, tax_year, pay_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_ytd_snapshots TO authenticated;
GRANT ALL ON public.payroll_ytd_snapshots TO service_role;
ALTER TABLE public.payroll_ytd_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll admins read YTD snapshots" ON public.payroll_ytd_snapshots
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]));

CREATE POLICY "Service role writes YTD snapshots" ON public.payroll_ytd_snapshots
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]));

CREATE POLICY "Employee reads own YTD snapshots" ON public.payroll_ytd_snapshots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));

CREATE TRIGGER trg_ytd_updated BEFORE UPDATE ON public.payroll_ytd_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- D.4: Trigger that materializes YTD snapshots whenever a run becomes paid.
CREATE OR REPLACE FUNCTION public.tg_payroll_runs_materialize_ytd()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_year integer;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN RETURN NEW; END IF;
  IF NEW.pay_date IS NULL THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NEW.pay_date)::int;

  WITH per_emp AS (
    SELECT
      pi.employee_id,
      SUM(pi.gross_pay)        AS gross,
      SUM(pi.federal_tax)      AS fed_tax,
      SUM(pi.social_security)  AS ss_tax,
      SUM(pi.medicare)         AS med_tax,
      SUM(pi.state_tax)        AS state_tax,
      SUM(pi.net_pay)          AS net
    FROM public.payroll_items pi
    WHERE pi.run_id = NEW.id
    GROUP BY pi.employee_id
  ),
  prior AS (
    SELECT DISTINCT ON (employee_id)
      employee_id, ytd_gross, ytd_fed_tax, ytd_ss_wages, ytd_ss_tax,
      ytd_medicare_wages, ytd_medicare_tax, ytd_state_tax,
      ytd_pretax_deductions, ytd_posttax_deductions, ytd_net
    FROM public.payroll_ytd_snapshots
    WHERE company_id = NEW.company_id
      AND tax_year = v_year
      AND pay_date < NEW.pay_date
      AND employee_id IN (SELECT employee_id FROM per_emp)
    ORDER BY employee_id, pay_date DESC
  )
  INSERT INTO public.payroll_ytd_snapshots (
    company_id, employee_id, tax_year, pay_date, run_id,
    ytd_gross, ytd_fed_tax, ytd_ss_wages, ytd_ss_tax,
    ytd_medicare_wages, ytd_medicare_tax, ytd_state_tax,
    ytd_pretax_deductions, ytd_posttax_deductions, ytd_net
  )
  SELECT
    NEW.company_id, p.employee_id, v_year, NEW.pay_date, NEW.id,
    COALESCE(pr.ytd_gross,0)         + p.gross,
    COALESCE(pr.ytd_fed_tax,0)       + p.fed_tax,
    COALESCE(pr.ytd_ss_wages,0)      + p.gross,    -- approx: refine when item_lines basis is populated
    COALESCE(pr.ytd_ss_tax,0)        + p.ss_tax,
    COALESCE(pr.ytd_medicare_wages,0)+ p.gross,
    COALESCE(pr.ytd_medicare_tax,0)  + p.med_tax,
    COALESCE(pr.ytd_state_tax,0)     + p.state_tax,
    COALESCE(pr.ytd_pretax_deductions,0),
    COALESCE(pr.ytd_posttax_deductions,0),
    COALESCE(pr.ytd_net,0)           + p.net
  FROM per_emp p
  LEFT JOIN prior pr ON pr.employee_id = p.employee_id
  ON CONFLICT (employee_id, tax_year, pay_date) DO UPDATE
    SET ytd_gross = EXCLUDED.ytd_gross,
        ytd_fed_tax = EXCLUDED.ytd_fed_tax,
        ytd_ss_wages = EXCLUDED.ytd_ss_wages,
        ytd_ss_tax = EXCLUDED.ytd_ss_tax,
        ytd_medicare_wages = EXCLUDED.ytd_medicare_wages,
        ytd_medicare_tax = EXCLUDED.ytd_medicare_tax,
        ytd_state_tax = EXCLUDED.ytd_state_tax,
        ytd_net = EXCLUDED.ytd_net,
        run_id = EXCLUDED.run_id,
        updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_payroll_runs_materialize_ytd failed for run %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payroll_runs_materialize_ytd ON public.payroll_runs;
CREATE TRIGGER payroll_runs_materialize_ytd
  AFTER UPDATE OF status ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_runs_materialize_ytd();

-- D.5: Reconciliation helper — compare accrued liabilities to confirmed payments.
CREATE OR REPLACE FUNCTION public.reconcile_employer_tax(_company_id uuid, _year integer)
  RETURNS TABLE(tax_kind text, accrued numeric, paid numeric, variance numeric)
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  WITH accrued AS (
    SELECT 'employer_ss'::text AS tax_kind, COALESCE(SUM(l.employer_ss),0) AS accrued
      FROM public.employer_tax_liabilities l
      JOIN public.payroll_runs r ON r.id = l.run_id
     WHERE l.company_id = _company_id
       AND EXTRACT(YEAR FROM r.pay_date) = _year
    UNION ALL
    SELECT 'employer_medicare', COALESCE(SUM(l.employer_medicare),0)
      FROM public.employer_tax_liabilities l JOIN public.payroll_runs r ON r.id = l.run_id
     WHERE l.company_id = _company_id AND EXTRACT(YEAR FROM r.pay_date) = _year
    UNION ALL
    SELECT 'futa', COALESCE(SUM(l.futa),0)
      FROM public.employer_tax_liabilities l JOIN public.payroll_runs r ON r.id = l.run_id
     WHERE l.company_id = _company_id AND EXTRACT(YEAR FROM r.pay_date) = _year
    UNION ALL
    SELECT 'sui', COALESCE(SUM(l.suta),0)
      FROM public.employer_tax_liabilities l JOIN public.payroll_runs r ON r.id = l.run_id
     WHERE l.company_id = _company_id AND EXTRACT(YEAR FROM r.pay_date) = _year
  ),
  paid AS (
    SELECT
      CASE
        WHEN p.tax_kind IN ('federal_941') THEN 'employer_ss'
        WHEN p.tax_kind = 'futa' THEN 'futa'
        WHEN p.tax_kind = 'sui' THEN 'sui'
        ELSE p.tax_kind
      END AS tax_kind,
      COALESCE(SUM(p.amount),0) AS paid
    FROM public.employer_tax_payments p
    WHERE p.company_id = _company_id
      AND p.status IN ('confirmed','reconciled')
      AND EXTRACT(YEAR FROM p.period_end) = _year
    GROUP BY 1
  )
  SELECT a.tax_kind,
         a.accrued,
         COALESCE(pp.paid, 0) AS paid,
         a.accrued - COALESCE(pp.paid, 0) AS variance
    FROM accrued a
    LEFT JOIN paid pp ON pp.tax_kind = a.tax_kind
   ORDER BY a.tax_kind;
$$;

REVOKE ALL ON FUNCTION public.reconcile_employer_tax(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_employer_tax(uuid, integer) TO authenticated;
