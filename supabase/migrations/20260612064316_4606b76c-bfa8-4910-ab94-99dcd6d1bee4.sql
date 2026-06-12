GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, uuid, public.app_role[]) TO authenticated, anon;