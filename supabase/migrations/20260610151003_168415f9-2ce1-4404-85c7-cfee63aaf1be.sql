
ALTER VIEW public.employee_ytd_wages SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.tg_block_if_run_locked() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payroll_runs_lock_guard() FROM authenticated;
