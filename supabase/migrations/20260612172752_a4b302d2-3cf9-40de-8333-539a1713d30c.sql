
-- ============================================
-- Phase B — Multi-state withholding
-- ============================================

-- 1) Per-employee tax profile (one row per jurisdiction)
CREATE TABLE public.employee_tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  jurisdiction_id uuid NOT NULL REFERENCES public.tax_jurisdictions(id) ON DELETE RESTRICT,
  is_resident boolean NOT NULL DEFAULT false,
  is_work_location boolean NOT NULL DEFAULT false,
  filing_status text NOT NULL DEFAULT 'single'
    CHECK (filing_status IN ('single','married','married_separate','head_of_household')),
  allowances integer NOT NULL DEFAULT 0,
  dependents_under17 integer NOT NULL DEFAULT 0,
  dependents_other integer NOT NULL DEFAULT 0,
  dependents_credit numeric(12,2) NOT NULL DEFAULT 0,    -- precomputed annual credit if used
  extra_withholding numeric(12,2) NOT NULL DEFAULT 0,    -- W-4 Step 4(c) equivalent, per period
  exempt boolean NOT NULL DEFAULT false,
  exempt_reason text,
  effective_start date NOT NULL DEFAULT CURRENT_DATE,
  effective_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_etp_employee ON public.employee_tax_profiles(employee_id, effective_start DESC);
CREATE INDEX idx_etp_company ON public.employee_tax_profiles(company_id);
CREATE INDEX idx_etp_jurisdiction ON public.employee_tax_profiles(jurisdiction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_tax_profiles TO authenticated;
GRANT ALL ON public.employee_tax_profiles TO service_role;
ALTER TABLE public.employee_tax_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etp_self_read" ON public.employee_tax_profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY "etp_admin_read" ON public.employee_tax_profiles FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','auditor']::app_role[]));
CREATE POLICY "etp_admin_write" ON public.employee_tax_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));
CREATE POLICY "etp_admin_update" ON public.employee_tax_profiles FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));
CREATE POLICY "etp_admin_delete" ON public.employee_tax_profiles FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));

CREATE TRIGGER trg_etp_updated BEFORE UPDATE ON public.employee_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_etp_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();

-- 2) Reciprocity agreements
CREATE TABLE public.state_reciprocity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_state text NOT NULL,                       -- jurisdiction code, e.g. 'US-PA'
  work_state text NOT NULL,
  kind text NOT NULL DEFAULT 'full' CHECK (kind IN ('full','partial')),
  requires_certificate boolean NOT NULL DEFAULT true,
  certificate_form text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (home_state, work_state)
);
GRANT SELECT ON public.state_reciprocity TO authenticated;
GRANT ALL ON public.state_reciprocity TO service_role;
ALTER TABLE public.state_reciprocity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "state_reciprocity_read" ON public.state_reciprocity FOR SELECT TO authenticated USING (true);

-- 3) Non-resident de-minimis rules
CREATE TABLE public.state_nonresident_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL UNIQUE,
  threshold_days integer,         -- e.g. NY 14
  threshold_wages numeric(14,2),  -- e.g. AZ $1
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.state_nonresident_rules TO authenticated;
GRANT ALL ON public.state_nonresident_rules TO service_role;
ALTER TABLE public.state_nonresident_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "state_nonresident_rules_read" ON public.state_nonresident_rules FOR SELECT TO authenticated USING (true);

-- 4) State SUI / SDI / FLI rates
CREATE TABLE public.state_employer_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,             -- jurisdiction code
  tax_code text NOT NULL,               -- 'sui','sdi','fli','fmli'
  effective_year integer NOT NULL,
  rate numeric(8,6) NOT NULL,
  wage_base_cap numeric(14,2),
  is_employer boolean NOT NULL DEFAULT true,
  is_employee boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_code, tax_code, effective_year, is_employer, is_employee)
);
GRANT SELECT ON public.state_employer_taxes TO authenticated;
GRANT ALL ON public.state_employer_taxes TO service_role;
ALTER TABLE public.state_employer_taxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "state_employer_taxes_read" ON public.state_employer_taxes FOR SELECT TO authenticated USING (true);

-- 5) Per-payroll-item work state allocations
CREATE TABLE public.work_state_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_item_id uuid NOT NULL REFERENCES public.payroll_items(id) ON DELETE CASCADE,
  jurisdiction_id uuid NOT NULL REFERENCES public.tax_jurisdictions(id) ON DELETE RESTRICT,
  pct numeric(7,4),                -- 0..100; nullable if hours-based
  hours numeric(8,2),              -- nullable if pct-based
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wsa_item ON public.work_state_allocations(payroll_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_state_allocations TO authenticated;
GRANT ALL ON public.work_state_allocations TO service_role;
ALTER TABLE public.work_state_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wsa_admin_all" ON public.work_state_allocations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','accountant','auditor']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]));
CREATE POLICY "wsa_self_read" ON public.work_state_allocations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payroll_items pi
    JOIN public.employees e ON e.id = pi.employee_id
    WHERE pi.id = payroll_item_id AND e.user_id = auth.uid()
  ));

-- ============================================
-- Seeds
-- ============================================

-- Common reciprocity pairs (kept compact; certificate forms noted where well-known)
INSERT INTO public.state_reciprocity(home_state, work_state, certificate_form) VALUES
  -- Illinois
  ('US-IA','US-IL','IL-W-5-NR'),('US-KY','US-IL','IL-W-5-NR'),('US-MI','US-IL','IL-W-5-NR'),('US-WI','US-IL','IL-W-5-NR'),
  -- Indiana
  ('US-KY','US-IN','WH-47'),('US-MI','US-IN','WH-47'),('US-OH','US-IN','WH-47'),('US-PA','US-IN','WH-47'),('US-WI','US-IN','WH-47'),
  -- Iowa
  ('US-IL','US-IA','IA-44-016'),
  -- Kentucky
  ('US-IL','US-KY','42A809'),('US-IN','US-KY','42A809'),('US-MI','US-KY','42A809'),('US-OH','US-KY','42A809'),('US-VA','US-KY','42A809'),('US-WV','US-KY','42A809'),('US-WI','US-KY','42A809'),
  -- Maryland
  ('US-PA','US-MD','MW-507'),('US-VA','US-MD','MW-507'),('US-WV','US-MD','MW-507'),('US-DC','US-MD','MW-507'),
  -- Michigan
  ('US-IL','US-MI','MI-W4'),('US-IN','US-MI','MI-W4'),('US-KY','US-MI','MI-W4'),('US-MN','US-MI','MI-W4'),('US-OH','US-MI','MI-W4'),('US-WI','US-MI','MI-W4'),
  -- Minnesota
  ('US-MI','US-MN','MWR'),('US-ND','US-MN','MWR'),
  -- Montana
  ('US-ND','US-MT','NR-2'),
  -- New Jersey
  ('US-PA','US-NJ','NJ-165'),
  -- North Dakota
  ('US-MN','US-ND','NDW-R'),('US-MT','US-ND','NDW-R'),
  -- Ohio
  ('US-IN','US-OH','IT-4NR'),('US-KY','US-OH','IT-4NR'),('US-MI','US-OH','IT-4NR'),('US-PA','US-OH','IT-4NR'),('US-WV','US-OH','IT-4NR'),
  -- Pennsylvania
  ('US-IN','US-PA','REV-419'),('US-MD','US-PA','REV-419'),('US-NJ','US-PA','REV-419'),('US-OH','US-PA','REV-419'),('US-VA','US-PA','REV-419'),('US-WV','US-PA','REV-419'),
  -- Virginia
  ('US-DC','US-VA','VA-4'),('US-KY','US-VA','VA-4'),('US-MD','US-VA','VA-4'),('US-PA','US-VA','VA-4'),('US-WV','US-VA','VA-4'),
  -- Washington DC
  ('US-MD','US-DC','D-4A'),('US-VA','US-DC','D-4A'),
  -- West Virginia
  ('US-KY','US-WV','WV-IT-104'),('US-MD','US-WV','WV-IT-104'),('US-OH','US-WV','WV-IT-104'),('US-PA','US-WV','WV-IT-104'),('US-VA','US-WV','WV-IT-104'),
  -- Wisconsin
  ('US-IL','US-WI','W-220'),('US-IN','US-WI','W-220'),('US-KY','US-WI','W-220'),('US-MI','US-WI','W-220');

-- Non-resident de-minimis rules (selected — extend over time)
INSERT INTO public.state_nonresident_rules(state_code, threshold_days, threshold_wages, notes) VALUES
  ('US-NY', 14, NULL, '14-working-day rule for non-resident employees temporarily in NY'),
  ('US-CT', 15, NULL, '15-day rule for non-resident wages'),
  ('US-AZ', NULL, 1.00, 'Tax on first dollar earned in AZ for non-residents'),
  ('US-GA', 23, NULL, '23-day or 5% of total wages rule'),
  ('US-HI', 60, NULL, '60-day rule for non-resident employees'),
  ('US-IL', 30, NULL, '30-day rule for non-resident employees'),
  ('US-IN', NULL, NULL, 'Withholding required on first day of work in IN'),
  ('US-LA', 25, NULL, '25-day rule for non-resident employees'),
  ('US-MN', NULL, 1.00, 'Withholding required on first dollar earned'),
  ('US-NM', 15, NULL, '15-day rule for non-resident employees'),
  ('US-OK', 25, NULL, '25-day rule for non-resident employees'),
  ('US-OR', NULL, NULL, 'Withholding required on first day of work in OR'),
  ('US-PA', NULL, NULL, 'Withholding required on first dollar earned'),
  ('US-WV', 30, NULL, '30-day rule for non-resident employees');

-- State SDI / FLI / SUI defaults (2025 published rates; SUI is employer-experience-rated, default shown is new-employer)
INSERT INTO public.state_employer_taxes(state_code, tax_code, effective_year, rate, wage_base_cap, is_employer, is_employee, notes) VALUES
  -- California SDI (employee-paid)
  ('US-CA','sdi',2025, 0.012, NULL, false, true, 'CA SDI 1.2% — wage base cap removed effective 2024'),
  -- New Jersey
  ('US-NJ','sdi',2025, 0.0023, 165400.00, false, true, 'NJ TDI employee 0.23% to $165,400'),
  ('US-NJ','fli',2025, 0.0033, 165400.00, false, true, 'NJ Family Leave 0.33% to $165,400'),
  -- New York
  ('US-NY','sdi',2025, 0.005, 60.00, false, true, 'NY SDI 0.5% capped at $60/year'),
  ('US-NY','fli',2025, 0.00388, 91373.88, false, true, 'NY PFL 0.388% to $91,373.88 (2025)'),
  -- Hawaii TDI
  ('US-HI','sdi',2025, 0.005, 1374.78, false, true, 'HI TDI up to 0.5% of weekly wages, half employee-paid'),
  -- Rhode Island TDI
  ('US-RI','sdi',2025, 0.011, 89200.00, false, true, 'RI TDI 1.1% to $89,200'),
  -- Washington Paid Family & Medical Leave
  ('US-WA','fli',2025, 0.0058, 168600.00, false, true, 'WA PFML employee share 0.58% (large employer)'),
  ('US-WA','fli',2025, 0.0034, 168600.00, true,  false, 'WA PFML employer share 0.34% (large employer)'),
  -- SUI new-employer defaults (employer-paid) — placeholders to be overridden per company
  ('US-CA','sui',2025, 0.034, 7000.00,   true, false, 'CA SUI new-employer 3.4% to $7,000'),
  ('US-NY','sui',2025, 0.041, 12500.00,  true, false, 'NY SUI new-employer 4.1% to $12,500'),
  ('US-NJ','sui',2025, 0.028, 43300.00,  true, false, 'NJ SUI new-employer 2.8% to $43,300'),
  ('US-TX','sui',2025, 0.027, 9000.00,   true, false, 'TX SUI new-employer 2.7% to $9,000');
