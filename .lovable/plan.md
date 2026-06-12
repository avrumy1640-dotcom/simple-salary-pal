## Goal
Walk every admin (`/app/*`) and employee (`/employee/*`) route, click every button, and wire anything stubbed so the app behaves like a real HR/payroll product. Fix the open RLS security finding along the way.

## Approach
This is too large for one turn. I'll work in **batches of 3-5 routes per turn**, fully wiring each batch before moving on. Each batch:

1. Read the route file + any related server functions.
2. Identify every interactive element (button, menu, dialog, form, link).
3. For each one: confirm it calls a real server fn that hits the DB, returns errors with toasts, and refreshes UI. Wire missing pieces.
4. Smoke-test critical flows in the browser preview.
5. Report what was fixed; move to the next batch.

## Batch order (priority = real money / compliance first)

### Admin shell `/app/*`
1. **Form Review** + **HR forms ingest** (you flagged this) — review queue, approve/reject applies to employee, employee gets notification.
2. **Payroll**: `payroll.index`, `payroll.run`, `pay-history`, `pay-on-demand`, `paystubs`, `form-1099`, `tax-filing`, `taxes`, `compliance`.
3. **People**: `employees`, `employees.$id`, `contractors`, `departments`, `onboarding`, `onboarding-templates`, `recruiting`.
4. **Time & schedule**: `time`, `attendance`, `tracking`, `live-map`, `scheduling`, `shift-swaps`, `approvals`, `pto`.
5. **Requests & docs**: `requests`, `expense-requests`, `documents`, `policies`, `announcements`, `notifications`.
6. **Admin/setup**: `settings`, `companies`, `users`, `locations`, `integrations`, `benefits`, `performance`, `reports`, `analytics`, `audit`, `dashboard`, `getting-started`, `self-service`, `ai-assistant`.

### Employee shell `/employee/*`
7. `home`, `paystubs`, `pay-on-demand`, `documents`, `profile`, `benefits`, `pto`, `time`, `punch`, `schedule`, `requests`, `expenses`, `notifications`, `onboarding`, `help`.

### Cross-cutting
8. AppShell / EmployeeShell nav buttons (notification bell, profile menu, company switcher).
9. Auth flows (`auth`, `forgot-password`, `reset-password`).

## Security fix (this turn)
Migration: drop the over-broad `employees_self_update_limited` UPDATE policy. Replace with a column-whitelist policy enforced by a `BEFORE UPDATE` trigger that aborts when an employee self-edits any restricted column (pay, tax, banking, status, employment fields). All sensitive employee changes already route through `employee-self.functions.ts` + `form-review.functions.ts` using the service role, which bypasses RLS — so legitimate flows keep working.

## What I need from you
Just **"go"** and I'll start with Batch 1 (Form Review + the security fix) this turn, then proceed batch by batch. I'll pause after each batch with a short status so you can redirect priorities.

## Out of scope (call out explicitly)
- Real ACH / tax filing transmission (needs Modern Treasury / Symmetry production keys — the integrations exist as stubs).
- Native mobile (Capacitor) builds.
- Email/SMS delivery (currently in-app notifications only).
