
-- =========================================
-- Phase A.1 — Tax engine reference schema
-- =========================================

CREATE TABLE public.tax_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,                 -- 'US', 'US-CA', 'US-NY-NYC'
  kind text NOT NULL CHECK (kind IN ('federal','state','local')),
  name text NOT NULL,
  parent_jurisdiction_id uuid REFERENCES public.tax_jurisdictions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tax_jurisdictions TO authenticated;
GRANT ALL ON public.tax_jurisdictions TO service_role;
ALTER TABLE public.tax_jurisdictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_jurisdictions read all signed in" ON public.tax_jurisdictions
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_tax_jurisdictions_updated BEFORE UPDATE ON public.tax_jurisdictions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.tax_table_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES public.tax_jurisdictions(id) ON DELETE CASCADE,
  tax_type text NOT NULL CHECK (tax_type IN ('income','sui','sdi','fli','local','fica','futa','medicare','add_medicare')),
  effective_start date NOT NULL,
  effective_end date,
  source_url text,
  published_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_id, tax_type, effective_start)
);
CREATE INDEX idx_tax_table_versions_lookup ON public.tax_table_versions(jurisdiction_id, tax_type, effective_start);
GRANT SELECT ON public.tax_table_versions TO authenticated;
GRANT ALL ON public.tax_table_versions TO service_role;
ALTER TABLE public.tax_table_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_table_versions read all signed in" ON public.tax_table_versions
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_tax_table_versions_updated BEFORE UPDATE ON public.tax_table_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.tax_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.tax_table_versions(id) ON DELETE CASCADE,
  filing_status text NOT NULL CHECK (filing_status IN ('single','married','married_separate','head_of_household')),
  pay_frequency text NOT NULL CHECK (pay_frequency IN ('annual','biweekly','semimonthly','weekly','monthly','daily','quarterly')),
  lower_amount numeric(14,2) NOT NULL,
  upper_amount numeric(14,2),
  base_tax numeric(14,2) NOT NULL DEFAULT 0,
  marginal_rate numeric(8,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tax_brackets_lookup ON public.tax_brackets(version_id, filing_status, pay_frequency, lower_amount);
GRANT SELECT ON public.tax_brackets TO authenticated;
GRANT ALL ON public.tax_brackets TO service_role;
ALTER TABLE public.tax_brackets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_brackets read all signed in" ON public.tax_brackets
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.tax_standard_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.tax_table_versions(id) ON DELETE CASCADE,
  filing_status text NOT NULL CHECK (filing_status IN ('single','married','married_separate','head_of_household')),
  pay_frequency text NOT NULL DEFAULT 'annual',
  amount numeric(14,2) NOT NULL,
  dependent_credit_under17 numeric(14,2) NOT NULL DEFAULT 0,
  dependent_credit_other numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, filing_status, pay_frequency)
);
GRANT SELECT ON public.tax_standard_deductions TO authenticated;
GRANT ALL ON public.tax_standard_deductions TO service_role;
ALTER TABLE public.tax_standard_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_standard_deductions read all signed in" ON public.tax_standard_deductions
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.tax_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.tax_table_versions(id) ON DELETE CASCADE,
  pay_frequency text NOT NULL DEFAULT 'annual',
  amount_per_allowance numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, pay_frequency)
);
GRANT SELECT ON public.tax_allowances TO authenticated;
GRANT ALL ON public.tax_allowances TO service_role;
ALTER TABLE public.tax_allowances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_allowances read all signed in" ON public.tax_allowances
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.tax_flat_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.tax_table_versions(id) ON DELETE CASCADE,
  code text NOT NULL,            -- 'social_security','medicare','add_medicare','futa','suta_default'
  rate numeric(8,6) NOT NULL,
  wage_base_cap numeric(14,2),
  threshold numeric(14,2),       -- e.g. add_medicare threshold 200000
  is_employer boolean NOT NULL DEFAULT false,
  is_employee boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, code, is_employer, is_employee)
);
GRANT SELECT ON public.tax_flat_rates TO authenticated;
GRANT ALL ON public.tax_flat_rates TO service_role;
ALTER TABLE public.tax_flat_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_flat_rates read all signed in" ON public.tax_flat_rates
  FOR SELECT TO authenticated USING (true);

-- Resolver
CREATE OR REPLACE FUNCTION public.resolve_tax_version(_jurisdiction text, _tax_type text, _on date)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id
    FROM public.tax_table_versions v
    JOIN public.tax_jurisdictions j ON j.id = v.jurisdiction_id
   WHERE j.code = _jurisdiction
     AND v.tax_type = _tax_type
     AND v.is_active
     AND v.effective_start <= _on
     AND (v.effective_end IS NULL OR v.effective_end > _on)
   ORDER BY v.effective_start DESC
   LIMIT 1
$$;

-- =========================================
-- Seed: jurisdictions
-- =========================================
INSERT INTO public.tax_jurisdictions(code, kind, name) VALUES
  ('US','federal','United States Federal'),
  ('US-AL','state','Alabama'),('US-AK','state','Alaska'),('US-AZ','state','Arizona'),
  ('US-AR','state','Arkansas'),('US-CA','state','California'),('US-CO','state','Colorado'),
  ('US-CT','state','Connecticut'),('US-DE','state','Delaware'),('US-FL','state','Florida'),
  ('US-GA','state','Georgia'),('US-HI','state','Hawaii'),('US-ID','state','Idaho'),
  ('US-IL','state','Illinois'),('US-IN','state','Indiana'),('US-IA','state','Iowa'),
  ('US-KS','state','Kansas'),('US-KY','state','Kentucky'),('US-LA','state','Louisiana'),
  ('US-ME','state','Maine'),('US-MD','state','Maryland'),('US-MA','state','Massachusetts'),
  ('US-MI','state','Michigan'),('US-MN','state','Minnesota'),('US-MS','state','Mississippi'),
  ('US-MO','state','Missouri'),('US-MT','state','Montana'),('US-NE','state','Nebraska'),
  ('US-NV','state','Nevada'),('US-NH','state','New Hampshire'),('US-NJ','state','New Jersey'),
  ('US-NM','state','New Mexico'),('US-NY','state','New York'),('US-NC','state','North Carolina'),
  ('US-ND','state','North Dakota'),('US-OH','state','Ohio'),('US-OK','state','Oklahoma'),
  ('US-OR','state','Oregon'),('US-PA','state','Pennsylvania'),('US-RI','state','Rhode Island'),
  ('US-SC','state','South Carolina'),('US-SD','state','South Dakota'),('US-TN','state','Tennessee'),
  ('US-TX','state','Texas'),('US-UT','state','Utah'),('US-VT','state','Vermont'),
  ('US-VA','state','Virginia'),('US-WA','state','Washington'),('US-WV','state','West Virginia'),
  ('US-WI','state','Wisconsin'),('US-WY','state','Wyoming'),
  ('US-DC','state','District of Columbia'),('US-PR','state','Puerto Rico');

-- =========================================
-- Seed: federal 2025 income tax version
-- =========================================
DO $$
DECLARE
  v_us uuid;
  v_inc uuid;
  v_fica uuid;
  v_med uuid;
  v_addmed uuid;
  v_futa uuid;
BEGIN
  SELECT id INTO v_us FROM public.tax_jurisdictions WHERE code='US';

  -- Federal income tax version (2025, Pub 15-T Annual Percentage Method, post-2017 W-4)
  INSERT INTO public.tax_table_versions(jurisdiction_id, tax_type, effective_start, effective_end, source_url, notes)
  VALUES (v_us, 'income', DATE '2025-01-01', DATE '2026-01-01',
          'https://www.irs.gov/pub/irs-pdf/p15t.pdf',
          'IRS Pub 15-T 2025 Worksheet 1A — Annual Standard Withholding (post-2019 W-4, Step 2 unchecked)')
  RETURNING id INTO v_inc;

  -- Single / MFS — annual
  INSERT INTO public.tax_brackets(version_id, filing_status, pay_frequency, lower_amount, upper_amount, base_tax, marginal_rate) VALUES
    (v_inc,'single','annual',       0.00,    6400.00,        0.00, 0.00),
    (v_inc,'single','annual',    6400.00,   18325.00,        0.00, 0.10),
    (v_inc,'single','annual',   18325.00,   54875.00,     1192.50, 0.12),
    (v_inc,'single','annual',   54875.00,  109750.00,     5578.50, 0.22),
    (v_inc,'single','annual',  109750.00,  203700.00,    17651.00, 0.24),
    (v_inc,'single','annual',  203700.00,  256925.00,    40199.00, 0.32),
    (v_inc,'single','annual',  256925.00,  632750.00,    57231.00, 0.35),
    (v_inc,'single','annual',  632750.00,        NULL,  188769.75, 0.37);

  INSERT INTO public.tax_brackets(version_id, filing_status, pay_frequency, lower_amount, upper_amount, base_tax, marginal_rate) VALUES
    (v_inc,'married_separate','annual',       0.00,    6400.00,        0.00, 0.00),
    (v_inc,'married_separate','annual',    6400.00,   18325.00,        0.00, 0.10),
    (v_inc,'married_separate','annual',   18325.00,   54875.00,     1192.50, 0.12),
    (v_inc,'married_separate','annual',   54875.00,  109750.00,     5578.50, 0.22),
    (v_inc,'married_separate','annual',  109750.00,  203700.00,    17651.00, 0.24),
    (v_inc,'married_separate','annual',  203700.00,  256925.00,    40199.00, 0.32),
    (v_inc,'married_separate','annual',  256925.00,  632750.00,    57231.00, 0.35),
    (v_inc,'married_separate','annual',  632750.00,        NULL,  188769.75, 0.37);

  -- MFJ — annual
  INSERT INTO public.tax_brackets(version_id, filing_status, pay_frequency, lower_amount, upper_amount, base_tax, marginal_rate) VALUES
    (v_inc,'married','annual',       0.00,   17000.00,        0.00, 0.00),
    (v_inc,'married','annual',   17000.00,   40950.00,        0.00, 0.10),
    (v_inc,'married','annual',   40950.00,  114050.00,     2395.00, 0.12),
    (v_inc,'married','annual',  114050.00,  223800.00,    11157.00, 0.22),
    (v_inc,'married','annual',  223800.00,  411700.00,    35302.00, 0.24),
    (v_inc,'married','annual',  411700.00,  518150.00,    80398.00, 0.32),
    (v_inc,'married','annual',  518150.00,  768700.00,   114462.00, 0.35),
    (v_inc,'married','annual',  768700.00,        NULL,  202154.50, 0.37);

  -- HOH — annual
  INSERT INTO public.tax_brackets(version_id, filing_status, pay_frequency, lower_amount, upper_amount, base_tax, marginal_rate) VALUES
    (v_inc,'head_of_household','annual',       0.00,   13900.00,        0.00, 0.00),
    (v_inc,'head_of_household','annual',   13900.00,   30900.00,        0.00, 0.10),
    (v_inc,'head_of_household','annual',   30900.00,   78750.00,     1700.00, 0.12),
    (v_inc,'head_of_household','annual',   78750.00,  117250.00,     7442.00, 0.22),
    (v_inc,'head_of_household','annual',  117250.00,  211200.00,    15912.00, 0.24),
    (v_inc,'head_of_household','annual',  211200.00,  264400.00,    38460.00, 0.32),
    (v_inc,'head_of_household','annual',  264400.00,  640250.00,    55484.00, 0.35),
    (v_inc,'head_of_household','annual',  640250.00,        NULL,  187031.25, 0.37);

  -- Standard deductions (per IRS Pub 15-T 2025) — these are the per-period adjustments baked into Worksheet 1A
  -- Annual standard deduction amounts used for the Adjusted Annual Wage computation:
  --   Single/MFS: 0 (already in bracket "0%" zone)
  -- Pub 15-T merges standard deduction into the bracket "0%" zone; we expose the dependent credits used in Step 3.
  INSERT INTO public.tax_standard_deductions(version_id, filing_status, pay_frequency, amount, dependent_credit_under17, dependent_credit_other) VALUES
    (v_inc,'single','annual',           0.00, 2000.00,  500.00),
    (v_inc,'married','annual',          0.00, 2000.00,  500.00),
    (v_inc,'married_separate','annual', 0.00, 2000.00,  500.00),
    (v_inc,'head_of_household','annual',0.00, 2000.00,  500.00);

  -- FICA flat rates (2025)
  INSERT INTO public.tax_table_versions(jurisdiction_id, tax_type, effective_start, effective_end, source_url, notes)
  VALUES (v_us, 'fica', DATE '2025-01-01', DATE '2026-01-01', 'https://www.ssa.gov/oact/cola/cbb.html', 'Social Security 2025: 6.2% to $176,100 wage base')
  RETURNING id INTO v_fica;
  INSERT INTO public.tax_flat_rates(version_id, code, rate, wage_base_cap, is_employee, is_employer) VALUES
    (v_fica,'social_security', 0.062, 176100.00, true,  false),
    (v_fica,'social_security', 0.062, 176100.00, false, true);

  INSERT INTO public.tax_table_versions(jurisdiction_id, tax_type, effective_start, effective_end, source_url, notes)
  VALUES (v_us, 'medicare', DATE '2025-01-01', DATE '2026-01-01', 'https://www.irs.gov/taxtopics/tc751', 'Medicare 2025: 1.45% no cap')
  RETURNING id INTO v_med;
  INSERT INTO public.tax_flat_rates(version_id, code, rate, wage_base_cap, is_employee, is_employer) VALUES
    (v_med,'medicare', 0.0145, NULL, true,  false),
    (v_med,'medicare', 0.0145, NULL, false, true);

  INSERT INTO public.tax_table_versions(jurisdiction_id, tax_type, effective_start, effective_end, source_url, notes)
  VALUES (v_us, 'add_medicare', DATE '2025-01-01', DATE '2026-01-01', 'https://www.irs.gov/taxtopics/tc560', 'Additional Medicare 0.9% over $200k (employee only)')
  RETURNING id INTO v_addmed;
  INSERT INTO public.tax_flat_rates(version_id, code, rate, wage_base_cap, threshold, is_employee, is_employer) VALUES
    (v_addmed,'add_medicare', 0.009, NULL, 200000.00, true, false);

  INSERT INTO public.tax_table_versions(jurisdiction_id, tax_type, effective_start, effective_end, source_url, notes)
  VALUES (v_us, 'futa', DATE '2025-01-01', DATE '2026-01-01', 'https://www.irs.gov/businesses/small-businesses-self-employed/futa-credit-reduction', 'FUTA 2025: effective 0.6% on first $7,000 wages (after state credit)')
  RETURNING id INTO v_futa;
  INSERT INTO public.tax_flat_rates(version_id, code, rate, wage_base_cap, is_employee, is_employer) VALUES
    (v_futa,'futa', 0.006, 7000.00, false, true);
END $$;

-- Status view: which jurisdictions have current-year tables
CREATE OR REPLACE VIEW public.tax_tables_status AS
SELECT j.code, j.name, j.kind, v.tax_type, v.effective_start, v.effective_end, v.is_active
  FROM public.tax_jurisdictions j
  LEFT JOIN public.tax_table_versions v ON v.jurisdiction_id = j.id
 ORDER BY j.kind, j.code, v.tax_type;
GRANT SELECT ON public.tax_tables_status TO authenticated;
