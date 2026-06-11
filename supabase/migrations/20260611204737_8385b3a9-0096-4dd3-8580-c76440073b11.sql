-- Enable full row payloads on tables we will stream so updates carry old values for diffing.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'notifications','announcements','announcement_reads',
    'pto_entries','expense_requests','general_requests',
    'pay_on_demand_requests','shift_swap_requests',
    'shifts','timesheets','time_entries',
    'payroll_runs','payroll_items',
    'employees','compliance_alerts','handbook_acknowledgments',
    'hr_document_signatures','onboarding_tasks'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- Add to realtime publication (idempotent: skip if already present).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'notifications','announcements','announcement_reads',
    'pto_entries','expense_requests','general_requests',
    'pay_on_demand_requests','shift_swap_requests',
    'shifts','timesheets','time_entries',
    'payroll_runs','payroll_items',
    'employees','compliance_alerts','handbook_acknowledgments',
    'hr_document_signatures','onboarding_tasks'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
