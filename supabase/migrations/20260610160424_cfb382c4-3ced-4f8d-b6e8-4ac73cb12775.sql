
-- ============ shift status & metadata ============
DO $$ BEGIN
  CREATE TYPE public.shift_status AS ENUM ('draft','published','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS status public.shift_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS work_location_id uuid;

CREATE INDEX IF NOT EXISTS idx_shifts_company_status ON public.shifts(company_id, status, start_at);

-- ============ work_locations ============
CREATE TABLE IF NOT EXISTS public.work_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  geofence_radius_m integer NOT NULL DEFAULT 150 CHECK (geofence_radius_m BETWEEN 25 AND 5000),
  geofence_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_locations_company ON public.work_locations(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_locations TO authenticated;
GRANT ALL ON public.work_locations TO service_role;
ALTER TABLE public.work_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_locations" ON public.work_locations FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "managers_manage_locations" ON public.work_locations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE TRIGGER set_updated_at_work_locations BEFORE UPDATE ON public.work_locations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_work_location_fk FOREIGN KEY (work_location_id) REFERENCES public.work_locations(id) ON DELETE SET NULL;

-- ============ shift_swap_requests ============
DO $$ BEGIN
  CREATE TYPE public.swap_request_status AS ENUM ('pending','approved','denied','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  requested_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  target_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  target_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('drop','swap')),
  reason text,
  status public.swap_request_status NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_swap_company_status ON public.shift_swap_requests(company_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_swap_requests TO authenticated;
GRANT ALL ON public.shift_swap_requests TO service_role;
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_manage_swaps" ON public.shift_swap_requests FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY "employee_view_own_swaps" ON public.shift_swap_requests FOR SELECT TO authenticated
  USING (requested_by_employee_id = public.current_employee_id(company_id)
         OR target_employee_id = public.current_employee_id(company_id));
CREATE POLICY "employee_create_own_swaps" ON public.shift_swap_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by_employee_id = public.current_employee_id(company_id));
CREATE POLICY "employee_cancel_own_swaps" ON public.shift_swap_requests FOR UPDATE TO authenticated
  USING (requested_by_employee_id = public.current_employee_id(company_id) AND status = 'pending')
  WITH CHECK (requested_by_employee_id = public.current_employee_id(company_id));
CREATE TRIGGER set_updated_at_swaps BEFORE UPDATE ON public.shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ punches: link to shift / geofence ============
ALTER TABLE public.time_clock_punches
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_location_id uuid REFERENCES public.work_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS geofence_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geofence_ok boolean;

CREATE INDEX IF NOT EXISTS idx_punches_shift ON public.time_clock_punches(shift_id);

-- ============ haversine helper ============
CREATE OR REPLACE FUNCTION public.haversine_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    sin(radians((lat2 - lat1) / 2)) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) *
    sin(radians((lon2 - lon1) / 2)) ^ 2
  ));
$$;

-- ============ shift overlap prevention ============
CREATE OR REPLACE FUNCTION public.tg_shift_no_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.employee_id IS NULL OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.shifts s
     WHERE s.id <> NEW.id
       AND s.employee_id = NEW.employee_id
       AND s.status <> 'cancelled'
       AND s.start_at < NEW.end_at
       AND s.end_at > NEW.start_at
  ) THEN
    RAISE EXCEPTION 'Shift overlaps an existing shift for this employee'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_shift_no_overlap ON public.shifts;
CREATE TRIGGER tg_shift_no_overlap
  BEFORE INSERT OR UPDATE OF employee_id, start_at, end_at, status ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.tg_shift_no_overlap();

-- ============ punch geofence + shift linkage ============
CREATE OR REPLACE FUNCTION public.tg_punch_geofence_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loc public.work_locations%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_dist double precision;
BEGIN
  -- Link to a published shift the employee is currently inside (within 30 min slack)
  IF NEW.shift_id IS NULL AND NEW.employee_id IS NOT NULL THEN
    SELECT * INTO v_shift FROM public.shifts
     WHERE company_id = NEW.company_id
       AND employee_id = NEW.employee_id
       AND status = 'published'
       AND start_at - INTERVAL '30 minutes' <= NEW.punched_at
       AND end_at   + INTERVAL '30 minutes' >= NEW.punched_at
     ORDER BY abs(EXTRACT(EPOCH FROM (start_at - NEW.punched_at)))
     LIMIT 1;
    IF v_shift.id IS NOT NULL THEN
      NEW.shift_id := v_shift.id;
      IF NEW.work_location_id IS NULL THEN NEW.work_location_id := v_shift.work_location_id; END IF;
    END IF;
  END IF;

  -- Resolve location for geofence check
  IF NEW.work_location_id IS NOT NULL THEN
    SELECT * INTO v_loc FROM public.work_locations WHERE id = NEW.work_location_id;
  END IF;

  IF v_loc.id IS NOT NULL AND v_loc.latitude IS NOT NULL AND v_loc.longitude IS NOT NULL THEN
    NEW.geofence_required := COALESCE(NEW.geofence_required, v_loc.geofence_required);
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
      v_dist := public.haversine_m(NEW.latitude, NEW.longitude, v_loc.latitude, v_loc.longitude);
      NEW.geofence_ok := v_dist <= v_loc.geofence_radius_m;
      NEW.inside_geofence := NEW.geofence_ok;
      IF NEW.geofence_required AND NEW.geofence_ok = false AND NEW.punch_type = 'in' THEN
        RAISE EXCEPTION 'Punch is outside the required geofence (% m from %)', round(v_dist::numeric, 0), v_loc.name
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NEW.geofence_required AND NEW.punch_type = 'in' THEN
      RAISE EXCEPTION 'Location is required to punch in for %', v_loc.name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_punch_geofence_check ON public.time_clock_punches;
CREATE TRIGGER tg_punch_geofence_check
  BEFORE INSERT ON public.time_clock_punches
  FOR EACH ROW EXECUTE FUNCTION public.tg_punch_geofence_check();

-- ============ publish RPC ============
CREATE OR REPLACE FUNCTION public.publish_shifts(_company_id uuid, _start timestamptz, _end timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.has_any_role(auth.uid(), _company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.shifts
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE company_id = _company_id
     AND status = 'draft'
     AND employee_id IS NOT NULL
     AND start_at >= _start AND start_at < _end;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
