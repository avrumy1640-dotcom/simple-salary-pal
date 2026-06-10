## Goal

Restyle the **Dashboard** (`src/routes/app.dashboard.tsx`) to feel like Unit's product surface (unit.co / demo.unit.co) — pure white, generous whitespace, sharp grotesk typography, ultra-subtle borders, no heavy shadows, a single saturated accent. Keep all existing data, queries, and logic untouched — visual layer only.

## Look & feel commitments

- **Surface**: pure `#FFFFFF` canvas, page sections separated by 1px hairline borders (`oklch(0.92 0 0)`) instead of cards-with-shadow
- **Type**: display = Geist / Inter Tight (tight tracking, -0.02em), body = Inter, mono = JetBrains Mono for figures
- **Accent**: a single Unit-style aurora gradient (mint→cyan→violet) used sparingly — one hero stat, one CTA pill, nothing else
- **Numbers**: oversized tabular figures (`text-5xl font-medium tracking-tight tabular-nums`) — the page reads as a money hub
- **Buttons**: black pill primary (`rounded-full bg-foreground text-background`), ghost secondary
- **Motion**: subtle fade-in on mount, hairline progress shimmer on the hero KPI

## Scope (this page only)

```
src/routes/app.dashboard.tsx     ← restyle JSX + classNames
src/styles.css                   ← add scoped tokens: --unit-hairline, --unit-aurora, --font-display
src/routes/__root.tsx            ← <link> for Geist/Inter Tight font
```

No changes to `AppShell`, sidebar, other routes, data fetching, server functions, or the design tokens used by the rest of the app. If you like the pilot, we roll the same tokens out app-wide in a follow-up.

## Layout

```text
┌───────────────────────────────────────────────────────────┐
│  Dashboard            Period ▾    [● Run payroll]         │
│  Wednesday, June 10                                       │
├───────────────────────────────────────────────────────────┤
│  HERO KPI  ($428,902.14)           aurora orb ──►         │
│  Next payroll · 3 days                                    │
├──────────────┬──────────────┬─────────────────────────────┤
│  Employees   │  Hours       │  Pending approvals          │
│  42          │  1,284       │  6                          │
├──────────────┴──────────────┴─────────────────────────────┤
│  Recent activity (hairline table)                         │
│  ─────────────────────────────────────────────────        │
│  Payroll run · Jun 6 · $128,402.10        ✓ Completed     │
│  Time approval · Jun 5 · 24 entries       ● Pending       │
└───────────────────────────────────────────────────────────┘
```

## Technical notes

- Add tokens in `@theme inline` block (Tailwind v4) — `--color-hairline`, `--font-display`
- Load Geist via `<link>` in `__root.tsx` head (no CSS `@import` of font URL)
- Keep all existing `useQuery` / `useSuspenseQuery` calls and data shapes — only swap JSX & className
- Numbers formatted with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
- Aurora = a single radial-gradient `div` behind the hero KPI, `blur-3xl opacity-40`
- No new dependencies

## After approval

I'll implement directly. If the result lands well, say the word and I'll promote the tokens to global and re-skin the rest of the app.