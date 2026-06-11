
-- 1. Tighten employees self-update RLS: restrict to authenticated role only.
-- The DB trigger tg_employees_self_update_guard already enforces column-level restrictions
-- (raises exception if employee tries to change pay_rate, pay_type, filing_status, banking, etc.)
-- but the policy itself was applied to {public}. Restrict to authenticated.
DROP POLICY IF EXISTS employees_self_update_limited ON public.employees;
CREATE POLICY employees_self_update_limited
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Notifications: restrict read policy to authenticated role (was public).
DROP POLICY IF EXISTS users_read_own_notifications ON public.notifications;
CREATE POLICY users_read_own_notifications
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
