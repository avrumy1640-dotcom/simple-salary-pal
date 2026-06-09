-- Signature workflow history
CREATE TABLE public.hr_document_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.hr_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','viewed','signed','declined','voided')),
  signed_by_name TEXT,
  signed_by_email TEXT,
  signed_by_user_id UUID,
  signature_ip TEXT,
  signature_user_agent TEXT,
  signature_data TEXT,
  note TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_document_signatures TO authenticated;
GRANT ALL ON public.hr_document_signatures TO service_role;
ALTER TABLE public.hr_document_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their signature history"
  ON public.hr_document_signatures FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_hr_doc_sig_document ON public.hr_document_signatures(document_id, event_at DESC);

-- Add signature columns to hr_documents if not present
ALTER TABLE public.hr_documents
  ADD COLUMN IF NOT EXISTS signed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS signed_by_email TEXT,
  ADD COLUMN IF NOT EXISTS signed_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS signature_status TEXT NOT NULL DEFAULT 'unsigned',
  ADD COLUMN IF NOT EXISTS signature_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_ip TEXT;

-- Time clock punches with GPS
CREATE TABLE public.time_clock_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  punch_type TEXT NOT NULL CHECK (punch_type IN ('in','out','break_start','break_end')),
  punched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  address TEXT,
  inside_geofence BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_clock_punches TO authenticated;
GRANT ALL ON public.time_clock_punches TO service_role;
ALTER TABLE public.time_clock_punches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their punches"
  ON public.time_clock_punches FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_punches_user ON public.time_clock_punches(user_id, punched_at DESC);

-- Field visits (contractors / field workers)
CREATE TABLE public.field_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  visit_label TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','en_route','on_site','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_visits TO authenticated;
GRANT ALL ON public.field_visits TO service_role;
ALTER TABLE public.field_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their field visits"
  ON public.field_visits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_field_visits_updated
  BEFORE UPDATE ON public.field_visits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Geocode columns for directory map
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocoded_address TEXT;
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocoded_address TEXT;