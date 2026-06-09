import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight, ArrowRight, CheckCircle2, Users, Clock, Briefcase,
  ShieldCheck, Wallet, CalendarDays, FileBadge, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paylo — Payroll, 1099 & Tax Filing for Modern Teams" },
      { name: "description", content: "Run payroll, file taxes, and pay W-2 employees and 1099 contractors. All in one quiet workflow." },
      { property: "og:title", content: "Paylo — Payroll, simplified." },
      { property: "og:description", content: "Run payroll, file taxes, and pay your whole team in minutes." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 grid-bg opacity-60" />

      {/* NAV */}
      <header className="sticky top-0 z-30 border-b bg-background/82 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-brand text-sm font-extrabold text-primary-foreground shadow-glow">P</div>
            <span className="font-display text-xl font-extrabold text-gradient">Paylo</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-foreground/60 md:flex">
            <a className="transition-colors hover:text-foreground" href="#platform">Product</a>
            <a className="transition-colors hover:text-foreground" href="#how">How it works</a>
            <Link to="/auth" className="transition-colors hover:text-foreground">Sign in</Link>
          </nav>
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            Get started <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-7xl px-5 pt-16 pb-12 text-center md:px-8 md:pt-24">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card/85 px-3.5 py-1.5 shadow-soft backdrop-blur">
          <span className="grid h-4 w-4 place-items-center"><span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" /></span>
          <span className="text-[11px] font-extrabold uppercase text-muted-foreground">New · HR documents, tracking, payroll</span>
        </div>

        <div className="mt-8 mb-2 h-16 sm:h-20 md:h-24 flex items-center justify-center">
          <span className="script-typer text-4xl sm:text-5xl md:text-6xl">Good Payroll Starts Here</span>
        </div>

        <h1 className="mx-auto mt-4 max-w-4xl font-display text-4xl font-extrabold leading-tight sm:text-5xl md:text-7xl md:leading-[1.02]">
          Payroll and HR that feels built for <span className="text-gradient">2030</span>.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base font-medium leading-8 text-muted-foreground md:text-lg">
          Run payroll, file taxes, collect signatures, track field work, and manage W-2 employees and 1099 contractors in one polished command center.
        </p>

        <div className="mt-9 flex flex-col items-center gap-4">
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2.5 rounded-2xl bg-primary px-9 py-4 text-base font-bold text-primary-foreground shadow-float transition-all hover:-translate-y-1 hover:shadow-glow active:scale-[0.98]"
          >
            Start free trial
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a href="#how" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            See how it works
          </a>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-bold text-muted-foreground">
          {["No credit card", "Setup in 10 min", "Cancel anytime"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[var(--brand)]" /> {t}
            </span>
          ))}
        </div>
      </section>

      {/* FLOATING DASHBOARD MOCKUP */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <div className="relative mx-auto max-w-md px-2 sm:px-0">
          {/* Glow halo */}
          <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 rounded-[60px] bg-[var(--brand-soft)] opacity-60 blur-2xl" />

          {/* Main card */}
          <div className="relative z-10 overflow-hidden rounded-[36px] border bg-card shadow-float float-y">
            <div className="flex items-center gap-1.5 px-7 pt-6 pb-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/40" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400/40" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/40" />
              <span className="ml-2 text-[10px] font-medium tracking-wide text-muted-foreground/60">PAYLO.APP/DASHBOARD</span>
            </div>

            <div className="space-y-5 px-7 pb-7 pt-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Good morning, Sarah</p>
                  <p className="mt-0.5 text-2xl font-semibold tracking-tight">Acme Coffee Co.</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[10px] font-bold text-accent-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  All systems normal
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MockStat icon={<Users className="h-4 w-4" />} value="14" label="Employees" />
                <div className="rounded-3xl surface-hero p-4 text-primary-foreground shadow-card">
                  <div className="mb-3 grid h-8 w-8 place-items-center rounded-xl bg-primary-foreground/12 text-primary-foreground/70">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="text-xl font-semibold tabular">$48,210</div>
                  <div className="text-[10px] font-bold uppercase text-primary-foreground/60">Next payroll</div>
                </div>
              </div>

              <div className="rounded-3xl border border-border/60 bg-secondary/60 p-5 shadow-inner">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">This pay period</p>
                    <div className="mt-0.5 text-3xl font-semibold tracking-tight tabular">$62,480</div>
                  </div>
                  <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">+8.2%</span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-border/60">
                  <div className="h-full bg-primary" style={{ width: "65%" }} />
                  <div className="h-full bg-cyan" style={{ width: "20%" }} />
                  <div className="h-full bg-accent" style={{ width: "15%" }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-foreground" /> Net pay</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-foreground/40" /> Federal</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-foreground/20" /> FICA</span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating accent cards */}
          <div className="absolute right-0 top-24 z-20 w-32 rounded-3xl gradient-brand p-4 text-primary-foreground shadow-glow float-y-sm sm:-right-4">
            <div className="text-[10px] font-medium opacity-70">Approvals</div>
            <div className="text-2xl font-bold tabular">98%</div>
          </div>
          <div className="absolute -left-2 bottom-16 z-0 w-36 rounded-3xl bg-card p-4 shadow-card float-y-lg sm:-left-6">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Filed</div>
            <div className="mt-1 text-xl font-bold tabular">Q3 941</div>
            <div className="mt-2 h-1.5 w-3/4 rounded-full bg-emerald-300" />
          </div>
        </div>
      </section>

      {/* PLATFORM */}
      <section id="platform" className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-accent px-3 py-1 text-[10px] font-extrabold uppercase text-accent-foreground">Platform</span>
          <h2 className="mt-4 font-display text-4xl font-extrabold md:text-5xl">
            Everything to pay your team compliantly.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
            W-2 payroll, 1099 contractors, federal &amp; state tax filing, direct deposit, time tracking, PTO, benefits — all in one tidy workflow.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={<Wallet className="h-6 w-6 text-orange-500" />} bg="bg-orange-50" title="Run payroll" desc="Auto-calculated gross, taxes, deductions, and net pay. Approve in one click." />
          <Feature icon={<Briefcase className="h-6 w-6 text-[var(--brand)]" />} bg="bg-[var(--brand-soft)]" title="1099 contractors" desc="Pay independent contractors. We generate year-end 1099-NEC forms automatically." />
          <Feature icon={<ShieldCheck className="h-6 w-6 text-emerald-600" />} bg="bg-emerald-50" title="Tax filing" desc="941, 940, W-2/W-3, 1099-NEC. Quarterly and year-end, handled fully for you." />
          <Feature icon={<Clock className="h-6 w-6 text-amber-600" />} bg="bg-amber-50" title="Time & PTO" desc="Track hours, overtime, and time off. Flows straight into payroll." />
          <Feature icon={<CalendarDays className="h-6 w-6 text-rose-500" />} bg="bg-rose-50" title="Direct deposit" desc="ACH batches ready for your bank. Pay stubs delivered to every employee." />
          <Feature icon={<FileBadge className="h-6 w-6 text-violet-600" />} bg="bg-violet-50" title="HR & onboarding" desc="Documents, signed W-4/I-9/W-9, onboarding checklists — stored and tracked." />
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="how" className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
        <div className="relative overflow-hidden rounded-[40px] surface-hero p-10 text-primary-foreground shadow-float md:p-16">
          <div aria-hidden className="absolute inset-0 grid-bg opacity-20" />

          <div className="relative z-10 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/14 bg-primary-foreground/10 px-3 py-1 text-[11px] font-bold uppercase text-primary-foreground/70">
              <Sparkles className="h-3 w-3" /> Free first payroll
            </div>
            <h2 className="mx-auto mt-6 max-w-2xl font-display text-4xl font-extrabold leading-tight md:text-5xl">
              Pay your team in minutes, not days.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-primary-foreground/68">
              Switch from spreadsheets in an afternoon. We'll import your team and run your first payroll free.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4">
              <Link to="/auth" className="inline-flex items-center gap-2 rounded-2xl bg-primary-foreground px-8 py-4 text-base font-bold text-primary shadow-2xl transition-all hover:-translate-y-0.5 hover:bg-primary-foreground/90">
                Start free trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/auth" className="rounded-2xl px-8 py-4 text-base font-bold text-primary-foreground/70 transition-colors hover:text-primary-foreground">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-5 md:px-8">
          <div className="flex items-center gap-2 opacity-60">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-background">P</div>
            <span className="text-sm font-semibold tracking-tight">paylo</span>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            © {new Date().getFullYear()} Paylo · Payroll for small business
          </p>
        </div>
      </footer>
    </div>
  );
}

function MockStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-soft">
      <div className="mb-3 grid h-8 w-8 place-items-center rounded-xl bg-secondary text-muted-foreground">{icon}</div>
      <div className="text-2xl font-semibold tabular">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function Feature({ icon, bg, title, desc }: { icon: React.ReactNode; bg: string; title: string; desc: string }) {
  return (
    <div className="group rounded-[28px] border border-border/60 bg-card p-7 transition-all duration-500 hover:-translate-y-0.5 hover:shadow-card">
      <div className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${bg} transition-transform group-hover:scale-110`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}
