DROP POLICY IF EXISTS bank_connections_self_view_safe ON public.bank_connections;

CREATE OR REPLACE VIEW public.bank_connections_safe
WITH (security_invoker = on) AS
SELECT
  id,
  owner_id,
  company_id,
  employee_id,
  contractor_id,
  is_company,
  provider,
  institution_name,
  account_name,
  account_mask,
  account_type,
  account_subtype,
  routing_number_last4,
  status,
  linked_at,
  created_at,
  updated_at
FROM public.bank_connections;

GRANT SELECT ON public.bank_connections_safe TO authenticated;
GRANT ALL ON public.bank_connections TO service_role;