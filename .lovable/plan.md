## Scope for this pass

Based on your answers:

- **Focus**: Foundation hardening only.
- **No vendor credentials yet** → payroll engine, certified tax provider, Plaid, Modern Treasury are **out of scope**. I will keep those modules behind a clearly labeled "Sandbox / not for real payroll" flag and refuse to wire real money movement.
- **No compliance officer signed off yet** → real-money / real-tax features stay disabled. The app will be safe to demo, not to run a real payroll.
- **Audit delivery**: `AUDIT.md` in repo **and** tracker tasks for High/Critical findings.

Phases 5–7 (payroll, tax, banking), 11 (marketing/legal pages), and most of 12 (UX rebuild) are explicitly **deferred** to later passes. Trying to do them now would just create another layer of plausible-looking scaffolding, which is what you're asking me to stop doing.

---

## Step 1 — Written audit (no code changes)

I produce `AUDIT.md` at the repo root with a categorized list of findings. Each entry has: severity (Critical / High / Medium / Low), file:line, what's broken, and a one-line remediation. Categories:

1. **Auth & session** — signup/login/reset/verify/logout flows, role bootstrapping, session refresh behavior, the `refresh_token_not_found` errors already in the auth logs.
2. **RLS & DB security** — the 31 linter warnings (SECURITY DEFINER functions exposed to `anon`/`authenticated`), tables missing policies, overly permissive policies, missing GRANTs, audit-log coverage gaps.
3. **Dead / placeholder UI** — buttons without handlers, dialogs that don't persist, TODO/placeholder/mock markers across ~40 route files already detected.
4. **Realtime sync gaps** — pages that should subscribe via `useRealtimeRefresh` but don't (admin approvals, employee status, punches, PTO, expenses).
5. **Validation & error handling** — server functions missing Zod validators, forms without inline errors, missing loading/empty/error states.
6. **Money / tax / banking surfaces that pretend to work** — every place that displays a calculated paycheck, tax line, ACH status, or filing status from the stub engine. These get a visible "Sandbox — not certified" banner and the actual "Run payroll for real" / "Send ACH" / "File taxes" actions get disabled.
7. **Misc** — sign-out hygiene (`queryClient.clear`, `replace: true`), `__root.tsx` `onAuthStateChange` filtering, public route loaders accidentally calling protected server fns.

Same findings, mirrored into the task tracker for the High/Critical items so you can check them off.

**You review `AUDIT.md` and approve which batches to fix.** Nothing in Step 2 happens before that.

---

## Step 2 — Fix batches (only what you approve)

Each batch is scoped, mergeable on its own, and verified before I claim it's done.

- **Batch A — Auth flows**: rebuild login/signup/reset/verify on top of the existing `auth.tsx` + `completeAccountSetup`. Add email verification gate, harden `handle_new_user` race conditions, fix sign-out hygiene, filter `onAuthStateChange` in `__root.tsx`, add `/reset-password` if missing.
- **Batch B — RLS & DB security**: lock down every `SECURITY DEFINER` function the linter flagged (REVOKE from `anon`/`authenticated` where appropriate, or switch to `SECURITY INVOKER`), tighten policies that currently overshare, ensure every public table has GRANTs that match its policies.
- **Batch C — Audit logging**: confirm `tg_audit_row` is attached to every sensitive table (employees, payroll_runs, payroll_items, deductions, garnishments, user_roles, company_users, hr_documents, bank_connections); add where missing. Add login/logout/role-change events.
- **Batch D — Realtime sync**: wire `useRealtimeRefresh` into admin Approvals, Attendance, Live Map, PTO, Expenses, Shift Swaps, Onboarding, and employee Schedule / Paystubs / Notifications. Verify Postgres CDC is enabled on those tables.
- **Batch E — Dead UI cleanup**: walk every route file with TODO/placeholder markers, either wire the button to a real server fn or remove it. No "coming soon" left visible.
- **Batch F — Sandbox gating for money/tax/banking**: feature flag `PRODUCTION_PAYROLL_ENABLED=false`. When off: payroll run, ACH send, tax filing, 1099/W-2 generation buttons are disabled with a tooltip explaining what's missing (certified tax engine + Plaid + MT + compliance sign-off). Stub adapters in `src/lib/providers/*.server.ts` already return `{ ok: false, reason: ... }` — surface that to the UI instead of pretending it worked.

Each batch ends with: build passes, security scan re-run, manual smoke on the affected flows, short note in `AUDIT.md` of what's now resolved.

---

## What I am NOT doing this pass

- **Not** building the payroll engine, tax engine, Plaid, or Modern Treasury integrations. Those require vendor accounts you don't have and compliance sign-off you don't have. I will not ship a fake one and call it production-ready.
- **Not** rebuilding the landing page or writing Privacy / ToS / Cookie / DPA / AUP pages. Legal copy needs a lawyer, not an LLM.
- **Not** doing a full UI/UX rebuild. Targeted fixes to dead buttons and missing states only.
- **Not** adding W-2 / 1099 generation, year-end processing, or any IRS-facing output.

When you have vendor contracts + a compliance reviewer lined up, we open a new pass scoped to Phases 5–7 with their credentials provided up front.

---

## Deliverables at end of this pass

- `AUDIT.md` committed at repo root.
- Tracker populated with High/Critical findings.
- Whichever fix batches you approve, merged and verified.
- Short closing report listing: what was fixed, DB migrations applied, RLS changes, remaining blockers (which will still be most of Phases 5–7, by design).

If this scope is right, approve and I'll start with Step 1 (the audit) — no code changes until you've read it.