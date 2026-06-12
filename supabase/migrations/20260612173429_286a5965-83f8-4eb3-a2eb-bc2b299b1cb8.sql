
CREATE TYPE public.tax_year_run_kind AS ENUM ('w2','1099nec');
CREATE TYPE public.tax_year_run_status AS ENUM ('draft','employee_preview','filed','corrected');

CREATE TABLE public.tax_year_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tax_year integer NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
  kind tax_year_run_kind NOT NULL,
  status tax_year_run_status NOT NULL DEFAULT 'draft',
  generated_at timestamptz,
  filed_at timestamptz,
  filing_ref text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tax_year, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_year_runs TO authenticated;
GRANT ALL ON public.tax_year_runs TO service_role;
ALTER TABLE public.tax_year_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage tax year runs" ON public.tax_year_runs FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]));
CREATE TRIGGER trg_tax_year_runs_updated BEFORE UPDATE ON public.tax_year_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.tax_year_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tax_year_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tax_year integer NOT NULL,
  kind tax_year_run_kind NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_tin_last4 text,
  recipient_address jsonb,
  box_1_wages numeric(14,2) NOT NULL DEFAULT 0,
  box_2_fed_tax numeric(14,2) NOT NULL DEFAULT 0,
  box_3_ss_wages numeric(14,2) NOT NULL DEFAULT 0,
  box_4_ss_tax numeric(14,2) NOT NULL DEFAULT 0,
  box_5_medicare_wages numeric(14,2) NOT NULL DEFAULT 0,
  box_6_medicare_tax numeric(14,2) NOT NULL DEFAULT 0,
  box_10_dep_care numeric(14,2) NOT NULL DEFAULT 0,
  box_11_nonqual numeric(14,2) NOT NULL DEFAULT 0,
  box_12_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  box_13_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  box_14_other jsonb NOT NULL DEFAULT '[]'::jsonb,
  state_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  local_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  nec_box_1_nonemployee_comp numeric(14,2) NOT NULL DEFAULT 0,
  nec_box_4_fed_tax numeric(14,2) NOT NULL DEFAULT 0,
  pdf_storage_path text,
  recipient_consent_electronic boolean NOT NULL DEFAULT false,
  recipient_consent_at timestamptz,
  superseded_by uuid REFERENCES public.tax_year_forms(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'w2'      AND employee_id IS NOT NULL AND contractor_id IS NULL) OR
    (kind = '1099nec' AND contractor_id IS NOT NULL AND employee_id IS NULL)
  )
);
CREATE INDEX ix_tax_year_forms_run ON public.tax_year_forms(run_id);
CREATE INDEX ix_tax_year_forms_company_year ON public.tax_year_forms(company_id, tax_year, kind);
CREATE INDEX ix_tax_year_forms_employee ON public.tax_year_forms(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX ix_tax_year_forms_contractor ON public.tax_year_forms(contractor_id) WHERE contractor_id IS NOT NULL;
CREATE UNIQUE INDEX ux_tax_year_forms_active_recipient
  ON public.tax_year_forms(company_id, tax_year, kind, COALESCE(employee_id, contractor_id))
  WHERE superseded_by IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_year_forms TO authenticated;
GRANT ALL ON public.tax_year_forms TO service_role;
ALTER TABLE public.tax_year_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tax year forms" ON public.tax_year_forms FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]));
CREATE POLICY "Employee reads own W-2" ON public.tax_year_forms FOR SELECT TO authenticated
  USING (
    kind = 'w2' AND employee_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()
    )
  );
CREATE POLICY "Contractor reads own 1099" ON public.tax_year_forms FOR SELECT TO authenticated
  USING (
    kind = '1099nec' AND contractor_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.contractors c
       WHERE c.id = contractor_id
         AND c.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
CREATE TRIGGER trg_tax_year_forms_updated BEFORE UPDATE ON public.tax_year_forms
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.tax_year_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_form_id uuid NOT NULL REFERENCES public.tax_year_forms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('W-2c','1099-NEC CORRECTED')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  reissued_form_id uuid REFERENCES public.tax_year_forms(id) ON DELETE SET NULL,
  reissued_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_year_corrections TO authenticated;
GRANT ALL ON public.tax_year_corrections TO service_role;
ALTER TABLE public.tax_year_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage tax year corrections" ON public.tax_year_corrections FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant']::app_role[]));
