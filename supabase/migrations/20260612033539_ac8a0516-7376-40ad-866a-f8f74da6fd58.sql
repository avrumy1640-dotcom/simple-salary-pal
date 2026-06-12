
REVOKE EXECUTE ON FUNCTION public.guard_employee_self_update() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_audit_row() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_benefit_enrollment_sync_deduction() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_employees_self_update_guard() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_hr_doc_sig_validate() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_payroll_runs_post_gl() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_pod_notify() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_propagate_department_rename() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_punch_geofence_check() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_shift_no_overlap() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_shift_publish_notify() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_swap_notify() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_sync_employee_department_text() FROM anon, authenticated, public;
