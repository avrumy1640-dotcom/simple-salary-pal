import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight, ArrowRight, CheckCircle2, Users, Clock, Briefcase,
  ShieldCheck, Wallet, CalendarDays, FileBadge,
} from "lucide-react";
import { ScrollReveal, StaggerChildren, StaggerItem } from "@/components/motion/ScrollReveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paylo — The Operating System for Your Workforce" },
      { name: "description", content: "One intelligent platform to run payroll, manage people, track time, and stay compliant. Built for operators and growing businesses." },
      { property: "og:title", content: "Paylo — The Operating System for Your Workforce" },
      { property: "og:description", content: "Institutional-grade payroll and HR infrastructure for people-first companies." },
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
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
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
          <span className="text-[11px] font-extrabold uppercase text-muted-foreground">Institutional-grade · Payroll, people, compliance</span>
        </div>

        <div className="mt-8 mb-2 h-16 sm:h-20 md:h-24 flex items-center justify-center">
          <span className="script-typer text-4xl sm:text-5xl md:text-6xl">Built for your people</span>
        </div>

        <h1 className="mx-auto mt-4 max-w-4xl font-display text-4xl font-extrabold leading-tight sm:text-5xl md:text-7xl md:leading-[1.02] text-white">
          The Operating System for <span className="text-gradient">Your Workforce</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base font-medium leading-8 text-white/80 md:text-lg">
          Paylo gives growing businesses one intelligent platform to run payroll, manage their people, track time, and stay compliant — without the complexity, the accountant fees, or the 4am spreadsheet panic.
        </p>

        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/60">
          Built for businesses that are serious about their team.
        </p>

        <div className="mt-9 flex flex-col items-center gap-4">
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2.5 rounded-2xl bg-primary px-9 py-4 text-base font-bold text-primary-foreground shadow-float transition-all hover:-translate-y-1 hover:shadow-glow active:scale-[0.98]"
          >
            Get started free — no card needed
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a href="#how" className="text-sm font-medium text-white/60 transition-colors hover:text-white">
            See how it works
          </a>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-bold text-white/70">
          {["Backed by results, not promises", "SOC 2 compliant. Bank-level security.", "Setup in under 10 minutes"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" /> {t}
            </span>
          ))}
        </div>
      </section>

      {/* FLOATING DASHBOARD MOCKUP */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <div className="relative mx-auto max-w-md px-2 sm:px-0">
          {/* Glow halo */}
          <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 rounded-[60px] bg-primary/10 opacity-60 blur-2xl" />

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
                  <p className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">Acme Coffee Co.</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[10px] font-bold text-accent-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  All systems normal
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MockStat icon={<Users className="h-4 w-4" />} value="14" label="Employees" />
                <div className="rounded-3xl surface-hero p-4 text-foreground shadow-card">
                  <div className="mb-3 grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary/70">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="text-xl font-semibold tabular">$48,210</div>
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Next payroll</div>
                </div>
              </div>

              <div className="rounded-3xl border border-border/60 bg-secondary/60 p-5 shadow-inner">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">This pay period</p>
                    <div className="mt-0.5 text-3xl font-semibold tracking-tight tabular text-foreground">$62,480</div>
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
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-[10px] font-extrabold uppercase text-primary border border-primary/30">Platform</span>
          <h2 className="mt-4 font-display text-4xl font-extrabold md:text-5xl text-white">
            Infrastructure for people-first companies
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
            The most successful companies know that taking care of their people is not an HR task — it is a competitive advantage. Paylo gives you the tools to do it right.
          </p>
        </ScrollReveal>

        <StaggerChildren className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <Wallet className="h-6 w-6 text-primary" />, title: "Run payroll", desc: "Auto-calculated gross, taxes, deductions, and net pay. Approve in one click." },
            { icon: <Briefcase className="h-6 w-6 text-primary" />, title: "1099 contractors", desc: "Pay independent contractors. Year-end 1099-NEC forms generated automatically." },
            { icon: <ShieldCheck className="h-6 w-6 text-primary" />, title: "Tax filing", desc: "941, 940, W-2/W-3, 1099-NEC. Quarterly and year-end, handled end-to-end." },
            { icon: <Clock className="h-6 w-6 text-primary" />, title: "Time & PTO", desc: "Track hours, overtime, and time off. Flows straight into payroll." },
            { icon: <CalendarDays className="h-6 w-6 text-primary" />, title: "Direct deposit", desc: "ACH batches ready for your bank. Pay stubs delivered to every employee." },
            { icon: <FileBadge className="h-6 w-6 text-primary" />, title: "HR & onboarding", desc: "Documents, signed W-4/I-9/W-9, onboarding checklists — stored and tracked." },
          ].map((f) => (
            <StaggerItem key={f.title}>
              <Feature {...f} />
            </StaggerItem>
          ))}
        </StaggerChildren>
      </section>

      {/* FINAL CTA */}
      <section id="how" className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
        <ScrollReveal className="relative overflow-hidden rounded-[40px] surface-hero p-10 text-foreground shadow-float md:p-16">
          <div aria-hidden className="absolute inset-0 grid-bg opacity-20" />

          <div className="relative z-10 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase text-primary">
              From zero to first payroll in 10 minutes
            </div>
            <h2 className="mx-auto mt-6 max-w-2xl font-display text-4xl font-extrabold leading-tight md:text-5xl text-white">
              Your team deserves a company that gets payroll right
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/75">
              Join hundreds of operators who stopped dreading payday and started owning it.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <Link to="/auth" className="inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-glow transition-all hover:-translate-y-0.5 glow-pulse">
                Get started free — no card needed <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-xs font-medium text-white/55">14-day free trial. Cancel anytime. Your first payroll is on us.</p>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-5 md:px-8">
          <div className="flex items-center gap-2 opacity-60">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">P</div>
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
      <div className="text-2xl font-semibold tabular text-foreground">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group rounded-[28px] border border-primary/15 bg-card p-7 transition-all duration-500 hover:-translate-y-0.5 hover:shadow-glow hover:border-primary/40">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 border border-primary/25 transition-transform group-hover:scale-110">
        {icon}
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
    </div>
  );
}
