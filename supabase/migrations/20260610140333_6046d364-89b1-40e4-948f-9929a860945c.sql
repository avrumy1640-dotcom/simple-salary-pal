
-- 1) Tighten SELECT on sensitive HR tables to admin/HR/payroll/manager roles only
DROP POLICY IF EXISTS "members_view_garnishments" ON public.garnishments;
CREATE POLICY "admins_view_garnishments" ON public.garnishments
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role]));

DROP POLICY IF EXISTS "members_view_handbook_ack" ON public.handbook_acknowledgments;
CREATE POLICY "admins_view_handbook_ack" ON public.handbook_acknowledgments
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role]));

DROP POLICY IF EXISTS "members_view_pto_ledger" ON public.pto_ledger;
CREATE POLICY "admins_view_pto_ledger" ON public.pto_ledger
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role]));

DROP POLICY IF EXISTS "members_view_timesheets" ON public.timesheets;
CREATE POLICY "managers_view_timesheets" ON public.timesheets
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role,'manager'::app_role]));

-- 2) Bank connections: revoke column-level access to sensitive Plaid token from client roles.
REVOKE SELECT (plaid_access_token, plaid_item_id) ON public.bank_connections FROM authenticated;
REVOKE SELECT (plaid_access_token, plaid_item_id) ON public.bank_connections FROM anon;

-- Provide a safe view for client use that omits sensitive credentials
CREATE OR REPLACE VIEW public.bank_connections_safe
WITH (security_invoker = true) AS
SELECT
  id, owner_id, company_id, employee_id, contractor_id,
  is_company, provider, institution_name, account_name,
  account_mask, account_type, account_subtype, routing_number_last4,
  status, linked_at, created_at, updated_at
FROM public.bank_connections;

GRANT SELECT ON public.bank_connections_safe TO authenticated;

-- 3) user_roles: explicitly deny client-side INSERT/UPDATE/DELETE.
-- Only service_role (edge functions / SECURITY DEFINER) can modify roles.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

-- Add restrictive policies so even if future grants are added accidentally,
-- writes from non-service roles remain denied.
DROP POLICY IF EXISTS "deny_user_roles_insert" ON public.user_roles;
CREATE POLICY "deny_user_roles_insert" ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_user_roles_update" ON public.user_roles;
CREATE POLICY "deny_user_roles_update" ON public.user_roles
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_user_roles_delete" ON public.user_roles;
CREATE POLICY "deny_user_roles_delete" ON public.user_roles
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);
