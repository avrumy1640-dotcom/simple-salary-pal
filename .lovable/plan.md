# Role-Based Access & Separate Portals

Build a proper split between **admin/management** and **employee** experiences, with role-gated navigation everywhere.

## 1. Roles model (already in DB)

Existing `user_roles` table + `has_role` / `has_any_role` functions cover: `owner`, `admin`, `hr_admin`, `payroll_admin`, `manager`, `employee`.

Define UI role groups:
- **Admins**: `owner`, `admin`, `hr_admin`, `payroll_admin`
- **Managers**: `manager` (team-scoped views)
- **Employees**: `employee` (self-service only)

Add a tiny helper `src/lib/roles.ts` exposing `isAdmin(role)`, `isManager(role)`, `isEmployee(role)`, and a `useRole()` hook that loads the current user's role for their active company.

## 2. Routing split

Two parallel route trees under the existing `/app` shell:

```text
/app/...           → admin & manager console (existing routes)
/employee/...      → employee self-service portal (new, separate shell)
```

- New layout `src/routes/employee.tsx` → `EmployeeShell` (lighter sidebar, employee branding).
- New employee routes:
  - `/employee/home` — greeting, next payday, PTO balance, recent pay stubs
  - `/employee/paystubs` — pay stub history + downloads
  - `/employee/pto` — request time off, view balance/history
  - `/employee/time` — clock in/out, view timesheets
  - `/employee/profile` — personal info, tax forms, direct deposit
  - `/employee/documents` — handbook, signed forms
  - `/employee/benefits` — enrolled plans (read-only)
- Auth landing logic in `/auth`:
  - After sign-in, fetch role.
  - Admin/manager → `/app/dashboard`
  - Employee → `/employee/home`
- Add a "Switch view" link in `TopBar` for admins (preview employee portal). Employees never see a switch.

## 3. Role-gated admin sidebar

In `AppShell.tsx`, tag each nav item with `allowedRoles`:
- Dashboard, Employees, Reports, Settings, Companies, Audit log, Integrations → admins only
- Payroll, Pay schedules, Tax filing, 1099 → `owner`, `admin`, `payroll_admin`
- Recruiting, Onboarding, Onboarding templates, Performance, Compliance, Benefits, Announcements, Documents → `owner`, `admin`, `hr_admin`
- Time tracking, Location & field, Scheduling → admins + `manager`
- AI Assistant, Analytics → admins
- Managers see a trimmed sidebar (their team's time, scheduling, performance)
- If an employee somehow lands on `/app/*`, redirect to `/employee/home`

Filter `nav` array by `role` before rendering. Also guard each `/app/*` route via a small `beforeLoad`-style check in the shell (redirect employees out).

## 4. Dedicated admin console additions

New `/app/users` (admin-only) page for user & role management:
- List company users (joins `company_users` + `profiles` + `user_roles`)
- Invite teammate (email + role) — stub UI, uses existing Supabase invite if available
- Change role (dropdown: owner/admin/hr_admin/payroll_admin/manager/employee)
- Remove user from company
- All mutations go through a `createServerFn` with `requireSupabaseAuth` + `has_role(..., 'owner'|'admin')` check, using `supabaseAdmin` to write `user_roles` (since clients can't insert/update there per the security migration).

Add "Users & Roles" to the admin sidebar.

## 5. Employee portal shell

New `src/components/EmployeeShell.tsx`:
- Compact sidebar: Home, Pay, Time off, Time clock, Benefits, Documents, Profile
- Top bar shows employee name + company, "Sign out"
- Reuses existing design tokens; no admin chrome

Most pages can wrap existing self-service widgets already built in `app.self-service.tsx`, `app.paystubs.tsx`, `app.pto.tsx`, `app.pay-history.tsx` — split into reusable components and mount under both trees where appropriate (employee version is always scoped to `auth.uid()`).

## 6. Data scoping

- All employee-portal queries filter by `employees.user_id = auth.uid()` (or equivalent). RLS already restricts sensitive tables to admins; employee-portal pages will use views/queries already permitted (own paystubs, own PTO, own punches).
- No new RLS changes needed for v1 — existing admin-only policies on garnishments, timesheets, pto_ledger, handbook_acknowledgments remain correct.

## 7. Out of scope (v1)

- Separate subdomain (`employee.yourdomain.com`) — both portals run on the same app for now; can be added later via a domain rule.
- Email invitations with magic-link onboarding — stub the invite UI; wire to real invite flow later.
- Manager approval workflows (PTO approvals, timesheet approvals) — sidebar entry only, full UI later.

## Technical details

- New files: `src/lib/roles.ts`, `src/components/EmployeeShell.tsx`, `src/routes/employee.tsx`, `src/routes/employee.home.tsx`, `src/routes/employee.paystubs.tsx`, `src/routes/employee.pto.tsx`, `src/routes/employee.time.tsx`, `src/routes/employee.profile.tsx`, `src/routes/employee.documents.tsx`, `src/routes/employee.benefits.tsx`, `src/routes/app.users.tsx`, `src/lib/user-management.functions.ts`.
- Edits: `src/components/AppShell.tsx` (role filter + employee redirect), `src/routes/auth.tsx` (post-login role-based redirect), `src/components/TopBar.tsx` (admin "switch view" link).
- `src/lib/user-management.functions.ts` uses `requireSupabaseAuth`, verifies caller has `owner`/`admin` role via `has_role`, then uses `supabaseAdmin` (loaded inside handler) to mutate `user_roles`.
