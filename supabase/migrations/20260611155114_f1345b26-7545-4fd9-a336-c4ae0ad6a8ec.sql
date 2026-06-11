
ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'admin';
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_kind
  ON public.ai_conversations(user_id, kind, updated_at DESC);

CREATE OR REPLACE FUNCTION public.guard_employee_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow updates by admins/HR/payroll in this company
  IF public.has_any_role(auth.uid(), NEW.company_id,
       ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role,'manager'::app_role,'supervisor'::app_role]) THEN
    RETURN NEW;
  END IF;

  -- Self-edit path: revert protected columns to OLD values
  IF NEW.user_id = auth.uid() THEN
    NEW.pay_rate := OLD.pay_rate;
    NEW.pay_type := OLD.pay_type;
    NEW.pto_balance_hours := OLD.pto_balance_hours;
    NEW.pto_accrual_per_period := OLD.pto_accrual_per_period;
    NEW.direct_deposit_enabled := OLD.direct_deposit_enabled;
    NEW.bank_account_last4 := OLD.bank_account_last4;
    NEW.bank_routing_last4 := OLD.bank_routing_last4;
    NEW.filing_status := OLD.filing_status;
    NEW.dependents := OLD.dependents;
    NEW.extra_withholding := OLD.extra_withholding;
    NEW.federal_allowances := OLD.federal_allowances;
    NEW.lifecycle_status := OLD.lifecycle_status;
    NEW.manager_id := OLD.manager_id;
    NEW.department := OLD.department;
    NEW.job_title := OLD.job_title;
    NEW.employment_type := OLD.employment_type;
    NEW.hire_date := OLD.hire_date;
    NEW.termination_date := OLD.termination_date;
    NEW.company_id := OLD.company_id;
    NEW.user_id := OLD.user_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_self_update ON public.employees;
CREATE TRIGGER trg_guard_employee_self_update
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.guard_employee_self_update();
