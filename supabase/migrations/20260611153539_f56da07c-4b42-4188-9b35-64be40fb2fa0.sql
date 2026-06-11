
CREATE TABLE public.employee_live_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  is_clocked_in boolean NOT NULL DEFAULT true,
  last_punch_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_live_locations TO authenticated;
GRANT ALL ON public.employee_live_locations TO service_role;

ALTER TABLE public.employee_live_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_upsert_own_live_location"
  ON public.employee_live_locations FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.current_employee_id(company_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "employee_update_own_live_location"
  ON public.employee_live_locations FOR UPDATE TO authenticated
  USING (employee_id = public.current_employee_id(company_id))
  WITH CHECK (employee_id = public.current_employee_id(company_id));

CREATE POLICY "employee_view_own_live_location"
  ON public.employee_live_locations FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE POLICY "managers_view_company_live_locations"
  ON public.employee_live_locations FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin','hr_admin','manager','supervisor']::app_role[]));

CREATE POLICY "managers_manage_company_live_locations"
  ON public.employee_live_locations FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id,
    ARRAY['owner','admin','hr_admin']::app_role[]));

CREATE INDEX idx_live_loc_company_clocked ON public.employee_live_locations(company_id, is_clocked_in, updated_at DESC);
