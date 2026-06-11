
CREATE TABLE public.expense_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  expense_date DATE NOT NULL,
  merchant TEXT,
  description TEXT,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decline_reason TEXT,
  reimbursed_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_requests TO authenticated;
GRANT ALL ON public.expense_requests TO service_role;
ALTER TABLE public.expense_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee view own expenses" ON public.expense_requests
  FOR SELECT TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role])
  );

CREATE POLICY "Employee create own expenses" ON public.expense_requests
  FOR INSERT TO authenticated WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Employee cancel own pending expenses" ON public.expense_requests
  FOR UPDATE TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()) AND status = 'pending'
  ) WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins manage expenses" ON public.expense_requests
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role]));

CREATE TRIGGER update_expense_requests_updated_at
  BEFORE UPDATE ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_expense_requests_company ON public.expense_requests(company_id, status);
CREATE INDEX idx_expense_requests_employee ON public.expense_requests(employee_id);


CREATE TABLE public.general_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  details TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  response TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_requests TO authenticated;
GRANT ALL ON public.general_requests TO service_role;
ALTER TABLE public.general_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee view own general requests" ON public.general_requests
  FOR SELECT TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role])
  );

CREATE POLICY "Employee create own general requests" ON public.general_requests
  FOR INSERT TO authenticated WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Employee cancel own open requests" ON public.general_requests
  FOR UPDATE TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()) AND status = 'open'
  ) WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins manage general requests" ON public.general_requests
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role]));

CREATE TRIGGER update_general_requests_updated_at
  BEFORE UPDATE ON public.general_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_general_requests_company ON public.general_requests(company_id, status);
CREATE INDEX idx_general_requests_employee ON public.general_requests(employee_id);

CREATE POLICY "Employees upload own receipts" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Employees read receipts" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'expense-receipts' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('owner'::app_role,'admin'::app_role,'hr_admin'::app_role,'payroll_admin'::app_role)
      )
    )
  );
CREATE POLICY "Employees delete own receipts" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text
  );
