
-- 1) Delete duplicate empty employee row (keep older one with user_id and punches)
DELETE FROM public.employees WHERE id = '20e2e777-90a7-4a5f-b1cb-0862fe2331c3';

-- 2) Make legacy owner_id nullable on company-scoped tables
ALTER TABLE public.bank_connections     ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.company_settings     ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.contractor_payments  ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.contractors          ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.deductions           ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.employees            ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.hr_documents         ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.hr_forms             ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.onboarding_tasks     ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.payroll_items        ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.payroll_runs         ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.pto_entries          ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.time_entries         ALTER COLUMN owner_id DROP NOT NULL;

-- 3) Uniqueness guards for employees
CREATE UNIQUE INDEX IF NOT EXISTS employees_company_email_uniq
  ON public.employees (company_id, lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_company_user_uniq
  ON public.employees (company_id, user_id)
  WHERE user_id IS NOT NULL;

-- 4) Index hygiene
DROP INDEX IF EXISTS public.idx_employees_company;
CREATE INDEX IF NOT EXISTS idx_timesheets_company_status
  ON public.timesheets (company_id, status);
