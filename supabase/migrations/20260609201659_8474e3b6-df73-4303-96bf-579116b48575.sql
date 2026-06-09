REVOKE SELECT (plaid_access_token) ON public.bank_connections FROM authenticated;
REVOKE SELECT (plaid_access_token) ON public.bank_connections FROM anon;