
CREATE TYPE public.benefit_plan_type AS ENUM ('medical','dental','vision','life','disability','retirement_401k','hsa','fsa','commuter','wellness','other');
CREATE TYPE public.benefit_coverage_tier AS ENUM ('employee','employee_spouse','employee_children','family');
CREATE TYPE public.benefit_enrollment_status AS ENUM ('pending','active','waived','terminated');

CREATE TABLE public.benefit_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  plan_type public.benefit_plan_type NOT NULL,
  carrier text,
  description text,
  monthly_premium_employee numeric(12,2) NOT NULL DEFAULT 0,
  monthly_premium_employee_spouse numeric(12,2) NOT NULL DEFAULT 0,
  monthly_premium_employee_children numeric(12,2) NOT NULL DEFAULT 0,
  monthly_premium_family numeric(12,2) NOT NULL DEFAULT 0,
  employer_contribution_pct numeric(5,2) NOT NULL DEFAULT 0,
  employer_contribution_flat numeric(12,2) NOT NULL DEFAULT 0,
  deductible numeric(12,2),
  out_of_pocket_max numeric(12,2),
  network text,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benefit_plans TO authenticated;
GRANT ALL ON public.benefit_plans TO service_role;
ALTER TABLE public.benefit_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view benefit plans" ON public.benefit_plans FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "HR/Benefits admins manage plans" ON public.benefit_plans FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','benefits_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','benefits_admin']::app_role[]));

CREATE TRIGGER trg_benefit_plans_updated_at BEFORE UPDATE ON public.benefit_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.benefit_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.benefit_plans(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  coverage_tier public.benefit_coverage_tier NOT NULL DEFAULT 'employee',
  status public.benefit_enrollment_status NOT NULL DEFAULT 'pending',
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  employee_monthly_cost numeric(12,2) NOT NULL DEFAULT 0,
  employer_monthly_cost numeric(12,2) NOT NULL DEFAULT 0,
  dependent_count integer NOT NULL DEFAULT 0,
  beneficiary_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, plan_id, effective_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benefit_enrollments TO authenticated;
GRANT ALL ON public.benefit_enrollments TO service_role;
ALTER TABLE public.benefit_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view enrollments" ON public.benefit_enrollments FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "HR/Benefits manage enrollments" ON public.benefit_enrollments FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','benefits_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','benefits_admin']::app_role[]));

CREATE TRIGGER trg_benefit_enrollments_updated_at BEFORE UPDATE ON public.benefit_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.open_enrollment_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  coverage_effective_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_enrollment_windows TO authenticated;
GRANT ALL ON public.open_enrollment_windows TO service_role;
ALTER TABLE public.open_enrollment_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view enrollment windows" ON public.open_enrollment_windows FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "HR/Benefits manage enrollment windows" ON public.open_enrollment_windows FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','benefits_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','benefits_admin']::app_role[]));

CREATE TRIGGER trg_open_enrollment_windows_updated_at BEFORE UPDATE ON public.open_enrollment_windows
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_benefit_plans_company ON public.benefit_plans(company_id, is_active);
CREATE INDEX idx_benefit_enrollments_employee ON public.benefit_enrollments(employee_id, status);
CREATE INDEX idx_benefit_enrollments_company ON public.benefit_enrollments(company_id, status);
