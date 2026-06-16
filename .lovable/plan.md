## Goal
A unified, dismissible onboarding checklist on `/employee/home` and `/app/dashboard` that mixes HR tasks with product setup, shows a progress bar, and includes a "Walk me through it" button that opens each step in sequence with a contextual tip card.

## What you'll see

```text
┌───────────────────────────────────────────────────────────────┐
│ Get started with Paylo                            3 of 7 done │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  43%               │
│                                                               │
│ ▶ Walk me through it           Dismiss checklist              │
│                                                               │
│ ✓ Sign your W-4                                               │
│ ✓ Sign your I-9                                               │
│ ✓ Add direct deposit                                          │
│ ○ Submit your first time punch        → Open                  │
│ ○ Request time off (try it)           → Open                  │
│ ○ Review your first paystub           → Open                  │
│ ○ Take the product tour               → Start                 │
└───────────────────────────────────────────────────────────────┘
```

During the walkthrough a small floating card appears on the destination page:
"Step 4 of 7 — Submit your first time punch. Tap **Punch in** when you're ready. → Next step / Skip / Close tour."

## Data layer

New table `user_onboarding_progress` (per user, per company, per step):
- `user_id`, `company_id`, `step_key` (text), `completed_at`, `dismissed_at`
- Composite primary key `(user_id, company_id, step_key)`
- RLS: users read/write only their own rows; managers can read their team's for visibility (optional, default off)
- A separate `checklist_dismissed_at` column on the same table via a special `step_key = '__checklist__'` row keeps it simple — no schema sprawl

## Step catalog (in code, not DB — easy to evolve)

**Employee steps** (`src/lib/onboarding-checklist.ts`):
1. `sign_w4` — auto-complete when `hr_forms` row for w4 = signed
2. `sign_i9` — auto-complete when i9 = signed
3. `direct_deposit` — auto-complete when `direct_deposit_accounts` row exists
4. `emergency_contact` — auto-complete when `emergency_contacts` row exists
5. `first_punch` — auto-complete when any `time_clock_punches` row exists for this employee
6. `view_paystub` — manual: marked done when user visits `/employee/paystubs` with at least one paystub
7. `take_tour` — manual: completed at end of walkthrough

**Manager/admin steps**:
1. `company_profile` — auto-complete when `companies.legal_name` and tax IDs are set
2. `add_employee` — auto-complete when any employee in `employees` (besides themselves)
3. `pay_schedule` — auto-complete when `pay_schedules` row exists
4. `tax_setup` — auto-complete when `employee_tax_profiles` or `state_employer_taxes` set
5. `run_first_payroll` — auto-complete when any `payroll_runs` row in 'paid' status
6. `invite_team` — auto-complete when 2+ `user_roles` rows for the company
7. `take_tour` — manual

Auto-detection runs on mount: a single server fn `getOnboardingChecklist` returns each step's status (`done` / `pending`) by querying the relevant tables, merged with the user's saved row.

## Walkthrough flow

1. User clicks **Walk me through it**.
2. Tour state lives in a small Zustand store (`useOnboardingTour`) with `{ active, stepIndex, steps }`.
3. For each pending step, router navigates to its destination (e.g. `/employee/punch`).
4. A floating `<OnboardingTourCard />` (portaled, fixed bottom-right) shows the title, hint text, and Next / Skip / Close buttons.
5. "Next" advances; "Skip" marks the step `dismissed_at`; "Close tour" stops without losing progress.
6. When the user actually performs the action (e.g. submits a punch), the next mount of the checklist auto-detects it and re-syncs.

## Files

**New**
- `supabase/migrations/...sql` — `user_onboarding_progress` table + RLS + grants
- `src/lib/onboarding-checklist.ts` — step catalog (titles, hints, destination routes, auto-detect predicates)
- `src/lib/onboarding-checklist.functions.ts` — `getOnboardingChecklist`, `markChecklistStep`, `dismissChecklist` server fns
- `src/components/OnboardingChecklist.tsx` — card UI with progress bar
- `src/components/OnboardingTourCard.tsx` — floating walkthrough card
- `src/hooks/useOnboardingTour.ts` — Zustand store + helpers

**Edited**
- `src/routes/employee.home.tsx` — mount `<OnboardingChecklist scope="employee" />` near top
- `src/routes/app.dashboard.tsx` — mount `<OnboardingChecklist scope="manager" />`
- `src/routes/__root.tsx` — mount `<OnboardingTourCard />` once so it can appear on any route

## Out of scope (for this pass)
- No DOM-element spotlighting / arrow overlays — the floating card with a text hint covers 90% of the value without a library like Shepherd.js.
- Manager visibility into team checklists (already covered by `app.onboarding` HR task view).