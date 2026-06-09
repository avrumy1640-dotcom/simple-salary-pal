
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  business_name text,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  tax_id_type text DEFAULT 'SSN',
  tax_id_last4 text,
  payment_method text DEFAULT 'ach',
  bank_routing_last4 text,
  bank_account_last4 text,
  hourly_rate numeric(12,2),
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractors TO authenticated;
GRANT ALL ON public.contractors TO service_role;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage contractors" ON public.contractors FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_contractors_updated BEFORE UPDATE ON public.contractors FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.contractor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  contractor_name text NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  category text DEFAULT 'nonemployee_compensation',
  description text,
  payment_method text DEFAULT 'ach',
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_payments TO authenticated;
GRANT ALL ON public.contractor_payments TO service_role;
ALTER TABLE public.contractor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage contractor payments" ON public.contractor_payments FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_contractor_payments_updated BEFORE UPDATE ON public.contractor_payments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_contractors_owner ON public.contractors(owner_id);
CREATE INDEX idx_contractor_payments_owner ON public.contractor_payments(owner_id);
CREATE INDEX idx_contractor_payments_contractor ON public.contractor_payments(contractor_id);
