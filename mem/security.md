---
name: Security posture
description: Accepted security findings and their rationale; PII storage rules.
type: constraint
---
**Accepted linter warnings (do not re-flag):**
- 0029 `authenticated_security_definer_function_executable` on role-helper functions: required for RLS to work. Each function revokes anon/PUBLIC and scopes by auth.uid().
- 0008 `rls_enabled_no_policy` on `public.pii_secrets`: INTENTIONAL. The vault has zero authenticated policies. Only `service_role` accesses ciphertext, exclusively through server fns in `src/lib/pii-vault.functions.ts`.

**PII storage rules:**
- Full SSN, full bank account, full routing number, tax ID, etc. live ONLY in `pii_secrets` (AES-256-GCM, key in `PII_VAULT_KEY` env var, never in DB).
- `employees` and `direct_deposit_accounts` keep `*_last4` mirrors for display.
- Every plaintext read goes through `revealEmployeePii` (requires owner/admin/payroll_admin/hr_admin + a reason string) and writes a row to `pii_access_log`.
- Writes (`setEmployeePii`) and deletes (`deleteEmployeePii`) are also audited. Denied attempts are logged as `attempt_denied`.
- `audit_events.before/after` triggers must redact `ssn*`, `bank_*`, `tax_id` fields if those ever appear on watched tables (currently they don't — only last4 mirrors exist).

**Audit logs:**
- `audit_events` is append-only (`tg_audit_events_immutable`).
- `pii_access_log` is append-only (`tg_pii_log_immutable`). Readable by owner/admin/auditor.
