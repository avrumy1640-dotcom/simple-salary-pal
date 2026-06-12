
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, uuid, public.app_role[]) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.current_employee_id(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.employee_can_self_enroll(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_shares_company_with_path_user(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_access_hr_doc_object(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.haversine_m(double precision, double precision, double precision, double precision) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.publish_shifts(uuid, timestamptz, timestamptz) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.generate_compliance_alerts(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.generate_gl_for_run(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_onboarding_template(uuid, uuid, uuid, uuid, date) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_managers(uuid, public.notification_kind, text, text, text, text, uuid) FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS audit_events_immutable_upd ON public.audit_events;
DROP TRIGGER IF EXISTS audit_events_immutable_del ON public.audit_events;
CREATE TRIGGER audit_events_immutable_upd BEFORE UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.tg_audit_events_immutable();
CREATE TRIGGER audit_events_immutable_del BEFORE DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.tg_audit_events_immutable();

DO $$
DECLARE
  t text;
  audit_tables text[] := ARRAY[
    'employees','payroll_runs','payroll_items','payroll_item_lines',
    'deductions','garnishments','user_roles','company_users',
    'hr_documents','bank_connections','companies','compliance_records',
    'tax_records','benefit_enrollments'
  ];
BEGIN
  FOREACH t IN ARRAY audit_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_row_aiud ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_row_aiud
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row()', t);
  END LOOP;
END $$;

-- updated_at maintenance — BASE TABLES ONLY (skip views).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.table_name
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
     WHERE t.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()',
      r.table_name);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS employees_lifecycle_guard ON public.employees;
CREATE TRIGGER employees_lifecycle_guard BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.tg_employee_lifecycle_guard();

DROP TRIGGER IF EXISTS employees_self_update_guard ON public.employees;
CREATE TRIGGER employees_self_update_guard BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.tg_employees_self_update_guard();

DROP TRIGGER IF EXISTS employees_sync_department_text ON public.employees;
CREATE TRIGGER employees_sync_department_text BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.tg_sync_employee_department_text();

DROP TRIGGER IF EXISTS departments_propagate_rename ON public.departments;
CREATE TRIGGER departments_propagate_rename AFTER UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.tg_propagate_department_rename();

DROP TRIGGER IF EXISTS payroll_runs_lock_guard ON public.payroll_runs;
CREATE TRIGGER payroll_runs_lock_guard BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_runs_lock_guard();

DROP TRIGGER IF EXISTS payroll_runs_post_gl ON public.payroll_runs;
CREATE TRIGGER payroll_runs_post_gl AFTER UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_runs_post_gl();

DROP TRIGGER IF EXISTS payroll_runs_paid_notify ON public.payroll_runs;
CREATE TRIGGER payroll_runs_paid_notify AFTER UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_paid_notify();

DROP TRIGGER IF EXISTS payroll_items_lock_guard ON public.payroll_items;
CREATE TRIGGER payroll_items_lock_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_items FOR EACH ROW EXECUTE FUNCTION public.tg_block_if_run_locked();

DROP TRIGGER IF EXISTS payroll_item_lines_lock_guard ON public.payroll_item_lines;
CREATE TRIGGER payroll_item_lines_lock_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_item_lines FOR EACH ROW EXECUTE FUNCTION public.tg_block_if_run_locked();

DROP TRIGGER IF EXISTS time_entries_timesheet_lock ON public.time_entries;
CREATE TRIGGER time_entries_timesheet_lock BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.tg_block_if_timesheet_locked();

DROP TRIGGER IF EXISTS punches_geofence_check ON public.time_clock_punches;
CREATE TRIGGER punches_geofence_check BEFORE INSERT ON public.time_clock_punches FOR EACH ROW EXECUTE FUNCTION public.tg_punch_geofence_check();

DROP TRIGGER IF EXISTS shifts_no_overlap ON public.shifts;
CREATE TRIGGER shifts_no_overlap BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.tg_shift_no_overlap();

DROP TRIGGER IF EXISTS shifts_publish_notify ON public.shifts;
CREATE TRIGGER shifts_publish_notify AFTER UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.tg_shift_publish_notify();

DROP TRIGGER IF EXISTS shift_swap_notify ON public.shift_swap_requests;
CREATE TRIGGER shift_swap_notify AFTER INSERT OR UPDATE ON public.shift_swap_requests FOR EACH ROW EXECUTE FUNCTION public.tg_swap_notify();

DROP TRIGGER IF EXISTS pod_notify ON public.pay_on_demand_requests;
CREATE TRIGGER pod_notify AFTER INSERT OR UPDATE ON public.pay_on_demand_requests FOR EACH ROW EXECUTE FUNCTION public.tg_pod_notify();

DROP TRIGGER IF EXISTS pto_entries_apply_ledger ON public.pto_entries;
CREATE TRIGGER pto_entries_apply_ledger AFTER INSERT OR UPDATE ON public.pto_entries FOR EACH ROW EXECUTE FUNCTION public.tg_pto_entry_apply();

DROP TRIGGER IF EXISTS pto_entries_decision_notify ON public.pto_entries;
CREATE TRIGGER pto_entries_decision_notify AFTER UPDATE ON public.pto_entries FOR EACH ROW EXECUTE FUNCTION public.tg_pto_decision_notify();

DROP TRIGGER IF EXISTS pto_ledger_balance ON public.pto_ledger;
CREATE TRIGGER pto_ledger_balance BEFORE INSERT ON public.pto_ledger FOR EACH ROW EXECUTE FUNCTION public.tg_pto_ledger_balance();

DROP TRIGGER IF EXISTS expense_requests_decision_notify ON public.expense_requests;
CREATE TRIGGER expense_requests_decision_notify AFTER UPDATE ON public.expense_requests FOR EACH ROW EXECUTE FUNCTION public.tg_expense_decision_notify();

DROP TRIGGER IF EXISTS general_requests_answered_notify ON public.general_requests;
CREATE TRIGGER general_requests_answered_notify AFTER UPDATE ON public.general_requests FOR EACH ROW EXECUTE FUNCTION public.tg_general_request_answered_notify();

DROP TRIGGER IF EXISTS benefit_enrollments_sync_deductions ON public.benefit_enrollments;
CREATE TRIGGER benefit_enrollments_sync_deductions AFTER INSERT OR UPDATE ON public.benefit_enrollments FOR EACH ROW EXECUTE FUNCTION public.tg_benefit_enrollment_sync_deduction();

DROP TRIGGER IF EXISTS hr_document_signatures_validate ON public.hr_document_signatures;
CREATE TRIGGER hr_document_signatures_validate BEFORE INSERT OR UPDATE ON public.hr_document_signatures FOR EACH ROW EXECUTE FUNCTION public.tg_hr_doc_sig_validate();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
