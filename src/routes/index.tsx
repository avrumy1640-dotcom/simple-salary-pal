import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, ArrowUpRight, CheckCircle2, Clock, Users, FileText, Wallet,
  ShieldCheck, Banknote, Briefcase, Sparkles, TrendingUp, Calendar,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paylo — Payroll, HR & Tax Filing for Small Business" },
      { name: "description", content: "Run payroll in minutes. W-2 + 1099. Federal & state tax filing. Time tracking. Direct deposit." },
      { property: "og:title", content: "Paylo — Payroll, HR & Tax Filing" },
      { property: "og:description", content: "Run payroll, file taxes, pay W-2 and 1099. One simple workflow." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* AMBIENT BACKGROUND */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-20 h-[480px] w-[480px] rounded-full bg-[#f5d8c4] opacity-60 blur-3xl" />
        <div className="absolute top-[30%] -left-32 h-[440px] w-[440px] rounded-full bg-[#d9e8d4] opacity-50 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-[360px] w-[360px] rounded-full bg-[#e6d9f0] opacity-50 blur-3xl" />
      </div>

      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-foreground text-background font-bold shadow-[0_8px_20px_-8px_rgba(0,0,0,0.4)]">P</div>
            <span className="text-xl font-bold tracking-tight">paylo</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-foreground/70 md:flex">
            <a className="hover:text-foreground" href="#features">Product</a>
            <a className="hover:text-foreground" href="#pricing">Pricing</a>
            <a className="hover:text-foreground" href="#why">Why Paylo</a>
            <a className="hover:text-foreground" href="#features">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden sm:inline-flex">
              <button className="text-sm font-medium text-foreground/70 hover:text-foreground px-3 py-2">Sign in</button>
            </Link>
            <Link to="/auth">
              <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] transition-all">
                Get started <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-10 md:pt-24 md:pb-16">
          <div className="mx-auto max-w-4xl text-center animate-fade-in">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3.5 py-1.5 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> New: 1099 contractor payments + e-file
            </div>
            <h1 className="text-[44px] font-bold leading-[0.95] tracking-[-0.04em] md:text-[88px]">
              Payroll, <span className="italic font-medium" style={{ fontFamily: "'Instrument Serif', serif" }}>simplified</span>.
              <br />
              Taxes, <span className="italic font-medium" style={{ fontFamily: "'Instrument Serif', serif" }}>handled</span>.
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-lg text-foreground/65 md:text-xl">
              Run payroll, file taxes, and pay both W-2 employees and 1099 contractors —
              all in one place.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/auth">
                <Button size="lg" className="rounded-full bg-foreground px-8 py-6 text-base text-background hover:bg-foreground/90 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.4)]">
                  Start free trial <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="ghost" className="rounded-full px-8 py-6 text-base">See how it works</Button>
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-5 text-xs text-foreground/55">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> No credit card</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Setup in 10 min</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Cancel anytime</span>
            </div>
          </div>

          {/* DASHBOARD MOCKUP */}
          <div className="relative mx-auto mt-16 max-w-4xl md:mt-24 animate-fade-in">
            <div className="rounded-[28px] border border-border/60 bg-card p-2 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.4)] md:p-3 transition-transform duration-500 hover:-translate-y-1">
              <div className="overflow-hidden rounded-[20px] border border-border/40 bg-secondary/30">
                <div className="flex items-center justify-between border-b border-border/40 bg-card px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28ca42]" />
                  </div>
                  <div className="text-xs font-medium text-foreground/60">paylo.app/dashboard</div>
                  <div className="w-12" />
                </div>
                <div className="space-y-4 p-5 md:p-7">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-foreground/55">Good morning, Sarah</div>
                      <div className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Acme Coffee Co.</div>
                    </div>
                    <div className="rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold text-background">All systems normal</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard icon={Users} value="14" label="Employees" />
                    <StatCard icon={Clock} value="12/14" label="Clocked in" />
                    <StatCard icon={Calendar} value="3" label="PTO requests" />
                    <StatCard icon={Wallet} value="$48,210" label="Next payroll" dark />
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-foreground/55">This pay period</div>
                        <div className="mt-1 text-3xl font-bold tracking-tight">$62,480</div>
                      </div>
                      <div className="rounded-full bg-[#d9e8d4] px-2.5 py-1 text-xs font-semibold text-[#2d5a3d]">+8.2%</div>
                    </div>
                    <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
                      <div className="w-[60%] bg-foreground" />
                      <div className="w-[20%] bg-[#e85d3a]" />
                      <div className="w-[20%] bg-[#d9b06d]" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-foreground/60">
                      <span>● Net pay</span><span>● Federal taxes</span><span>● State + FICA</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* floating accent cards */}
            <div className="absolute -left-2 -top-6 hidden w-44 rounded-2xl bg-[#1a1a1a] p-3 text-background shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] md:block md:-left-12">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#e85d3a]"><Banknote className="h-3.5 w-3.5" /></div>
                <div className="text-[10px] uppercase tracking-wider opacity-70">Next payroll</div>
              </div>
              <div className="mt-2 text-xl font-bold">$48,210</div>
              <div className="text-[10px] opacity-70">Paid Friday</div>
            </div>
            <div className="absolute -right-2 top-24 hidden w-44 rounded-2xl bg-[#d9e8d4] p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.3)] md:block md:-right-12">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><TrendingUp className="h-3.5 w-3.5" /></div>
                <div className="text-[10px] uppercase tracking-wider text-foreground/70">Filed Q3</div>
              </div>
              <div className="mt-2 text-xl font-bold text-foreground">Form 941</div>
              <div className="text-[10px] text-foreground/70">$12,840 fed w/h</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-semibold">PLATFORM</div>
            <h2 className="mt-5 text-4xl font-bold tracking-tight md:text-6xl">
              Everything to pay your team,{" "}
              <span className="italic font-medium" style={{ fontFamily: "'Instrument Serif', serif" }}>compliantly</span>.
            </h2>
            <p className="mt-5 text-lg text-foreground/65">
              W-2 payroll, 1099 contractors, federal &amp; state tax filing,
              direct deposit, time tracking, PTO, benefits — all in one tidy workflow.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="group rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: f.tint }}>
                  <f.icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-5 pb-20 md:px-8">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] bg-foreground p-10 text-background md:p-16">
          <div className="relative z-10">
            <h2 className="max-w-2xl text-4xl font-bold tracking-tight md:text-6xl">
              Pay your team in{" "}
              <span className="italic font-medium" style={{ fontFamily: "'Instrument Serif', serif" }}>minutes</span>, not days.
            </h2>
            <p className="mt-5 max-w-md text-base opacity-75 md:text-lg">
              Switch from spreadsheets in an afternoon. We'll import your team and run your first payroll free.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/auth">
                <Button size="lg" className="rounded-full bg-background px-8 py-6 text-base text-foreground hover:bg-background/90">
                  Start free trial <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="ghost" className="rounded-full px-8 py-6 text-base text-background hover:bg-background/10">Sign in</Button>
              </Link>
            </div>
          </div>
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#e85d3a] opacity-30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-[#e6d9f0] opacity-20 blur-3xl" />
        </div>
      </section>

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-foreground/60 md:flex-row md:px-8">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-lg bg-foreground text-[10px] font-bold text-background">P</div>
            <span className="font-semibold text-foreground">paylo</span>
          </div>
          <span>© {new Date().getFullYear()} Paylo · Payroll for small business</span>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ icon: Icon, value, label, dark }: { icon: React.ComponentType<{ className?: string }>; value: string; label: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm transition-transform hover:-translate-y-0.5 ${dark ? "bg-foreground text-background border-foreground" : "bg-card border-border/50"}`}>
      <Icon className={`h-4 w-4 ${dark ? "opacity-80" : "text-foreground/60"}`} />
      <div className="mt-2 text-xl font-bold">{value}</div>
      <div className={`text-[11px] ${dark ? "opacity-70" : "text-foreground/60"}`}>{label}</div>
    </div>
  );
}

const features = [
  { icon: Wallet, title: "Run payroll", desc: "Auto-calculated gross, taxes, deductions, and net pay. Approve in one click.", tint: "#f5d8c4" },
  { icon: Briefcase, title: "1099 contractors", desc: "Pay independent contractors. We generate year-end 1099-NEC forms.", tint: "#e6d9f0" },
  { icon: ShieldCheck, title: "Tax filing", desc: "941, 940, W-2/W-3, 1099-NEC. Quarterly and year-end, handled for you.", tint: "#d9e8d4" },
  { icon: Banknote, title: "Direct deposit", desc: "ACH batch export ready for your bank. Stubs delivered to every employee.", tint: "#f5d8c4" },
  { icon: Clock, title: "Time & PTO", desc: "Track hours, overtime, and time off. Flows straight into payroll.", tint: "#d9e8d4" },
  { icon: FileText, title: "Reports", desc: "Payroll register, GL summary, contractor totals. CSV-ready.", tint: "#e6d9f0" },
];
