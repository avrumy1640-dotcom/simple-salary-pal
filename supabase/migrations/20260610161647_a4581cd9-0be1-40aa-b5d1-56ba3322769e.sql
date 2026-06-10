
DROP TRIGGER IF EXISTS audit_shifts ON public.shifts;
CREATE TRIGGER audit_shifts
  AFTER INSERT OR UPDATE OR DELETE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

DROP TRIGGER IF EXISTS audit_shift_swap_requests ON public.shift_swap_requests;
CREATE TRIGGER audit_shift_swap_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();
