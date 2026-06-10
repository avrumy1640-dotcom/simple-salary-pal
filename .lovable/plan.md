# Redesign Plan: Employees, Payroll, Time Tracking

This is a very large redesign — three full pages plus wizards, an employee profile page, and the employee clock-in widget. To keep quality high and avoid one giant unreviewable change, I'll ship it in **three phases**, one prompt per phase. Each phase is independently usable. All existing data, queries, and features are preserved — only JSX, layout, and styling change.

## Shared design system (already established on the dashboard)
- White surfaces, hairline borders, generous spacing
- Inter Tight display / Inter body / JetBrains Mono numerics
- Tabular `unit-num` figures, `unit-in` fade-in animation
- Soft gradient hero banner with KPIs + primary CTA
- Stat cards with optional tone (amber/red) for urgency
- Pill badges, status chips, ghost+primary button pair
- shadcn `Tabs`, `Popover`, `DropdownMenu`, `Dialog` consistently styled

No new design tokens needed — reuse what's in `src/styles.css` from the dashboard pass.

---

## Phase 1 — Employees (`/app/employees`)

**Scope**
1. Redesigned `app.employees.tsx` list view:
   - Header: "Employees" title + count pill + primary "Add Employee" CTA
   - 5 stat chips: Active / Inactive / W-2 / 1099 / New this month
   - Search + 3 filter dropdowns (Department, Status, Type) — instant filtering
   - Table with 64px rows, avatar+initials, colored dept pills, type chip, pay rate, status chip, start date, 3-dot actions menu
   - Row hover = subtle accent bg + left accent border
   - Row click → employee profile route
2. New route `app.employees.$id.tsx` — full profile page:
   - Profile header card (80px avatar, name, role, badges, 3 quick stats)
   - Tabs: Personal / Job / Pay / Documents / Time Off / Activity Log
   - Inline Edit mode on Personal, Job, Pay tabs
   - Documents grid + Upload modal
   - PTO progress bars + history table
   - Activity timeline (read from existing audit/activity data, empty state if none)
3. New `AddEmployeeWizard` component (full-screen dialog) — 5 steps with progress bar, Back/Next, review step, success screen

**Data**
- Reuses existing `employees`, `pto_entries`, `documents` tables and queries
- No schema changes
- If `documents` or `activity_log` tables don't exist for an employee, tabs show empty states — no breakage

## Phase 2 — Payroll (`/app/payroll`)

**Scope**
1. Redesigned page: header with 2 CTAs, 4 stat cards, Upcoming Payroll Runs card, Payroll History table with expandable rows
2. New `RunPayrollWizard` — 6 steps: period → employees → hours/earnings → tax breakdown (with donut) → approve (checkbox + big button) → success screen
3. Expanded-row employee breakdown + paystub PDF preview modal

**Data**
- Reuses `payroll_runs`, `payroll_items` (existing). No schema change.

## Phase 3 — Time Tracking (`/app/time`) + Employee Clock Widget

**Scope**
1. Redesigned `app.time.tsx`:
   - Header + 4 stat cards (Clocked In / Pending Approvals / OT / Missing Punches in red)
   - 3 tabs: Timesheets / Schedule / Time Off
   - Timesheets: week nav + grid with OT amber + missing-punch red cells + per-row approve button
   - Schedule: weekly calendar grid with click-to-add-shift modal
   - Time Off: 3 PTO summary cards + Pending (approve/deny) + Approved upcoming
2. Employee home (`employee.home.tsx` or `employee.punch.tsx`) — giant centered clock widget: live time, date, huge Clock In/Out button (green→red), live elapsed timer

**Data**
- Reuses `time_entries`, `pto_entries`, `schedules` (if present). No schema changes.

---

## Sequencing & approval

Phase 1 alone is already ~6 new/modified files and a wizard. I'll do them one at a time and pause for your review between phases so you can course-correct on the visual direction before I propagate it.

**Reply with "start phase 1"** (or tell me to do them all back-to-back, or reorder) and I'll begin.

## Technical notes
- All edits stay in JSX/CSS — no business logic touched
- Existing supabase queries preserved exactly
- New routes follow TanStack file-based conventions (`app.employees.$id.tsx`)
- Wizards use shadcn `Dialog` in full-screen mode, not separate routes, so the URL stays stable and the user can close back to the list
- Empty-state safe everywhere — missing tables/columns won't crash a tab