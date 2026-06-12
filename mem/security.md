---
name: Security posture
description: Accepted security findings and their rationale; PII storage rules.
type: constraint
---
**Accepted linter warnings (do not re-flag):**
- 0029 `authenticated_security_definer_function_executable` on role-helper functions: required for RLS to work. Each function revokes anon/PUBLIC and scopes by auth.uid().

**PII storage rules:**
- Never store full SSN, full bank account, or full routing number in `public.employees`. Only `*_last4` columns.
- Full SSN / banking belongs in a separate `pii_secrets` table (not yet created) with pgcrypto encryption + access through a server fn that logs reads to `pii_access_log`.
- `audit_events.before/after` must redact `ssn*`, `bank_*`, `tax_id` columns at trigger time before insert.

**Audit log:**
- `audit_events` is append-only (`tg_audit_events_immutable`). Never add UPDATE/DELETE policies.
