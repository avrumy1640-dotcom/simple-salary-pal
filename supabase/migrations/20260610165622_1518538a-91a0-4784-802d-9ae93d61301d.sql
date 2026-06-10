
-- =============================================================
-- benefit_enrollments
-- =============================================================
DROP POLICY IF EXISTS "Members view enrollments" ON public.benefit_enrollments;
CREATE POLICY "Self or HR admins view enrollments"
  ON public.benefit_enrollments FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id(company_id)
    OR public.has_any_role(auth.uid(), company_id,
        ARRAY['owner','admin','hr_admin','benefits_admin','payroll_admin','accountant','auditor']::app_role[])
  );

-- =============================================================
-- hr_document_signatures
-- =============================================================
DROP POLICY IF EXISTS "hrdocsig_member_view" ON public.hr_document_signatures;
CREATE POLICY "Signer or HR admins view signatures"
  ON public.hr_document_signatures FOR SELECT TO authenticated
  USING (
    signed_by_user_id = auth.uid()
    OR public.has_any_role(auth.uid(), company_id,
        ARRAY['owner','admin','hr_admin','auditor']::app_role[])
  );

-- =============================================================
-- Storage: hr-documents bucket — let HR admins read/manage files
-- =============================================================
CREATE OR REPLACE FUNCTION public.can_access_hr_doc_object(_storage_path text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hr_documents d
     WHERE d.storage_path = _storage_path
       AND public.has_any_role(auth.uid(), d.company_id,
            ARRAY['owner','admin','hr_admin','auditor']::app_role[])
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_hr_doc_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_hr_doc_object(text) TO authenticated;

DROP POLICY IF EXISTS "hr-documents admins read" ON storage.objects;
CREATE POLICY "hr-documents admins read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hr-documents' AND public.can_access_hr_doc_object(name));

DROP POLICY IF EXISTS "hr-documents admins delete" ON storage.objects;
CREATE POLICY "hr-documents admins delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hr-documents' AND public.can_access_hr_doc_object(name));

-- =============================================================
-- announcements: drafts/expired hidden from non-admins
-- =============================================================
DROP POLICY IF EXISTS "Members view company announcements" ON public.announcements;
CREATE POLICY "Members view published announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (
      status = 'published'
      OR public.has_any_role(auth.uid(), company_id,
          ARRAY['owner','admin','hr_admin']::app_role[])
    )
  );

-- =============================================================
-- payroll_runs (financial totals)
-- =============================================================
DROP POLICY IF EXISTS "payroll_runs_member_view" ON public.payroll_runs;
CREATE POLICY "Payroll admins view runs"
  ON public.payroll_runs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]));

-- =============================================================
-- payroll_corrections
-- =============================================================
DROP POLICY IF EXISTS "members_view_corrections" ON public.payroll_corrections;
CREATE POLICY "Payroll admins view corrections"
  ON public.payroll_corrections FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]));

-- =============================================================
-- payroll_reversals
-- =============================================================
DROP POLICY IF EXISTS "members_view_reversals" ON public.payroll_reversals;
CREATE POLICY "Payroll admins view reversals"
  ON public.payroll_reversals FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]));

-- =============================================================
-- employer_tax_liabilities
-- =============================================================
DROP POLICY IF EXISTS "members_view_employer_tax" ON public.employer_tax_liabilities;
CREATE POLICY "Payroll admins view employer tax"
  ON public.employer_tax_liabilities FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]));

-- =============================================================
-- performance_goals (self + manager/HR)
-- =============================================================
DROP POLICY IF EXISTS "members view goals" ON public.performance_goals;
CREATE POLICY "Self or manager/HR view goals"
  ON public.performance_goals FOR SELECT TO authenticated
  USING (
    employee_id = public.current_employee_id(company_id)
    OR public.has_any_role(auth.uid(), company_id,
        ARRAY['owner','admin','hr_admin','manager','supervisor']::app_role[])
  );

-- =============================================================
-- Lock down SECURITY DEFINER helpers: revoke public/anon execute
-- (keeps them callable by signed-in users and by RLS internally)
-- =============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;
