
-- Helper: can the current admin access this storage path for a given bucket via shared company?
CREATE OR REPLACE FUNCTION public.admin_shares_company_with_path_user(_path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.user_roles ur
      ON ur.company_id = e.company_id
     AND ur.user_id = auth.uid()
     AND ur.role = ANY (ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[])
    WHERE e.user_id::text = (storage.foldername(_path))[1]
  );
$$;

-- 1) Expense receipts: scope admin SELECT to same company
DROP POLICY IF EXISTS "Employees read receipts" ON storage.objects;
CREATE POLICY "Employees read receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.admin_shares_company_with_path_user(name)
  )
);

-- 2) HR documents: scope admin INSERT/UPDATE to same company (via path user_id → employee.company_id)
DROP POLICY IF EXISTS "hr docs insert admins only" ON storage.objects;
CREATE POLICY "hr docs insert admins only"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hr-documents'
  AND public.admin_shares_company_with_path_user(name)
);

DROP POLICY IF EXISTS "hr docs update admins only" ON storage.objects;
CREATE POLICY "hr docs update admins only"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'hr-documents'
  AND public.admin_shares_company_with_path_user(name)
);

-- 3) HR documents: remove employee self-delete (preserve admin delete via existing "hr-documents admins delete")
DROP POLICY IF EXISTS "hr docs delete own" ON storage.objects;

-- 4) Employees self-update: restrict at policy level to safe contact/address columns only.
-- Defense-in-depth on top of tg_employees_self_update_guard trigger.
DROP POLICY IF EXISTS employees_self_update_limited ON public.employees;
CREATE POLICY employees_self_update_limited
ON public.employees FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  -- Privileged columns must not change in a self-update.
  -- Admins use the admin policy; this WITH CHECK only constrains the self path.
  AND pay_rate IS NOT DISTINCT FROM (SELECT pay_rate FROM public.employees WHERE id = employees.id)
  AND pay_type IS NOT DISTINCT FROM (SELECT pay_type FROM public.employees WHERE id = employees.id)
  AND pto_balance_hours IS NOT DISTINCT FROM (SELECT pto_balance_hours FROM public.employees WHERE id = employees.id)
  AND pto_accrual_per_period IS NOT DISTINCT FROM (SELECT pto_accrual_per_period FROM public.employees WHERE id = employees.id)
  AND filing_status IS NOT DISTINCT FROM (SELECT filing_status FROM public.employees WHERE id = employees.id)
  AND extra_withholding IS NOT DISTINCT FROM (SELECT extra_withholding FROM public.employees WHERE id = employees.id)
  AND dependents IS NOT DISTINCT FROM (SELECT dependents FROM public.employees WHERE id = employees.id)
  AND federal_allowances IS NOT DISTINCT FROM (SELECT federal_allowances FROM public.employees WHERE id = employees.id)
  AND lifecycle_status IS NOT DISTINCT FROM (SELECT lifecycle_status FROM public.employees WHERE id = employees.id)
  AND status IS NOT DISTINCT FROM (SELECT status FROM public.employees WHERE id = employees.id)
  AND direct_deposit_enabled IS NOT DISTINCT FROM (SELECT direct_deposit_enabled FROM public.employees WHERE id = employees.id)
  AND bank_account_last4 IS NOT DISTINCT FROM (SELECT bank_account_last4 FROM public.employees WHERE id = employees.id)
  AND bank_routing_last4 IS NOT DISTINCT FROM (SELECT bank_routing_last4 FROM public.employees WHERE id = employees.id)
  AND company_id IS NOT DISTINCT FROM (SELECT company_id FROM public.employees WHERE id = employees.id)
  AND manager_id IS NOT DISTINCT FROM (SELECT manager_id FROM public.employees WHERE id = employees.id)
  AND job_title IS NOT DISTINCT FROM (SELECT job_title FROM public.employees WHERE id = employees.id)
  AND department IS NOT DISTINCT FROM (SELECT department FROM public.employees WHERE id = employees.id)
  AND employment_type IS NOT DISTINCT FROM (SELECT employment_type FROM public.employees WHERE id = employees.id)
  AND start_date IS NOT DISTINCT FROM (SELECT start_date FROM public.employees WHERE id = employees.id)
  AND termination_date IS NOT DISTINCT FROM (SELECT termination_date FROM public.employees WHERE id = employees.id)
);
