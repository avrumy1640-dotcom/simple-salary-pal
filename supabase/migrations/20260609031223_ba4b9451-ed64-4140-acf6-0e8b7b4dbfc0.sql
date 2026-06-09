
-- HR essentials: documents, onboarding tasks, signed forms (I-9/W-4/W-9)

CREATE TABLE public.hr_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  -- e.g. 'i9', 'w4', 'w9', 'offer_letter', 'handbook', 'direct_deposit', 'id', 'other'
  title TEXT NOT NULL,
  storage_path TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  notes TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_documents_owner_or_contractor CHECK (employee_id IS NOT NULL OR contractor_id IS NOT NULL OR (employee_id IS NULL AND contractor_id IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_documents TO authenticated;
GRANT ALL ON public.hr_documents TO service_role;
ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage hr documents" ON public.hr_documents
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_hr_documents_owner ON public.hr_documents(owner_id);
CREATE INDEX idx_hr_documents_employee ON public.hr_documents(employee_id);
CREATE INDEX idx_hr_documents_contractor ON public.hr_documents(contractor_id);
CREATE TRIGGER trg_hr_documents_updated BEFORE UPDATE ON public.hr_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.onboarding_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  -- 'tax_form', 'direct_deposit', 'id_verification', 'handbook', 'benefits', 'general'
  required BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending', 'in_progress', 'completed', 'skipped'
  due_date DATE,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_tasks TO authenticated;
GRANT ALL ON public.onboarding_tasks TO service_role;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage onboarding tasks" ON public.onboarding_tasks
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_onboarding_tasks_owner ON public.onboarding_tasks(owner_id);
CREATE INDEX idx_onboarding_tasks_employee ON public.onboarding_tasks(employee_id);
CREATE INDEX idx_onboarding_tasks_contractor ON public.onboarding_tasks(contractor_id);
CREATE TRIGGER trg_onboarding_tasks_updated BEFORE UPDATE ON public.onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.hr_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE CASCADE,
  form_type TEXT NOT NULL,
  -- 'w4', 'i9', 'w9', 'state_w4', 'direct_deposit_auth'
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending', 'sent', 'signed', 'rejected'
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed_at TIMESTAMPTZ,
  signed_name TEXT,
  signed_ip TEXT,
  pdf_storage_path TEXT,
  tax_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_forms TO authenticated;
GRANT ALL ON public.hr_forms TO service_role;
ALTER TABLE public.hr_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage hr forms" ON public.hr_forms
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_hr_forms_owner ON public.hr_forms(owner_id);
CREATE INDEX idx_hr_forms_employee ON public.hr_forms(employee_id);
CREATE INDEX idx_hr_forms_contractor ON public.hr_forms(contractor_id);
CREATE TRIGGER trg_hr_forms_updated BEFORE UPDATE ON public.hr_forms
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Plaid: store bank linkage per employee/contractor & company
CREATE TABLE public.bank_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE CASCADE,
  is_company BOOLEAN NOT NULL DEFAULT false,
  provider TEXT NOT NULL DEFAULT 'plaid',
  plaid_item_id TEXT,
  plaid_access_token TEXT, -- encrypted-at-rest by Supabase; never expose to client
  account_id TEXT,
  institution_name TEXT,
  account_name TEXT,
  account_mask TEXT,
  account_type TEXT,
  account_subtype TEXT,
  routing_number_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections TO authenticated;
GRANT ALL ON public.bank_connections TO service_role;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage bank connections" ON public.bank_connections
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_bank_connections_owner ON public.bank_connections(owner_id);
CREATE TRIGGER trg_bank_connections_updated BEFORE UPDATE ON public.bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
