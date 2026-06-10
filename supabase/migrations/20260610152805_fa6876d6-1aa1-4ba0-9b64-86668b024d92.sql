
-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.employee_lifecycle AS ENUM ('prospect','onboarding','active','on_leave','terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.employment_type AS ENUM ('full_time','part_time','temporary','intern','seasonal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- EMPLOYEES — lifecycle additions
-- ============================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS lifecycle_status public.employee_lifecycle NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS employment_type public.employment_type,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS termination_reason text,
  ADD COLUMN IF NOT EXISTS rehire_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pto_policy_id uuid REFERENCES public.pto_accrual_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_accrued_at timestamptz,
  ADD COLUMN IF NOT EXISTS leave_start_date date,
  ADD COLUMN IF NOT EXISTS leave_end_date date,
  ADD COLUMN IF NOT EXISTS leave_reason text;

-- Backfill lifecycle_status from legacy status
UPDATE public.employees
  SET lifecycle_status = CASE WHEN status = 'inactive' THEN 'terminated'::public.employee_lifecycle
                              ELSE 'active'::public.employee_lifecycle END
  WHERE lifecycle_status IS NULL OR (status = 'inactive' AND lifecycle_status <> 'terminated');

CREATE INDEX IF NOT EXISTS idx_employees_lifecycle ON public.employees(company_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_employees_manager   ON public.employees(manager_id);

-- ============================================================
-- LIFECYCLE GUARD TRIGGER
-- Block compensation / sensitive edits on terminated employees.
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_employee_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Auto-stamp termination_date when transitioning to terminated
  IF NEW.lifecycle_status = 'terminated' AND OLD.lifecycle_status <> 'terminated' THEN
    IF NEW.termination_date IS NULL THEN NEW.termination_date := CURRENT_DATE; END IF;
    NEW.status := 'inactive';
  END IF;

  -- Reactivation
  IF NEW.lifecycle_status = 'active' AND OLD.lifecycle_status = 'terminated' THEN
    NEW.status := 'active';
  END IF;

  -- If terminated and STAYING terminated, block edits to comp/banking fields
  IF OLD.lifecycle_status = 'terminated' AND NEW.lifecycle_status = 'terminated' THEN
    IF NEW.pay_rate IS DISTINCT FROM OLD.pay_rate
       OR NEW.pay_type IS DISTINCT FROM OLD.pay_type
       OR NEW.bank_account_last4 IS DISTINCT FROM OLD.bank_account_last4
       OR NEW.bank_routing_last4 IS DISTINCT FROM OLD.bank_routing_last4
       OR NEW.direct_deposit_enabled IS DISTINCT FROM OLD.direct_deposit_enabled THEN
      RAISE EXCEPTION 'Employee % is terminated; compensation and banking are immutable. Reactivate first.', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_employees_lifecycle ON public.employees;
CREATE TRIGGER tg_employees_lifecycle
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_employee_lifecycle_guard();

-- ============================================================
-- PTO LEDGER — compute balance_after automatically
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_pto_ledger_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prior numeric(10,2);
BEGIN
  SELECT COALESCE(balance_after, 0) INTO v_prior
    FROM public.pto_ledger
   WHERE employee_id = NEW.employee_id
   ORDER BY created_at DESC, id DESC
   LIMIT 1;
  NEW.balance_after := COALESCE(v_prior, 0) + NEW.delta_hours;

  -- Mirror balance onto employees for fast reads (NOT authoritative)
  UPDATE public.employees
     SET pto_balance_hours = NEW.balance_after
   WHERE id = NEW.employee_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pto_ledger_compute_balance ON public.pto_ledger;
CREATE TRIGGER tg_pto_ledger_compute_balance
  BEFORE INSERT ON public.pto_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_pto_ledger_balance();

-- Unique guard: one ledger row per pto_entries approval (and per accrual run-employee)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pto_ledger_ref
  ON public.pto_ledger(ref_type, ref_id, reason)
  WHERE ref_id IS NOT NULL;

-- ============================================================
-- PTO ENTRIES — auto-ledger on status transitions
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_pto_entry_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Approval: debit balance
  IF (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved')
     OR (TG_OP = 'INSERT' AND NEW.status = 'approved') THEN
    INSERT INTO public.pto_ledger(company_id, employee_id, delta_hours, reason, ref_type, ref_id, balance_after)
    VALUES (NEW.company_id, NEW.employee_id, -ABS(NEW.hours), 'pto_request_approved', 'pto_entries', NEW.id, 0)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Revoke approval (approved -> not approved): credit back
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    INSERT INTO public.pto_ledger(company_id, employee_id, delta_hours, reason, ref_type, ref_id, balance_after)
    VALUES (NEW.company_id, NEW.employee_id, ABS(NEW.hours), 'pto_request_reversed', 'pto_entries', NEW.id, 0);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pto_entries_apply ON public.pto_entries;
CREATE TRIGGER tg_pto_entries_apply
  AFTER INSERT OR UPDATE OF status ON public.pto_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_pto_entry_apply();

-- ============================================================
-- ACCRUAL RUN TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pto_accrual_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  as_of_date  date NOT NULL,
  policy_id   uuid REFERENCES public.pto_accrual_policies(id) ON DELETE SET NULL,
  employees_accrued integer NOT NULL DEFAULT 0,
  hours_total numeric(12,2) NOT NULL DEFAULT 0,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, as_of_date, policy_id)
);
GRANT SELECT, INSERT ON public.pto_accrual_runs TO authenticated;
GRANT ALL ON public.pto_accrual_runs TO service_role;
ALTER TABLE public.pto_accrual_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accrual_runs_admin_manage" ON public.pto_accrual_runs
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));

-- ============================================================
-- BALANCE VIEW — authoritative balance derived from ledger
-- ============================================================
CREATE OR REPLACE VIEW public.employee_pto_balances
WITH (security_invoker = true) AS
SELECT
  e.id                AS employee_id,
  e.company_id,
  e.full_name,
  COALESCE(SUM(l.delta_hours), 0)::numeric(10,2) AS balance_hours,
  COALESCE(SUM(CASE WHEN l.delta_hours > 0 THEN l.delta_hours END), 0)::numeric(10,2) AS lifetime_accrued,
  COALESCE(SUM(CASE WHEN l.delta_hours < 0 THEN -l.delta_hours END), 0)::numeric(10,2) AS lifetime_used,
  MAX(l.created_at)   AS last_ledger_at
FROM public.employees e
LEFT JOIN public.pto_ledger l ON l.employee_id = e.id
GROUP BY e.id, e.company_id, e.full_name;

GRANT SELECT ON public.employee_pto_balances TO authenticated;
