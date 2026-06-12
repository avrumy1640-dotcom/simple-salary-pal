# Project Memory

## Core
Payroll/HR/WFM platform. Compliance posture matters: audit log integrity, RLS, role separation.
Role-check helpers (has_role, has_any_role, current_employee_id, is_company_member, employee_can_self_enroll, can_access_hr_doc_object, admin_shares_company_with_path_user) are SECURITY DEFINER and MUST stay EXECUTE-able by `authenticated` — RLS policies depend on them. Linter warning 0029 on these is intentional and ignored.
Audit triggers (tg_audit_row) attached to: employees, user_roles, company_users, payroll_runs, payroll_items, payroll_item_lines, deductions, garnishments, time_clock_punches, time_entries, timesheets, pto_entries, pto_ledger, benefit_enrollments, hr_documents, hr_forms. audit_events is append-only via tg_audit_events_immutable.

## Memories
