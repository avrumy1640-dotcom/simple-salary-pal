
DO $$
DECLARE
  t text;
  audited_tables text[] := ARRAY[
    'employees','user_roles','company_users',
    'payroll_runs','payroll_items','payroll_item_lines','deductions','garnishments',
    'time_clock_punches','time_entries','timesheets',
    'pto_entries','pto_ledger',
    'benefit_enrollments','hr_documents','hr_forms'
  ];
BEGIN
  FOREACH t IN ARRAY audited_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_row_changes ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_row_changes
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row()',
      t
    );
  END LOOP;
END $$;
