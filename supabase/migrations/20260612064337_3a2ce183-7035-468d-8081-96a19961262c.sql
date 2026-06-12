REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, uuid, public.app_role[]) FROM anon, PUBLIC;