
-- Restrict recruiting reads to recruiting/HR roles
DROP POLICY IF EXISTS "members view candidate notes" ON public.candidate_notes;
CREATE POLICY "recruiters view candidate notes" ON public.candidate_notes
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[]));

DROP POLICY IF EXISTS "members view scorecards" ON public.interview_scorecards;
CREATE POLICY "recruiters view scorecards" ON public.interview_scorecards
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter']::app_role[])
  );

DROP POLICY IF EXISTS "members view interviews" ON public.interviews;
CREATE POLICY "recruiters view interviews" ON public.interviews
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','recruiter','manager']::app_role[]));

-- Employee self-view policies
CREATE POLICY "employees_view_own_compliance" ON public.compliance_records
  FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE POLICY "employees_view_own_handbook_ack" ON public.handbook_acknowledgments
  FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE POLICY "employees_view_own_pto_ledger" ON public.pto_ledger
  FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE POLICY "employees_view_own_timesheets" ON public.timesheets
  FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));
