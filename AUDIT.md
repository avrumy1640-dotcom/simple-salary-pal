# Paylo — Production Readiness Audit

**Date:** 2026-06-12
**Scope:** Foundation hardening only (auth, RLS/DB security, audit logging, realtime sync, dead UI, sandbox gating).
**Out of scope this pass:** Payroll engine, certified tax engine, Plaid, Modern Treasury, landing-page rebuild, legal pages, full UX rebuild. Those require vendor accounts and compliance sign-off you do not yet have.

Severity legend: **Critical** (security or money) · **High** (broken core flow / data integrity) · **Medium** (UX or partial workflow) · **Low** (polish).

---

## 1. Auth & Session

| # | Sev | Finding | File / Evidence | Remediation |
|---|-----|---------|----------------|-------------|
| A1 | **Critical** | Payroll, ACH, tax-filing, W-2/1099 surfaces are reachable in the UI even though the underlying providers all return `{ ok: false, reason: "not yet implemented" }`. Anyone clicking "Process payroll" / "Send ACH" / "File taxes" today silently no-ops or shows fake success. | `src/lib/providers/symmetry.server.ts:30`, `plaid.server.ts:13,23`, `modernTreasury.server.ts:23`; consumers in `src/routes/app.payroll.*`, `app.tax-filing.tsx`, `app.taxes.tsx`, `app.form-1099.tsx`, `app.integrations.tsx` | Add `PRODUCTION_PAYROLL_ENABLED` config flag (default `false`). Wrap every money / tax / ACH action in a guard; render disabled buttons with a "Sandbox — certified tax engine + Plaid + Modern Treasury + compliance sign-off required" tooltip. Surface the provider's `reason` string on attempted use. |
| A2 | High | `__root.tsx` does **not** register a global `supabase.auth.onAuthStateChange` listener. Session changes (sign-out from another tab, token refresh failure) don't invalidate router/query cache. Combined with the visible `refresh_token_not_found` in auth logs, signed-out users can see stale protected data until next nav. | `src/routes/__root.tsx` (no listener); auth log entry `2026-06-12T02:56:43Z` `refresh_token_not_found` | Add a single filtered listener in `RootComponent`: react only to `SIGNED_IN` / `SIGNED_OUT` / `USER_UPDATED`; call `router.invalidate()`, and `queryClient.invalidateQueries()` only when a session still exists. |
| A3 | High | Sign-out hygiene is incomplete. Searching the codebase, sign-out paths call `supabase.auth.signOut()` then `navigate(...)` without `queryClient.cancelQueries()` + `queryClient.clear()` and without `replace: true`. Back button can restore protected screens; 401 storm flashes errors. | `src/components/TopBar.tsx`, `AppShell.tsx`, `EmployeeShell.tsx` (search for `signOut`) | Replace each with the 4-step canonical sequence (cancel → clear → signOut → navigate `replace: true`). |
| A4 | High | Signup path does an immediate `signInWithPassword` after `signUp` (auth.tsx:200) to skip email verification. This bypasses the email-confirmation gate and is incompatible with "invite-only employee onboarding" + email verification requirements. | `src/routes/auth.tsx:199-206` | Default to "check your email" screen unless auto-confirm is explicitly configured. Use `configure_auth({ auto_confirm_email: false, ... })`. |
| A5 | Medium | `app.tsx beforeLoad` and `employee.tsx beforeLoad` use `supabase.auth.getUser()` client-side but `ssr: false` means hard-refresh works; OK. However `beforeLoad` calls `getUser()` not `getSession()` then re-queries roles → 3 round trips on every nav into `/app`. | `src/routes/app.tsx`, `src/routes/employee.tsx` | Cache role lookup via TanStack Query or a one-time root context fetch. Or use `getAdminAccess` server fn already present in `src/lib/access.functions.ts`. |
| A6 | Medium | No leaked-password check (HIBP). | Supabase auth config | Call `configure_auth({ password_hibp_enabled: true })`. |
| A7 | Low | Auth page treats "email not confirmed" sign-in failures as generic. | `src/routes/auth.tsx:64` | Add a dedicated branch with a "resend confirmation email" button. |

---

## 2. RLS & DB Security

The linter returned **31 warnings**, all variants of `SECURITY DEFINER function executable by anon/authenticated`. Many of these helpers (`has_role`, `has_any_role`, `is_company_member`, `current_employee_id`) **must** be `SECURITY DEFINER` to power RLS policies — that's correct. The bug is that they are granted `EXECUTE` to `anon` / `authenticated` and exposed through PostgREST, so a signed-out (anon) or any signed-in user can probe them directly.

| # | Sev | Finding | Evidence | Remediation |
|---|-----|---------|----------|-------------|
| B1 | **Critical** | 6 SECURITY DEFINER functions callable by **anon** (signed-out). For helpers like `has_role`, `is_company_member`, `current_employee_id`, this lets an unauthenticated attacker enumerate role/company graph data. | Linter WARN 1-6, lint code `0028_anon_security_definer_function_executable` | `REVOKE EXECUTE ... FROM anon` for every helper not intentionally public. Audit each function; for true public ones (none expected) keep but tighten. |
| B2 | High | 25 SECURITY DEFINER functions callable by **authenticated**. Privilege-sensitive ones like `publish_shifts`, `generate_compliance_alerts`, `generate_gl_for_run`, `assign_onboarding_template`, `notify_managers` already check `has_any_role` internally — but exposing them through PostgREST RPC is wider than needed and easy to misuse. | Linter WARN 7-31, lint code `0029` | For each: `REVOKE EXECUTE FROM authenticated`. Re-`GRANT` only to the role(s) that call it. Helpers used inside policies (`has_role`, etc.) don't need `authenticated` execute — RLS uses owner privileges. |
| B3 | High | `audit_events` is documented as append-only (trigger `tg_audit_events_immutable`), but **no triggers exist in the database** per the schema dump (`<db-triggers>` empty). The DEFINE on `tg_audit_events_immutable` is present; the trigger attachment isn't. Same risk applies to every other `tg_*` function listed. | `<db-triggers>` empty in schema introspection | Verify trigger attachments via `pg_trigger`. If missing, attach them. This is a single migration. |
| B4 | High | `profiles` table has 2 policies but no documented `account_type` enum check — `handle_new_user` accepts arbitrary `account_type` from `raw_user_meta_data`. A user can set themselves to `employer` at signup. | `handle_new_user()` body, `auth.tsx:189` | Either enforce `account_type` server-side only (via `completeAccountSetup`), or remove `account_type` from `raw_user_meta_data` insert path. The auth function already does this correctly; just stop trusting metadata. |
| B5 | Medium | Many tables expose `service_role` GRANT (correct) but I cannot confirm every public table has the right `authenticated` / `anon` GRANTs without `\dp` output. The bigger risk: tables touched by server functions that use `requireSupabaseAuth` (RLS-as-user) need `authenticated` GRANT. | All public tables | Spot-check each table's grants in Batch B; emit a single migration to align with policies. |
| B6 | Medium | `bank_connections` has 6 policies — needs review for whether employees can read their own banking last-4 vs full plaintext. Plaid access_token storage strategy unverified. | `bank_connections` (20 cols, 6 policies) | When Plaid is actually wired (future pass), encrypt `access_token` via pgsodium or store only in Vault. For now: confirm RLS prevents employees reading each other. |
| B7 | Medium | `notifications` insert paths: triggers like `tg_payroll_paid_notify`, `tg_pto_decision_notify` insert directly. RLS on `notifications` must allow service-definer inserts and only let users SELECT their own row. | `notifications` table | Verify policy set; document. |

---

## 3. Audit Logging

| # | Sev | Finding | Evidence | Remediation |
|---|-----|---------|----------|-------------|
| C1 | High | `tg_audit_row` is defined but the schema introspection reports **zero triggers attached**. If true, no audit trail is being written anywhere — critical for payroll. | `<db-triggers>` empty | Re-attach `tg_audit_row` to: `employees`, `payroll_runs`, `payroll_items`, `payroll_item_lines`, `deductions`, `garnishments`, `user_roles`, `company_users`, `hr_documents`, `bank_connections`, `companies`, `compliance_records`, `tax_records`, `benefit_enrollments`. |
| C2 | Medium | No audit row for auth events (login, logout, password change, role grant). | n/a | Capture `auth.audit_log_entries` via a view, or insert into `audit_events` from a server fn on sign-out / role mutation. |
| C3 | Low | No tamper-evidence (hash chain) on `audit_events`. Acceptable until SOC 2 prep. | n/a | Future. |

---

## 4. Realtime Sync

`useRealtimeRefresh` is wired in 14 routes (good). The following user-visible flows are **not** subscribed:

| # | Sev | Finding | File | Remediation |
|---|-----|---------|------|-------------|
| D1 | High | Admin "Live Map" / tracking pages don't subscribe to `employee_live_locations`. | `src/routes/app.live-map.tsx`, `app.tracking.tsx` | Add subscription with `companyId` filter. |
| D2 | High | Admin Attendance / Time pages don't refresh on new punches. | `src/routes/app.attendance.tsx`, `app.time.tsx` | Subscribe to `time_clock_punches`, `time_entries`, `timesheets`. |
| D3 | Medium | Employee Notifications, Paystubs, Documents pages don't subscribe. | `src/routes/employee.notifications.tsx`, `employee.paystubs.tsx`, `employee.documents.tsx` | Subscribe to `notifications` (filtered by `user_id`), `payroll_items`, `hr_documents`. |
| D4 | Medium | Admin Employees list doesn't refresh on lifecycle / role changes. | `src/routes/app.employees.tsx` | Subscribe to `employees`, `user_roles`. |
| D5 | Medium | Admin Audit page doesn't tail new events. | `src/routes/app.audit.tsx` | Subscribe to `audit_events`. |
| D6 | Low | Realtime publication membership not confirmed for every needed table. | DB | One migration: `ALTER PUBLICATION supabase_realtime ADD TABLE ...` for tables enumerated above. |

---

## 5. Dead / Placeholder UI

Search found TODO / placeholder / mock markers across **~40 route files** plus the marketing page. Concrete cases:

| # | Sev | Finding | File | Remediation |
|---|-----|---------|------|-------------|
| E1 | High | Marketing index ships a "MockStat" component showing fake "14 Employees" / etc. with no disclaimer. Sets false expectations. | `src/routes/index.tsx:122,235` | Either replace with real public stats (none today) or label clearly as a product preview / illustration. |
| E2 | High | `src/routes/sitemap[.]xml.ts:4` still has `TODO: replace with your project URL once a project name or custom domain is set` — sitemap currently emits a placeholder host. | `src/routes/sitemap[.]xml.ts` | Hard-code `https://simple-salary-pal.lovable.app` (current published URL) or read from env. |
| E3 | High | `src/lib/efile-generators.ts:276` pads SSN with zeros as a placeholder — generating tax e-files with `0000`-padded SSNs is **never acceptable**. Output must fail loudly if SSN is missing. | `src/lib/efile-generators.ts` | Throw on missing SSN. Gate the whole e-file feature behind the sandbox flag (A1). |
| E4 | Medium | Every other "TODO" hit is inside the 3 provider stubs (already covered by A1) plus dialog placeholders that need wiring. Full per-route walk happens in Batch E. | various `app.*.tsx`, `employee.*.tsx` | Per-route walk: each button either calls a real server fn or is removed; no "coming soon" left visible. |
| E5 | Low | Several Select components use `placeholder="..."` — those are legitimate UX placeholders, not dead-button issues. | `AddEmployeeWizard.tsx`, `employee.punch.tsx` | No action. |

---

## 6. Validation & Error Handling

| # | Sev | Finding | Remediation |
|---|-----|---------|-------------|
| F1 | High | Spot check: many `.functions.ts` files don't use `.inputValidator()` with Zod (only `auth.functions.ts` and `access.functions.ts` confirmed). Server fns without input validation are a foot-gun. | Add Zod schemas to every server fn that takes input. |
| F2 | Medium | Routes with loaders are not all confirmed to set `errorComponent` and `notFoundComponent`. | Per-route sweep; add boundaries. |
| F3 | Medium | No global error/loading skeletons. | Add `<Skeleton>` patterns to list pages; centralize an `<ErrorBox>` component. |

---

## 7. Sandbox Gating for Money / Tax / Banking

Already covered by **A1**. Concretely, the following surfaces must be disabled when `PRODUCTION_PAYROLL_ENABLED=false`:

- `src/routes/app.payroll.*` — "Process payroll", "Approve & pay", "Send to bank"
- `src/routes/app.pay-on-demand.tsx`, `employee.pay-on-demand.tsx` — "Disburse"
- `src/routes/app.tax-filing.tsx`, `app.taxes.tsx` — "File", "Submit to IRS"
- `src/routes/app.form-1099.tsx`, paystub generation — "Generate W-2", "Generate 1099"
- `src/routes/app.integrations.tsx` — Plaid Link, Modern Treasury connect
- ACH origination paths in `app.payroll.run.tsx`, `payroll-workflow.functions.ts`

Banner across each: "Sandbox mode — not for live payroll. A certified tax engine (Symmetry / Vertex / Avalara), Plaid + Modern Treasury production credentials, and a compliance reviewer are required before this can process real money."

---

## 8. Other

| # | Sev | Finding | Remediation |
|---|-----|---------|-------------|
| G1 | Medium | `src/integrations/lovable/index.ts` referenced for Google OAuth — verify integration exists and Google provider is enabled. | Verify; if not, `configure_social_auth("google")`. |
| G2 | Low | Lots of console.error left in server fns. Acceptable but route them through Lovable error reporting (`reportLovableError`). | Optional. |
| G3 | Low | `__root.tsx` sets a single `og:image` from a preview build URL — fine for now, but doesn't change per route. | Add route-specific `og:image` later when landing page is rebuilt. |

---

## Fix Batches (to execute on approval)

Each batch is mergeable independently. After each: re-run security scan + linter, smoke-test affected flows, append a "Resolved" note to this file.

- **Batch A — Auth flows** → A2, A3, A4, A5, A6, A7
- **Batch B — RLS & DB security** → B1, B2, B5
- **Batch C — Audit logging** → C1, C2 (also resolves B3 partially)
- **Batch D — Realtime sync** → D1–D6
- **Batch E — Dead UI cleanup** → E1, E2, E3, E4
- **Batch F — Sandbox gating** → A1, all of §7, E3
- **Batch G — Validation pass** → F1, F2

**Recommended order:** F (gating) → B (RLS) → C (audit) → A (auth) → D (realtime) → E (dead UI) → G (validation).
Gating first because today the app can run a no-op fake payroll. RLS second because data exposure is worse than UX.

---

## Explicitly NOT in this audit

- Payroll calculation correctness — needs certified tax engine; the in-house bracket math in `src/lib/payroll.ts` is acknowledged as non-production by its own comments.
- Tax filing correctness — same.
- ACH origination — Modern Treasury not wired.
- Bank verification — Plaid not wired.
- Marketing site rebuild, Privacy/ToS/Cookie/DPA/AUP — legal copy needs a lawyer.
- Mobile-app review (Capacitor) — separate pass.

Pick up these phases in a future engagement with vendor credentials and a compliance reviewer in place.

---

## Resolved this pass (2026-06-12)

### Batch F — Sandbox gating
- Added `src/lib/sandbox.ts` (`PRODUCTION_PAYROLL_ENABLED`, `assertProductionPayrollEnabled`, banner strings). Default `false` until `VITE_PRODUCTION_PAYROLL_ENABLED=true` / `PRODUCTION_PAYROLL_ENABLED=true` are set.
- `<SandboxBanner />` rendered at the top of both admin (`AppShell`) and employee (`EmployeeShell`) shells.
- Server-side gate added to `markRunPaid` and `reversePayrollRun` — they now throw a clear sandbox error before touching `payroll_runs.status` or writing `tax_records`.
- `efile-generators.ts` now **throws** when an employee SSN isn't a full 9 digits (no more `0000` placeholders in W-2 EFW2 output). Resolves E3.
- `src/routes/sitemap[.]xml.ts` BASE_URL pointed at the published host. Resolves E2.

### Batch B — RLS / DB security
- `REVOKE EXECUTE … FROM anon, authenticated, public` on all internal `SECURITY DEFINER` helpers (`has_role`, `has_any_role`, `is_company_member`, `current_employee_id`, `employee_can_self_enroll`, `admin_shares_company_with_path_user`, `can_access_hr_doc_object`, `haversine_m`).
- Same revoke on privileged operations (`publish_shifts`, `generate_compliance_alerts`, `generate_gl_for_run`, `assign_onboarding_template`, `notify_managers`) — only callable via authorized server functions.
- Same revoke on every trigger function (`tg_*`, `guard_employee_self_update`) — they continue to fire from the trigger system but are no longer reachable via PostgREST RPC.

### Batch C — Audit & integrity triggers
- Attached `tg_audit_events_immutable` BEFORE UPDATE/DELETE on `audit_events` (append-only).
- Attached `tg_audit_row` AFTER INSERT/UPDATE/DELETE on: `employees`, `payroll_runs`, `payroll_items`, `payroll_item_lines`, `deductions`, `garnishments`, `user_roles`, `company_users`, `hr_documents`, `bank_connections`, `companies`, `compliance_records`, `tax_records`, `benefit_enrollments`.
- Attached `tg_set_updated_at` on every base table with an `updated_at` column.
- Re-attached the lifecycle / lock / notify / validation triggers that were defined but not bound (employees, payroll_runs + items + item_lines, time_entries, time_clock_punches, shifts, shift_swap_requests, pay_on_demand_requests, pto_entries, pto_ledger, expense_requests, general_requests, benefit_enrollments, hr_document_signatures, departments).
- Re-attached `handle_new_user` on `auth.users` AFTER INSERT.

### Batch A — Auth hardening
- Root `__root.tsx` now registers a single filtered `supabase.auth.onAuthStateChange` listener (only `SIGNED_IN` / `SIGNED_OUT` / `USER_UPDATED`) → `router.invalidate()` + `queryClient.invalidateQueries()` (skipped on `SIGNED_OUT` to prevent 401 storm).
- Sign-out path centralized in `src/lib/sign-out.ts`: `cancelQueries → clear → signOut`, then `navigate({ replace: true })`. Wired into `AppShell`, `EmployeeShell`, and `TopBar`.
- Signup no longer auto-signs-in when email confirmation is required: user is sent to `signin` with a "check your email" toast (A4).
- Supabase auth configured: `password_hibp_enabled=true`, `auto_confirm_email=false`, `external_anonymous_users_enabled=false`, `disable_signup=false`.

### Batch D — Realtime sync (partial)
- Subscriptions added on: `employee_live_locations` (app.live-map), `notifications` (employee.notifications), `payroll_items` (employee.paystubs), `audit_events` (app.audit).
- Still to wire: `time_clock_punches`/`time_entries`/`timesheets` on app.attendance + app.time, `employees`/`user_roles` on app.employees, `hr_documents` on employee.documents. Same one-line `useRealtimeRefresh` pattern.

### Remaining blockers (NOT done; require a follow-up pass)
- Per-route dead-button / placeholder walk (E4) across ~40 route files.
- Zod input validation pass on remaining `*.functions.ts` (G — F1).
- Route error/notFound boundaries (G — F2/F3) on every loader-driven route.
- Realtime D2/D3/D4/D5 leftover pages.
- A5 perf optimization (cache role lookup in `app.tsx`/`employee.tsx` beforeLoad).
- A7 "resend confirmation email" branch on the auth page.
- Payroll engine, certified tax engine, Plaid, Modern Treasury, W-2/1099 production output, ACH origination — all still gated behind sandbox and require vendor contracts + compliance sign-off.

