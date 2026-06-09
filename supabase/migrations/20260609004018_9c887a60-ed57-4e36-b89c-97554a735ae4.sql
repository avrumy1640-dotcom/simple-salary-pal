-- Extend employees with comprehensive payroll fields
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS ssn_last4 text,
  ADD COLUMN IF NOT EXISTS filing_status text DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS dependents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_withholding numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_account_type text,
  ADD COLUMN IF NOT EXISTS bank_routing_last4 text,
  ADD COLUMN IF NOT EXISTS bank_account_last4 text,
  ADD COLUMN IF NOT EXISTS direct_deposit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pto_balance_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pto_accrual_per_period numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

-- Deductions table (health insurance, 401k, garnishments, etc.)
CREATE TABLE IF NOT EXISTS public.deductions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  pre_tax boolean NOT NULL DEFAULT false,
  amount numeric NOT NULL DEFAULT 0,
  amount_type text NOT NULL DEFAULT 'fixed',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deductions TO authenticated;
GRANT ALL ON public.deductions TO service_role;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deductions" ON public.deductions FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER deductions_updated_at BEFORE UPDATE ON public.deductions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- PTO entries
CREATE TABLE IF NOT EXISTS public.pto_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  pto_type text NOT NULL DEFAULT 'vacation',
  start_date date NOT NULL,
  end_date date NOT NULL,
  hours numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pto_entries TO authenticated;
GRANT ALL ON public.pto_entries TO service_role;
ALTER TABLE public.pto_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pto" ON public.pto_entries FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER pto_entries_updated_at BEFORE UPDATE ON public.pto_entries FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Company settings
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE,
  legal_name text,
  ein text,
  state_tax_id text,
  business_address text,
  business_city text,
  business_state text DEFAULT 'CA',
  business_zip text,
  pay_frequency text NOT NULL DEFAULT 'biweekly',
  next_pay_date date,
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.company_settings FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();