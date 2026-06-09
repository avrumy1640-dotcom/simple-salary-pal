import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowUpRight, CheckCircle2, Clock, Users, FileText, Wallet, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paylo — The Operating System for Small Business Payroll" },
      { name: "description", content: "One platform for payroll, HR, time tracking, and reporting. Built for US small and mid-size businesses." },
    ],
  }),
  component: Landing,
});

const pills = ["Payroll", "Time Tracking", "Employees", "Tax Filing", "HR Management", "Reports", "Direct Deposit"] as const;

function StatCard({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className={`text-2xl font-semibold tracking-tight ${accent ? "text-[oklch(0.62_0.22_260)]" : ""}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[oklch(0.62_0.22_260)] text-white font-bold">P</div>
            <span className="text-xl font-bold tracking-tight">paylo</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-foreground/80 md:flex">
            <a className="hover:text-foreground" href="#features">Solutions</a>
            <a className="hover:text-foreground" href="#features">Company</a>
            <a className="hover:text-foreground" href="#features">Industries</a>
            <a className="hover:text-foreground" href="#features">Resources</a>
            <a className="hover:text-foreground" href="#features">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden sm:inline-flex">
              <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
                Sign In <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </Link>
            <Link to="/auth">
              <button className="rounded-full border-2 border-[oklch(0.62_0.22_260)] px-4 py-2 text-sm font-semibold text-[oklch(0.62_0.22_260)] hover:bg-[oklch(0.62_0.22_260)] hover:text-white transition-colors">
                Get Started
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-5 pt-16 pb-10 text-center md:pt-24 md:pb-14">
          <h1 className="text-[44px] font-bold leading-[1.05] tracking-tight md:text-7xl">
            The Operating System for<br className="hidden md:block" /> Small Business Payroll
          </h1>

          <div className="mt-10 flex flex-wrap justify-center gap-2.5">
            {pills.map((p, i) => (
              <span
                key={p}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  i === 0
                    ? "bg-[oklch(0.95_0.03_258)] text-[oklch(0.55_0.2_260)] opacity-60"
                    : "bg-[oklch(0.95_0.03_258)] text-[oklch(0.55_0.2_260)]"
                }`}
              >
                {p}
              </span>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
            One platform for payroll, HR, time tracking, and benefits.
            <br className="hidden md:block" /> Built for the way small businesses actually work.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/auth">
              <Button size="lg" className="rounded-full bg-[oklch(0.62_0.22_260)] px-7 text-white hover:bg-[oklch(0.56_0.22_260)]">
                Get a Demo <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="ghost" className="rounded-full px-7">
                See how it works
              </Button>
            </Link>
          </div>
        </div>

        {/* DASHBOARD MOCKUP */}
        <div className="mx-auto max-w-6xl px-5 pb-20 md:px-8">
          <div className="rounded-[28px] border bg-card p-3 shadow-[0_30px_80px_-20px_oklch(0.22_0.08_268_/_0.25)] md:p-5">
            <div className="overflow-hidden rounded-2xl border bg-[oklch(0.985_0.006_255)]">
              {/* Mock app top bar */}
              <div className="flex items-center justify-between border-b bg-card px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-[oklch(0.62_0.22_260)] text-[10px] font-bold text-white">P</div>
                  <span className="text-sm font-semibold">Acme Co.</span>
                </div>
                <div className="hidden gap-6 text-xs font-medium text-muted-foreground md:flex">
                  <span className="text-foreground">Dashboard</span>
                  <span>People</span>
                  <span>Payroll</span>
                  <span>Reports</span>
                </div>
                <div className="h-7 w-7 rounded-full bg-accent" />
              </div>

              <div className="space-y-4 p-4 md:p-6">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Pending Approvals</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard value="24" label="Time off requests" />
                    <StatCard value="12" label="Reimbursements" />
                    <StatCard value="8" label="New hires" />
                    <StatCard value="$48,210" label="Net payroll" accent />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border bg-card p-5">
                    <div className="text-xs font-medium text-muted-foreground">This Pay Period</div>
                    <div className="mt-2 flex items-end justify-between">
                      <div>
                        <div className="text-3xl font-bold tracking-tight">$62,480</div>
                        <div className="text-xs text-muted-foreground">Gross payroll · 14 employees</div>
                      </div>
                      <div className="rounded-full bg-[oklch(0.95_0.05_155)] px-2 py-0.5 text-xs font-medium text-[oklch(0.5_0.15_155)]">+8.2%</div>
                    </div>
                    <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
                      <div className="w-3/5 bg-[oklch(0.62_0.22_260)]" />
                      <div className="w-1/5 bg-[oklch(0.78_0.15_78)]" />
                      <div className="w-1/5 bg-[oklch(0.22_0.08_268)]" />
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-card p-5">
                    <div className="text-xs font-medium text-muted-foreground">Attendance · Today</div>
                    <div className="mt-2 text-3xl font-bold tracking-tight">12<span className="text-base font-medium text-muted-foreground"> / 14</span></div>
                    <div className="mt-1 text-xs text-muted-foreground">Currently clocked in</div>
                    <div className="mt-4 flex -space-x-2">
                      {[0,1,2,3,4].map(i => (
                        <div key={i} className="h-8 w-8 rounded-full border-2 border-card bg-[oklch(0.9_0.03_258)]" />
                      ))}
                      <div className="grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-accent text-[10px] font-semibold text-[oklch(0.55_0.2_260)]">+7</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t bg-[oklch(0.985_0.006_255)]">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-8">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-semibold text-[oklch(0.55_0.2_260)]">PLATFORM</div>
            <h2 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">Everything you need to pay your team.</h2>
            <p className="mt-4 text-lg text-muted-foreground">From onboarding to direct deposit — one tidy workflow that runs in minutes, not days.</p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { icon: Users, title: "Employee directory", desc: "Hourly or salary, organized in one tidy roster." },
              { icon: Clock, title: "Time tracking", desc: "Log hours and overtime per pay period in seconds." },
              { icon: Wallet, title: "Run payroll", desc: "Auto-calculated gross, taxes, and net pay." },
              { icon: FileText, title: "Reports & exports", desc: "CSV-ready reports for accounting and audit." },
              { icon: ShieldCheck, title: "Federal & FICA", desc: "Social Security, Medicare, and federal withholding handled." },
              { icon: CheckCircle2, title: "Approve in one click", desc: "Preview totals, approve, and you're done." },
            ].map(f => (
              <div key={f.title} className="group rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-[oklch(0.55_0.2_260)]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-24 text-center md:px-8">
        <h2 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Ready to run payroll <span className="text-[oklch(0.62_0.22_260)]">in minutes</span>?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Join small businesses paying their teams with Paylo.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/auth">
            <Button size="lg" className="rounded-full bg-[oklch(0.62_0.22_260)] px-8 text-white hover:bg-[oklch(0.56_0.22_260)]">
              Get a Demo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/auth">
            <Button size="lg" variant="outline" className="rounded-full border-2 px-8">
              Sign In
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground md:flex-row md:px-8">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-[oklch(0.62_0.22_260)] text-[10px] font-bold text-white">P</div>
            <span className="font-semibold text-foreground">paylo</span>
          </div>
          <span>© {new Date().getFullYear()} Paylo. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
