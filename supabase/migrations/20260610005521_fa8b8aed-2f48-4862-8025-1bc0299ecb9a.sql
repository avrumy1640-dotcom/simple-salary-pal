
-- ============================================================
-- PHASE 1: FOUNDATION (multi-company, RBAC, audit, workflow)
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('owner','admin','payroll_admin','hr_admin','manager','employee');
CREATE TYPE public.payroll_status AS ENUM ('draft','review','approved','locked','processed','reversed','corrected');
CREATE TYPE public.pay_frequency AS ENUM ('weekly','biweekly','semimonthly','monthly');
CREATE TYPE public.timesheet_status AS ENUM ('open','submitted','approved','rejected','locked');
CREATE TYPE public.audit_action AS ENUM ('create','update','delete','approve','lock','process','reverse','correct','login','export');
CREATE TYPE public.compliance_doc_type AS ENUM ('i9','w4','state_w4','eeo','direct_deposit','handbook','other');
CREATE TYPE public.garnishment_type AS ENUM ('child_support','tax_levy','student_loan','creditor','bankruptcy','other');

-- ---------- COMPANIES ----------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  dba text, ein text,
  address_line1 text, address_line2 text, city text, state text, postal_code text,
  country text DEFAULT 'US', phone text, email text,
  default_pay_frequency public.pay_frequency DEFAULT 'biweekly',
  overtime_threshold_hours numeric(6,2) DEFAULT 40,
  double_overtime_threshold_hours numeric(6,2) DEFAULT 60,
  holiday_pay_multiplier numeric(4,2) DEFAULT 1.5,
  state_unemployment_rate numeric(6,4) DEFAULT 0.027,
  state_unemployment_wage_base numeric(12,2) DEFAULT 7000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.company_users TO authenticated;
GRANT ALL ON public.company_users TO service_role;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _company_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND company_id=_company_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _company_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND company_id=_company_id AND role=ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_users WHERE user_id=_user_id AND company_id=_company_id);
$$;

CREATE POLICY "members_view_companies" ON public.companies FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), id) OR owner_id = auth.uid());
CREATE POLICY "owners_manage_companies" ON public.companies FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), id, 'owner'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), id, 'owner'));
CREATE POLICY "users_create_own_company" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "users_view_own_memberships" ON public.company_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "admins_manage_memberships" ON public.company_users FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "users_view_own_roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin']::public.app_role[]));

-- ---------- AUDIT EVENTS ----------
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  action public.audit_action NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before jsonb, after jsonb,
  ip text, user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_company_time ON public.audit_events(company_id, occurred_at DESC);
CREATE INDEX idx_audit_entity ON public.audit_events(entity_type, entity_id);
GRANT SELECT,INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_view_audit" ON public.audit_events FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','hr_admin']::public.app_role[]));
CREATE POLICY "members_insert_audit" ON public.audit_events FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND actor_id = auth.uid());

-- ---------- BACKFILL: create one company per existing owner ----------
INSERT INTO public.companies (owner_id, legal_name)
SELECT DISTINCT u.owner_id, COALESCE((SELECT company_name FROM public.profiles WHERE id = u.owner_id), 'My Company')
FROM (
  SELECT owner_id FROM public.employees WHERE owner_id IS NOT NULL
  UNION SELECT owner_id FROM public.payroll_runs WHERE owner_id IS NOT NULL
  UNION SELECT owner_id FROM public.company_settings WHERE owner_id IS NOT NULL
  UNION SELECT id FROM public.profiles
) u
WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.owner_id = u.owner_id);

INSERT INTO public.company_users (company_id, user_id, is_default, accepted_at)
SELECT c.id, c.owner_id, true, now() FROM public.companies c ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, company_id, role)
SELECT c.owner_id, c.id, 'owner'::public.app_role FROM public.companies c ON CONFLICT DO NOTHING;

-- ---------- ADD company_id TO EXISTING TABLES ----------
-- Tables that have owner_id: backfill directly
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees','payroll_runs','payroll_items','pto_entries','time_entries',
    'deductions','hr_documents','hr_forms','onboarding_tasks',
    'contractors','contractor_payments','bank_connections','company_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE', t);
    EXECUTE format($f$UPDATE public.%I tbl SET company_id = (SELECT id FROM public.companies c WHERE c.owner_id = tbl.owner_id LIMIT 1) WHERE company_id IS NULL AND owner_id IS NOT NULL$f$, t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company ON public.%I(company_id)', t, t);
  END LOOP;
END $$;

-- Tables WITHOUT owner_id: derive from employee
ALTER TABLE public.time_clock_punches ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
UPDATE public.time_clock_punches t SET company_id = e.company_id FROM public.employees e WHERE t.employee_id = e.id AND t.company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_time_clock_punches_company ON public.time_clock_punches(company_id);

ALTER TABLE public.field_visits ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
UPDATE public.field_visits f SET company_id = e.company_id FROM public.employees e WHERE f.employee_id = e.id AND f.company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_field_visits_company ON public.field_visits(company_id);

ALTER TABLE public.hr_document_signatures ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
UPDATE public.hr_document_signatures s SET company_id = d.company_id FROM public.hr_documents d WHERE s.document_id = d.id AND s.company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_document_signatures_company ON public.hr_document_signatures(company_id);

-- ---------- PAYROLL RUN LIFECYCLE COLUMNS ----------
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id);
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS correction_of uuid REFERENCES public.payroll_runs(id);

-- ---------- PAY SCHEDULES & PERIODS ----------
CREATE TABLE public.pay_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  frequency public.pay_frequency NOT NULL,
  anchor_date date NOT NULL,
  weekend_rule text DEFAULT 'previous_business_day',
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pay_schedules TO authenticated;
GRANT ALL ON public.pay_schedules TO service_role;
ALTER TABLE public.pay_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_schedules" ON public.pay_schedules FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "payroll_admins_manage_schedules" ON public.pay_schedules FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));

CREATE TABLE public.pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.pay_schedules(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_start, period_end)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pay_periods TO authenticated;
GRANT ALL ON public.pay_periods TO service_role;
ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_periods" ON public.pay_periods FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "payroll_admins_manage_periods" ON public.pay_periods FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));

-- ---------- TAX RECORDS ----------
CREATE TABLE public.tax_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  period_start date NOT NULL, period_end date NOT NULL,
  jurisdiction text NOT NULL, tax_type text NOT NULL,
  taxable_wages numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  liability_date date,
  deposit_status text DEFAULT 'pending',
  deposited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tax_records TO authenticated;
GRANT ALL ON public.tax_records TO service_role;
ALTER TABLE public.tax_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_tax_records" ON public.tax_records FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "payroll_admins_manage_tax" ON public.tax_records FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));

CREATE TABLE public.employer_tax_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  futa numeric(14,2) NOT NULL DEFAULT 0,
  suta numeric(14,2) NOT NULL DEFAULT 0,
  employer_ss numeric(14,2) NOT NULL DEFAULT 0,
  employer_medicare numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) GENERATED ALWAYS AS (futa + suta + employer_ss + employer_medicare) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.employer_tax_liabilities TO authenticated;
GRANT ALL ON public.employer_tax_liabilities TO service_role;
ALTER TABLE public.employer_tax_liabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_employer_tax" ON public.employer_tax_liabilities FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "payroll_admins_manage_employer_tax" ON public.employer_tax_liabilities FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));

-- ---------- GARNISHMENTS ----------
CREATE TABLE public.garnishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  garnishment_type public.garnishment_type NOT NULL,
  priority int NOT NULL DEFAULT 100,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_type text NOT NULL DEFAULT 'fixed',
  cap_percentage numeric(5,2) DEFAULT 25,
  remaining_balance numeric(14,2),
  court_order_ref text, payee_name text, payee_address text,
  is_active boolean NOT NULL DEFAULT true,
  start_date date, end_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.garnishments TO authenticated;
GRANT ALL ON public.garnishments TO service_role;
ALTER TABLE public.garnishments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_garnishments" ON public.garnishments FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "payroll_admins_manage_garnishments" ON public.garnishments FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));

-- ---------- PTO LEDGER & ACCRUAL ----------
CREATE TABLE public.pto_accrual_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  hours_per_period numeric(8,4) NOT NULL DEFAULT 3.0769,
  frequency public.pay_frequency NOT NULL DEFAULT 'biweekly',
  max_balance_hours numeric(8,2) DEFAULT 200,
  carryover_hours numeric(8,2) DEFAULT 80,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pto_accrual_policies TO authenticated;
GRANT ALL ON public.pto_accrual_policies TO service_role;
ALTER TABLE public.pto_accrual_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_pto_policies" ON public.pto_accrual_policies FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "hr_admins_manage_pto_policies" ON public.pto_accrual_policies FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::public.app_role[]));

CREATE TABLE public.pto_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  delta_hours numeric(8,2) NOT NULL,
  reason text NOT NULL,
  ref_type text, ref_id uuid,
  balance_after numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pto_ledger_emp_time ON public.pto_ledger(employee_id, created_at DESC);
GRANT SELECT,INSERT ON public.pto_ledger TO authenticated;
GRANT ALL ON public.pto_ledger TO service_role;
ALTER TABLE public.pto_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_pto_ledger" ON public.pto_ledger FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "hr_admins_write_pto_ledger" ON public.pto_ledger FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::public.app_role[]));

-- ---------- PAYROLL CORRECTIONS & REVERSALS ----------
CREATE TABLE public.payroll_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  original_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  correcting_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.payroll_corrections TO authenticated;
GRANT ALL ON public.payroll_corrections TO service_role;
ALTER TABLE public.payroll_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_corrections" ON public.payroll_corrections FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "payroll_admins_manage_corrections" ON public.payroll_corrections FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));

CREATE TABLE public.payroll_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  reason text NOT NULL,
  reversed_by uuid REFERENCES auth.users(id),
  reversed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.payroll_reversals TO authenticated;
GRANT ALL ON public.payroll_reversals TO service_role;
ALTER TABLE public.payroll_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_reversals" ON public.payroll_reversals FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "payroll_admins_manage_reversals" ON public.payroll_reversals FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));

-- ---------- TIMESHEETS & SHIFTS ----------
CREATE TABLE public.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_start date NOT NULL, period_end date NOT NULL,
  status public.timesheet_status NOT NULL DEFAULT 'open',
  total_regular_hours numeric(8,2) DEFAULT 0,
  total_overtime_hours numeric(8,2) DEFAULT 0,
  total_double_ot_hours numeric(8,2) DEFAULT 0,
  total_holiday_hours numeric(8,2) DEFAULT 0,
  submitted_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_start, period_end)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.timesheets TO authenticated;
GRANT ALL ON public.timesheets TO service_role;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_timesheets" ON public.timesheets FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "managers_manage_timesheets" ON public.timesheets FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','manager']::public.app_role[]));

CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
  role text, location text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shifts_emp_time ON public.shifts(employee_id, start_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_shifts" ON public.shifts FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "managers_manage_shifts" ON public.shifts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::public.app_role[]));

-- ---------- HR RECORDS ----------
CREATE TABLE public.handbook_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.hr_documents(id) ON DELETE SET NULL,
  document_title text NOT NULL, version text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  ip text, user_agent text
);
GRANT SELECT,INSERT ON public.handbook_acknowledgments TO authenticated;
GRANT ALL ON public.handbook_acknowledgments TO service_role;
ALTER TABLE public.handbook_acknowledgments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_view_handbook_ack" ON public.handbook_acknowledgments FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "members_insert_handbook_ack" ON public.handbook_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE TABLE public.performance_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  category text, note text NOT NULL,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.performance_notes TO authenticated;
GRANT ALL ON public.performance_notes TO service_role;
ALTER TABLE public.performance_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_view_performance" ON public.performance_notes FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::public.app_role[]));
CREATE POLICY "hr_manage_performance" ON public.performance_notes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::public.app_role[]));

CREATE TABLE public.compliance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type public.compliance_doc_type NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  file_path text, completed_at timestamptz, expires_at timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.compliance_records TO authenticated;
GRANT ALL ON public.compliance_records TO service_role;
ALTER TABLE public.compliance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_view_compliance" ON public.compliance_records FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::public.app_role[]));
CREATE POLICY "hr_manage_compliance" ON public.compliance_records FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::public.app_role[]));

-- ---------- PROVIDER INTEGRATIONS ----------
CREATE TABLE public.provider_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.provider_integrations TO authenticated;
GRANT ALL ON public.provider_integrations TO service_role;
ALTER TABLE public.provider_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_view_providers" ON public.provider_integrations FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));
CREATE POLICY "admins_manage_providers" ON public.provider_integrations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::public.app_role[]));

-- ---------- TIMESTAMP TRIGGERS ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','pay_schedules','pay_periods','garnishments',
    'timesheets','shifts','compliance_records','provider_integrations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', t);
  END LOOP;
END $$;

-- ---------- UPDATED handle_new_user ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_company_id uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, company_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'company_name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.companies (owner_id, legal_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Company'))
  RETURNING id INTO new_company_id;

  INSERT INTO public.company_users (company_id, user_id, is_default, accepted_at)
  VALUES (new_company_id, NEW.id, true, now());

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, new_company_id, 'owner');

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
