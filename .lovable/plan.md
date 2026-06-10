## Audit findings (gap analysis)

**Critical (data integrity / security)**
- No multi-company model — `owner_id` scoping only; one user = one company. Need `companies`, `company_users`, `company_id` on every table.
- No RBAC — single owner, no roles. Need `app_role` enum, `user_roles`, `has_role()` security-definer, policies rewritten to use it.
- No audit log — payroll/HR actions untracked.
- No payroll workflow states — `payroll_runs.status` is freeform. Need enum `draft|review|approved|locked|processed|reversed|corrected` + transitions.
- No payroll lock — approved runs can be edited.
- No reversal / correction records — corrections overwrite originals.
- `pto_balance_hours` lives on `employees` (mutated by app) — no ledger, no accrual history.

**High (compliance / payroll math)**
- Calc engine missing: double-overtime, holiday pay, sick pay, bonuses (supplemental tax), commissions, reimbursements (non-taxable), garnishments (with priority + cap), employer-side taxes (FUTA/SUTA/employer FICA).
- No pay schedule entity — pay periods derived ad-hoc. Need `pay_schedules` + `pay_periods`.
- No tax records table — withholdings only live on `payroll_items`.
- No employer tax liability tracking.

**Medium**
- Time tracking has clock punches but no shifts/schedules, no break enforcement, no approval workflow on timesheets.
- Onboarding has tasks but no template, no I-9/W-4/state-form ack tracking.
- Documents lack handbook acknowledgment table.
- No performance notes table.
- Reports computed on the fly in components — no `reports_runs` cache.

**Low**
- No MFA flag surfaced (Supabase supports it; UI needs toggle).
- No session/IP logging beyond Supabase defaults.

---

## Implementation plan

Delivered across multiple migrations + code changes in this single response.

### Phase 1 — Schema foundation (migration #1)
- Enums: `app_role` (owner, admin, payroll_admin, hr_admin, manager, employee), `payroll_status`, `pay_frequency`, `pto_status`, `timesheet_status`, `audit_action`.
- New tables:
  - `companies` (legal name, EIN, address, state, etc.)
  - `company_users` (user_id, company_id, role, is_default)
  - `user_roles` (per-company role assignments) + `has_role(_user, _company, _role)` security definer
  - `pay_schedules` (company_id, frequency, anchor_date, weekend_rule)
  - `pay_periods` (schedule_id, period_start, period_end, pay_date, status)
  - `tax_records` (company_id, period, jurisdiction, tax_type, taxable_wages, tax_amount, liability_date, deposit_status)
  - `employer_tax_liabilities` (run_id, futa, suta, employer_fica_ss, employer_fica_medicare)
  - `garnishments` (employee_id, type, priority, amount, cap_pct, remaining_balance, court_order_ref)
  - `pto_ledger` (employee_id, delta_hours, reason, ref_id, balance_after) — replaces direct mutation
  - `pto_accrual_policies` (company_id, hours_per_period, max_balance, carryover)
  - `audit_events` (actor_id, company_id, action, entity_type, entity_id, before, after, ip, user_agent, occurred_at)
  - `payroll_corrections` (original_run_id, correcting_run_id, reason, created_by)
  - `payroll_reversals` (run_id, reason, reversed_by, reversed_at)
  - `timesheets` (employee_id, period_start, period_end, status, approver_id) — wraps `time_entries`
  - `shifts` (employee_id, start_at, end_at, role, location)
  - `handbook_acknowledgments` (employee_id, document_id, acknowledged_at, ip)
  - `performance_notes` (employee_id, author_id, category, note, occurred_at)
  - `compliance_records` (employee_id, type [I-9, W-4, state-w4, EEO], status, file_id, completed_at)
  - `provider_integrations` (company_id, provider [symmetry, plaid, modern_treasury], status, config jsonb, secret_ref)
- Add `company_id` to: `employees, payroll_runs, payroll_items, pto_entries, time_entries, time_clock_punches, deductions, hr_documents, hr_forms, hr_document_signatures, onboarding_tasks, field_visits, contractors, contractor_payments, bank_connections, company_settings`. Backfill from `owner_id`'s default company.
- GRANTs + RLS on every new table using `has_role(auth.uid(), company_id, ...)`.
- Triggers: `tg_set_updated_at`, `tg_audit_payroll`, `tg_pto_ledger_balance`.
- `handle_new_user` extended to create a default company + owner role.

### Phase 2 — Payroll engine rewrite (`src/lib/payroll.ts`)
- Inputs expanded: `regularHours, overtimeHours, doubleOvertimeHours, holidayHours, ptoHours, sickHours, bonuses[], commissions[], reimbursements[], garnishments[]`.
- Rates: regular ×1, OT ×1.5, double-OT ×2, holiday ×1.5 (configurable per company).
- Supplemental withholding (22% federal flat) for bonuses/commissions.
- Reimbursements: added to net, excluded from taxable wages.
- Garnishments: applied post-tax, respecting CCPA caps (25% / 50% / 60%) and priority order.
- Employer taxes: FUTA (0.6% on first $7k), SUTA (configurable per state), employer FICA mirror.
- Returns full breakdown including employer-side liabilities.

### Phase 3 — Workflow + server functions (`src/lib/payroll.functions.ts`)
- `createDraftRun`, `submitForReview`, `approveRun`, `lockRun`, `processRun`, `reverseRun`, `createCorrectionRun` — each enforces state transition + writes `audit_events` + `requireSupabaseAuth` + `has_role` check.
- `recordEmployerTaxes`, `recordTaxRecord` invoked on `processRun`.

### Phase 4 — RBAC + company context
- `src/hooks/useCompany.ts` — current company id from `company_users` (default or persisted choice).
- Company switcher in `TopBar`.
- All client queries filter by `company_id`.
- `requireRole(role)` helper for server functions.

### Phase 5 — Provider stubs
- `src/lib/providers/symmetry.server.ts`, `plaid.server.ts`, `modernTreasury.server.ts` — typed interfaces, env-var reads inside handlers, TODO bodies returning shaped error until secrets provided.
- `provider_integrations` row drives whether real call or fallback math runs.

### Phase 6 — UI wiring (minimal, keep current designs)
- Payroll page: status chips reflect new enum, action buttons gated by role, lock/reverse/correct actions added.
- New `/app/audit` page (admin only) — paginated `audit_events`.
- New `/app/companies` page — switch / create / invite users with role.
- Existing pages: add company filter, no visual redesign.

### Phase 7 — Reports
- `src/lib/reports.functions.ts` — `payrollSummary`, `laborCost`, `overtime`, `taxLiability`, `auditTrail`. Server-side aggregation.

### Phase 8 — Security report
At end, post: critical/high/medium/low issues with file refs, plus what's implemented vs deferred (real ACH transfer, real IRS submission, MFA enrollment UI).

---

## Out of scope (explicit)
- Real Plaid/Symmetry/MT API calls (stubs only, env vars not provided).
- Real 941/W-2/1099 IRS submission.
- MFA enrollment UI (Supabase TOTP is available; toggle deferred).
- PDF generation (CSV stays).
- Mobile native (Capacitor stays as-is).

## Expected output
~6 migrations, ~25 new tables, ~40 RLS policies, ~15 server functions, ~8 new/edited routes, ~600 lines payroll engine, ~200 lines provider stubs. Multiple turns may be needed — I'll start with Phase 1 migration now.

Approve to proceed.