
-- compliance_alerts: remove broad member SELECT
DROP POLICY IF EXISTS "Members view compliance alerts" ON public.compliance_alerts;

-- performance_goals: replace broad member SELECT with self + manager/HR
DROP POLICY IF EXISTS "members view goals" ON public.performance_goals;
CREATE POLICY "employees view own goals" ON public.performance_goals
  FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id(company_id)
    OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[])
  );

-- payroll_corrections / payroll_reversals: remove broad member SELECT
DROP POLICY IF EXISTS "members_view_corrections" ON public.payroll_corrections;
DROP POLICY IF EXISTS "members_view_reversals" ON public.payroll_reversals;

-- payroll_runs: remove broad member SELECT
DROP POLICY IF EXISTS "payroll_runs_member_view" ON public.payroll_runs;
