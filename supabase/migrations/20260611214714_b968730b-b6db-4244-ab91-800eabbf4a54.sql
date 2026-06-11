
CREATE TABLE public.new_hire_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reported_state text NOT NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'reported',
  confirmation_number text,
  notes text,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, reported_state)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_hire_reports TO authenticated;
GRANT ALL ON public.new_hire_reports TO service_role;

ALTER TABLE public.new_hire_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can view new hire reports"
  ON public.new_hire_reports FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','auditor']::app_role[]));

CREATE POLICY "HR can insert new hire reports"
  ON public.new_hire_reports FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));

CREATE POLICY "HR can update new hire reports"
  ON public.new_hire_reports FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));

CREATE POLICY "HR can delete new hire reports"
  ON public.new_hire_reports FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));

CREATE TRIGGER trg_new_hire_reports_updated_at
  BEFORE UPDATE ON public.new_hire_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_new_hire_reports_company ON public.new_hire_reports(company_id, report_date DESC);
