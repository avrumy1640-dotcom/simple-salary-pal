-- Drop 5 unused tables (zero rows + zero app references)
DROP TABLE IF EXISTS public.candidate_notes CASCADE;
DROP TABLE IF EXISTS public.interview_scorecards CASCADE;
DROP TABLE IF EXISTS public.employee_assets CASCADE;
DROP TABLE IF EXISTS public.compliance_records CASCADE;
DROP TABLE IF EXISTS public.bank_connections CASCADE;

-- Lock down legacy SECURITY DEFINER helpers that are not RLS-referenced and not called by authenticated users.
-- notify_managers is invoked from triggers and from server fns via supabaseAdmin (service_role).
-- haversine_m is only used inside a trigger function.
REVOKE EXECUTE ON FUNCTION public.notify_managers(uuid, notification_kind, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.haversine_m(double precision, double precision, double precision, double precision) FROM PUBLIC, anon, authenticated;

-- Revoke anon EXECUTE on RPC-style functions that self-authorize via has_any_role.
-- They remain callable by authenticated (where they perform their own role check).
REVOKE EXECUTE ON FUNCTION public.publish_shifts(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_onboarding_template(uuid, uuid, uuid, uuid, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_gl_for_run(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reconcile_employer_tax(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_compliance_alerts(uuid) FROM anon, PUBLIC;

-- Revoke anon EXECUTE on role/auth helpers (they require auth.uid()).
-- Authenticated EXECUTE is preserved because these are used inside RLS policies.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, uuid, app_role[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_employee_id(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.employee_can_self_enroll(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_hr_doc_object(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_shares_company_with_path_user(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_tax_version(text, text, date) FROM anon, PUBLIC;