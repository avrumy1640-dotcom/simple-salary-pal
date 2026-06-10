
-- 1) Candidates: restrict SELECT to recruiting staff + managers
DROP POLICY IF EXISTS "members view candidates" ON public.candidates;
CREATE POLICY "candidates_recruiting_view" ON public.candidates
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin','hr_admin','recruiter','manager']::app_role[]));

-- 2) tax_records: restrict SELECT to payroll/finance roles
DROP POLICY IF EXISTS "members_view_tax_records" ON public.tax_records;
CREATE POLICY "tax_records_payroll_view" ON public.tax_records
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]));

-- 3) company_settings: restrict SELECT to owner/admin
DROP POLICY IF EXISTS "company_settings_member_view" ON public.company_settings;
CREATE POLICY "company_settings_admin_view" ON public.company_settings
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin']::app_role[]));

-- 4) bank_connections: hide Plaid credentials via column-level GRANTs
--    Split the self ALL policy into INSERT/UPDATE/DELETE only (no SELECT for self).
DROP POLICY IF EXISTS "bank_connections_self_manage" ON public.bank_connections;
CREATE POLICY "bank_connections_self_insert" ON public.bank_connections
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id(company_id));
CREATE POLICY "bank_connections_self_update" ON public.bank_connections
  FOR UPDATE TO authenticated
  USING (employee_id = public.current_employee_id(company_id))
  WITH CHECK (employee_id = public.current_employee_id(company_id));
CREATE POLICY "bank_connections_self_delete" ON public.bank_connections
  FOR DELETE TO authenticated
  USING (employee_id = public.current_employee_id(company_id));
CREATE POLICY "bank_connections_self_view_safe" ON public.bank_connections
  FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

-- Column-level SELECT grant: omit plaid_access_token and plaid_item_id.
REVOKE SELECT ON public.bank_connections FROM authenticated;
GRANT SELECT (
  id, provider, account_id, account_type, account_subtype,
  contractor_id, employee_id, owner_id, company_id, updated_at,
  institution_name, account_name, account_mask,
  created_at, linked_at, status, routing_number_last4, is_company
) ON public.bank_connections TO authenticated;

-- 5) employees self-update: block sensitive columns for non-admin self-edits.
CREATE OR REPLACE FUNCTION public.tg_employees_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_self boolean := (OLD.user_id IS NOT NULL AND OLD.user_id = auth.uid());
  v_is_admin boolean;
BEGIN
  IF NOT v_is_self THEN
    RETURN NEW;
  END IF;
  v_is_admin := public.has_any_role(
    auth.uid(), OLD.company_id,
    ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]
  );
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Restricted columns: must not be changed by employee self-edit
  IF NEW.pay_rate IS DISTINCT FROM OLD.pay_rate
     OR NEW.pay_type IS DISTINCT FROM OLD.pay_type
     OR NEW.pto_balance_hours IS DISTINCT FROM OLD.pto_balance_hours
     OR NEW.pto_accrual_per_period IS DISTINCT FROM OLD.pto_accrual_per_period
     OR NEW.filing_status IS DISTINCT FROM OLD.filing_status
     OR NEW.extra_withholding IS DISTINCT FROM OLD.extra_withholding
     OR NEW.dependents IS DISTINCT FROM OLD.dependents
     OR NEW.federal_allowances IS DISTINCT FROM OLD.federal_allowances
     OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.direct_deposit_enabled IS DISTINCT FROM OLD.direct_deposit_enabled
     OR NEW.bank_account_last4 IS DISTINCT FROM OLD.bank_account_last4
     OR NEW.bank_routing_last4 IS DISTINCT FROM OLD.bank_routing_last4
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.job_title IS DISTINCT FROM OLD.job_title
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.termination_date IS DISTINCT FROM OLD.termination_date
  THEN
    RAISE EXCEPTION 'Employees may only self-update contact, address, and emergency contact fields. Restricted columns require an HR or payroll admin.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_employees_self_update_guard ON public.employees;
CREATE TRIGGER tg_employees_self_update_guard
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_employees_self_update_guard();
