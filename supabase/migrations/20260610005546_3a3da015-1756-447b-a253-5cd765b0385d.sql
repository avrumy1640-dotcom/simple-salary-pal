
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, uuid, public.app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, uuid, public.app_role[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO service_role;
