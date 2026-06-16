
REVOKE EXECUTE ON FUNCTION public.rollup_punches_to_entry(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_punches_rollup() FROM PUBLIC, anon, authenticated;
