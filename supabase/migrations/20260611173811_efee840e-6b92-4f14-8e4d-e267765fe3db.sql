
-- Realtime for live attendance
ALTER TABLE public.time_clock_punches REPLICA IDENTITY FULL;
ALTER TABLE public.employee_live_locations REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.time_clock_punches; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_live_locations; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Fix broken self-update policy (trigger tg_employees_self_update_guard enforces field immutability)
DROP POLICY IF EXISTS employees_self_update_limited ON public.employees;
CREATE POLICY employees_self_update_limited ON public.employees
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
