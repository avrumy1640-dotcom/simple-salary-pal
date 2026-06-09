
ALTER POLICY "owners manage bank connections" ON public.bank_connections TO authenticated;
ALTER POLICY "owners manage contractor payments" ON public.contractor_payments TO authenticated;
ALTER POLICY "owners manage contractors" ON public.contractors TO authenticated;
ALTER POLICY "own employees" ON public.employees TO authenticated;
ALTER POLICY "Owners manage their field visits" ON public.field_visits TO authenticated;
ALTER POLICY "Owners manage their signature history" ON public.hr_document_signatures TO authenticated;
ALTER POLICY "owners manage hr documents" ON public.hr_documents TO authenticated;
ALTER POLICY "owners manage hr forms" ON public.hr_forms TO authenticated;
ALTER POLICY "owners manage onboarding tasks" ON public.onboarding_tasks TO authenticated;
ALTER POLICY "own items" ON public.payroll_items TO authenticated;
ALTER POLICY "own runs" ON public.payroll_runs TO authenticated;
ALTER POLICY "own profile" ON public.profiles TO authenticated;
ALTER POLICY "Owners manage their punches" ON public.time_clock_punches TO authenticated;
ALTER POLICY "own time" ON public.time_entries TO authenticated;
