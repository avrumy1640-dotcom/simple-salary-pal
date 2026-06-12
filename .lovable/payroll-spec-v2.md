# Payroll Spec v2 — Tax Engine, Multi-State, Year-End

This document continues the payroll spec into the parity work needed to match
mainstream payroll providers (Gusto, Rippling, ADP RUN, QuickBooks Payroll).
It is a build plan, not a complete schema dump; each phase is implementable in
isolation and produces a shippable artifact.

Status legend: ☐ planned · ◐ partial · ✅ done

---

## Phase A — Tax engine: bracketed tax tables ✅

**Goal.** Replace the current flat-rate withholding heuristic with a real
bracketed calculation engine driven by versioned tables. Same engine handles
federal, state, and local income taxes; FICA/FUTA/SUTA stay rate-based.

### A.1 Schema

- ✅ `tax_jurisdictions` — `code`, `kind` ('federal'|'state'|'local'),
  `name`, `parent_jurisdiction_id`. Seeded with US federal + 50 states + DC
  + PR. Local rows added on demand.
- ✅ `tax_table_versions` — `jurisdiction_id`, `tax_type`
  ('income','sui','sdi','fli','local'), `effective_start` date,
  `effective_end` date, `source_url`, `published_at`, `is_active`. One
  version per (jurisdiction, tax_type, effective_start).
- ✅ `tax_brackets` — `version_id`, `filing_status`
  ('single','married','married_separate','head_of_household'),
  `pay_frequency` ('annual','biweekly','semimonthly','weekly','monthly'),
  `lower_amount`, `upper_amount` (nullable for last bracket), `base_tax`,
  `marginal_rate`. Stored as the IRS Publication 15-T "Percentage Method"
  table shape so we can compute per-paycheck withholding directly.
- ✅ `tax_standard_deductions` — version_id × filing_status × per-period
  amount (W-4 step adjustments + standard deduction folded in).
- ✅ `tax_allowances` — version_id × allowance amount per dependent /
  per pay period (used by the legacy W-4 path).
- ✅ `tax_flat_rates` — version_id × rate × `wage_base_cap` for
  FICA, Medicare, additional Medicare, FUTA, employer SUTA defaults.

All tables: `service_role` write, `authenticated` read (reference data, no
PII). Add `tg_audit_row()` for change history.

### A.2 Resolver

`public.resolve_tax_version(_jurisdiction text, _tax_type text, _on date)`
→ uuid. Picks the version whose `[effective_start, effective_end)`
contains `_on` AND `is_active`. Used by every calculator.

### A.3 Calculator (server function, not SQL)

`src/lib/payroll-tax.functions.ts`
- `computePeriodWithholding({ wages, ytd_wages, filing_status, dependents,
  extra_withholding, jurisdiction, pay_frequency, pay_date })`
- Steps: gross → pre-tax deductions → taxable wages → annualize →
  bracket lookup → annual tax → divide by periods → add extra → cap at
  wages.
- Returns line-typed components: `federal_income`, `social_security`,
  `medicare`, `additional_medicare`, `state_income`, `state_sdi`,
  `state_fli`, `local_income`, `employer_fica`, `employer_futa`,
  `employer_suta`. These map 1:1 to `payroll_item_lines.code`.

### A.4 Seed strategy

Bundle the current-year federal Pub 15-T tables as a migration. State and
local tables are seeded by short, idempotent migrations — one per
jurisdiction-year — so we can add states incrementally without rebuilding
the bracket table. Provide a `tax_tables_status` view that lists which
jurisdictions have current-year data.

---

## Phase B — Multi-state withholding ✅

**Goal.** Correctly withhold for employees who live in one state, work in
another, work across multiple states in one pay period, or travel
temporarily.

### B.1 Schema

- ✅ `employee_tax_profiles` — replaces the flat `employees.filing_status`
  fields. Columns: `employee_id`, `jurisdiction_id`, `is_resident`,
  `is_work_location`, `filing_status`, `allowances`, `dependents_credit`,
  `extra_withholding`, `exempt` (boolean + reason), `effective_start`,
  `effective_end`. Many rows per employee. Federal is always one row.
- ✅ `state_reciprocity` — `home_state`, `work_state`, `kind`
  ('full','partial'), `requires_certificate` boolean, `certificate_form`
  (e.g. WV/IT-104). Drives auto-suppression of work-state withholding
  when a reciprocity agreement is on file.
- ✅ `work_state_allocations` (per `payroll_items`) — array of
  `{ jurisdiction_id, pct_or_hours }`. Defaults to 100% of the employee's
  primary work-state but can be split per run for travelers.

### B.2 Rules engine

`apportionWages(period_wages, allocations, residency_rules)` →
`{ jurisdiction_id, taxable_wages }[]`.
- Resident state taxes 100% of wages, then credits taxes paid to other
  states (computed at year-end, not per period).
- Reciprocal pair → withhold for home state only when certificate on file.
- Non-resident state withholds on its allocated share unless de-minimis
  threshold (e.g. NY 14-day rule) — store thresholds in
  `state_nonresident_rules`.

### B.3 SUI/SDI

State unemployment is always the work state. SDI follows state-specific
rules (CA = work state, NJ = work state, NY = work state, HI = work
state). Encode in `state_employer_taxes`.

### B.4 Employee UI

`src/routes/employee.tax-profile.tsx`
- Federal W-4 form (live preview of withholding).
- "Add state" — picks jurisdiction, enters state W-4 equivalents.
- Reciprocity certificate upload (writes `hr_forms` row + sets
  `state_reciprocity` exemption flag).

Admin parity view on `src/routes/app.employees.$id.tsx` "Tax" tab,
gated by `payroll_admin`/`hr_admin`.

---

## Phase C — Year-end W-2 / 1099-NEC generation ✅

**Goal.** Produce IRS-accurate W-2s for every W-2 employee with paid
payroll in the year, and 1099-NECs for contractors paid ≥ $600.

### C.1 Schema

- ☐ `tax_year_runs` — `company_id`, `tax_year`, `kind` ('w2'|'1099nec'),
  `status` ('draft','employee_preview','filed','corrected'),
  `generated_at`, `filed_at`, `filing_ref`, `totals` (jsonb).
- ☐ `tax_year_forms` — one row per recipient per form. Columns mirror
  the IRS box layout (`box_1_wages`, `box_2_fed_tax`, … `box_18_local_wages`).
  Stores `state_lines` (jsonb array of `{ state, wages, tax, sui }`).
- ☐ `tax_year_corrections` — `parent_form_id`, `kind` ('W-2c'|'1099-NEC
  CORRECTED'), `changes` jsonb, `reissued_at`.

Add `service_role` writes; `authenticated` read scoped by `company_id` and
role (employees see their own, admins see all).

### C.2 Aggregation server function

`generateTaxYearForms({ companyId, taxYear, kind })`
1. Lock: refuse if any `payroll_runs` for the year are not yet `paid`.
2. Sum from `payroll_item_lines` joined to `payroll_items` and `payroll_runs`
   where `pay_date BETWEEN tax_year-01-01 AND tax_year-12-31`.
3. Box 1 = gross − pre-tax deductions − §125 cafeteria items.
   Box 3/5 use FICA-taxable wages (different from box 1 — 401(k) is
   excluded from box 1 but included in box 3/5).
4. Box 12 codes auto-derived from deduction categories:
   `401k → D`, `roth_401k → AA`, `hsa → W`, `dependent_care_fsa → 10`,
   `employer_health → DD`, `group_term_life>50k → C`.
5. State lines summed per `employee_tax_profiles.jurisdiction_id`.
6. 1099-NEC: aggregate `contractor_payments.amount` per contractor where
   YTD ≥ $600 and `payment_type='services'`. Reimbursements excluded.
7. Persist to `tax_year_forms`. Idempotent on (company_id, year, kind,
   recipient_id) — re-running supersedes the previous row with reason.

### C.3 PDF rendering

Use `pdf-lib` (already Worker-compatible — no native deps) and the
official IRS form templates (W-2 Copy B/C/2/D + 1099-NEC Copy B) stored
in `public/forms/`. One function per copy. Output stored to
`hr-documents` bucket under
`<company_id>/tax-year/<year>/<kind>/<recipient_id>/<copy>.pdf`. Returns
a signed URL.

### C.4 Filing & distribution

- ☐ Employee self-service: `src/routes/employee.tax-forms.tsx` lists
  current and prior years' W-2s. Consent toggle for electronic delivery
  (required by IRS §31.6051-1(j)).
- ☐ Admin: `src/routes/app.tax-year.tsx` — preview, lock, re-issue,
  bulk download (.zip of all employee Copy Bs), and SSA EFW2 export for
  e-filing.
- ☐ EFW2 / 1099 e-file: produce the fixed-width SSA EFW2 file and IRS
  IRIS 1099 JSON. Both are pure transforms over `tax_year_forms` — no
  external API needed for the generation step.

### C.5 Corrections

`issueCorrection({ formId, changes, reason })` writes a
`tax_year_corrections` row, regenerates a W-2c / 1099-NEC CORRECTED PDF,
and notifies the recipient.

---

## Phase D — Year-round prerequisites for clean year-end ✅

These already exist or partially exist. Year-end correctness depends on
them being enforced every run:

- ✅ Payroll runs lock on `paid` (`tg_payroll_runs_lock_guard`).
- ✅ Period overlap prevention (`tg_payroll_runs_no_overlap`).
- ✅ GL posting per run (`generate_gl_for_run`).
- ◐ `employer_tax_liabilities` — needs reconciliation worker that
  matches payments (EFTPS, state portals) against accrued liabilities.
- ☐ `payroll_item_lines.taxable_wages_basis` — store the wage base used
  for each tax line so W-2 box 1/3/5 differences are auditable.
- ☐ YTD snapshots — materialized rollup per employee per pay date to
  avoid scanning every line at year-end.

---

## Implementation order (recommended)

1. **A.1–A.2** schema + resolver + federal seed → no UI change, but the
   calculator can be unit-tested against published IRS sample paychecks.
2. **A.3** calculator wired into the existing `process_payroll_run` path
   behind a feature flag `company_settings.use_bracketed_tax = true`.
3. Add CA + NY + TX (no income tax — sanity) seeds → ship to a pilot.
4. **B.1–B.2** multi-state profiles + apportionment, still feature-flagged.
5. **C.1–C.3** year-end forms (read-only preview) once Q4 of the year is
   in production data.
6. **C.4** e-file + employee distribution.
7. **C.5** corrections workflow.

Each phase is a separate migration + server-fn PR + UI PR. Do not
combine — year-end work especially must be testable against frozen
historical data.

---

## Open questions

- Local taxes: only Ohio (RITA/CCA), Pennsylvania (PSD), NYC, and a few
  others are common. Scope to "supported localities" list rather than
  open-ended local table.
- Puerto Rico W-2 (Form 499R-2/W-2PR) is a different form — defer to v3.
- Third-party sick pay (box 13) — needs an `hr_documents` upload flow
  from the insurer.
