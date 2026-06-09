import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Users, Wallet, Clock, ArrowRight, Sparkles, CalendarDays, CheckCircle2, Circle } from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Paylo" }] }),
  component: Dashboard,
});

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof Users; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "bg-foreground text-background border-transparent" : "bg-card"}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium uppercase tracking-wider ${accent ? "text-white/80" : "text-muted-foreground"}`}>{label}</span>
        <Icon className={`h-4 w-4 ${accent ? "text-white/80" : "text-muted-foreground"}`} />
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function Dashboard() {
  const [empCount, setEmpCount] = useState(0);
  const [lastRun, setLastRun] = useState<{ net_total: number; pay_date: string } | null>(null);
  const [hoursThisPeriod, setHoursThisPeriod] = useState(0);
  const [pendingPto, setPendingPto] = useState(0);
  const [nextPayDate, setNextPayDate] = useState<string | null>(null);
  const [setupSteps, setSetupSteps] = useState({ company: false, employees: false, payroll: false });

  useEffect(() => {
    (async () => {
      const [{ count: ec }, runsRes, teRes, ptoRes, csRes] = await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payroll_runs").select("net_total, pay_date").order("pay_date", { ascending: false }).limit(1),
        supabase.from("time_entries").select("hours, overtime_hours").gte("work_date", new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)),
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("company_settings").select("next_pay_date, onboarding_complete").maybeSingle(),
      ]);
      setEmpCount(ec ?? 0);
      const runs = runsRes.data;
      if (runs && runs[0]) setLastRun(runs[0] as { net_total: number; pay_date: string });
      const total = (teRes.data ?? []).reduce((s, r) => s + Number(r.hours) + Number(r.overtime_hours), 0);
      setHoursThisPeriod(total);
      setPendingPto(ptoRes.count ?? 0);
      setNextPayDate(csRes.data?.next_pay_date ?? null);
      setSetupSteps({
        company: !!csRes.data?.onboarding_complete,
        employees: (ec ?? 0) > 0,
        payroll: !!(runs && runs.length > 0),
      });
    })();
  }, []);

  const allSetup = setupSteps.company && setupSteps.employees && setupSteps.payroll;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back 👋</h1>
          <p className="text-sm text-muted-foreground">Here's a quick look at your payroll.</p>
        </div>
        <Link to="/app/payroll">
          <Button className="gap-2 rounded-full bg-foreground text-white hover:opacity-90 px-6">
            Run payroll <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {!allSetup && (
        <Link to="/app/getting-started" className="block rounded-2xl border bg-gradient-to-r from-[oklch(0.96_0.04_258)] to-card p-5 hover:shadow-md transition">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-foreground text-white"><Sparkles className="h-5 w-5" /></div>
            <div className="flex-1">
              <div className="font-semibold">Finish setting up your payroll</div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
                <SetupStep done={setupSteps.company} label="Company info" />
                <SetupStep done={setupSteps.employees} label="Add employees" />
                <SetupStep done={setupSteps.payroll} label="First payroll" />
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active employees" value={String(empCount)} icon={Users} />
        <Stat label="Hours (14 days)" value={hoursThisPeriod.toFixed(1)} icon={Clock} />
        <Stat label="Pending time off" value={String(pendingPto)} icon={CalendarDays} />
        <Stat label="Last net payroll" value={lastRun ? fmtUSD(lastRun.net_total) : "—"} icon={Wallet} accent />
      </div>

      {nextPayDate && (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-5">
          <CalendarDays className="h-5 w-5 text-foreground" />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Next pay date</div>
            <div className="text-lg font-semibold">{new Date(nextPayDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          <Link to="/app/payroll"><Button variant="outline" className="rounded-full">Prepare payroll</Button></Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <QuickCard to="/app/employees" title="Add an employee" desc="Set up hourly or salary." />
        <QuickCard to="/app/time" title="Log hours" desc="Track work for this pay period." />
        <QuickCard to="/app/benefits" title="Manage benefits" desc="Health, 401(k), and deductions." />
        <QuickCard to="/app/pto" title="Approve time off" desc="Review PTO requests." />
        <QuickCard to="/app/taxes" title="Tax summary" desc="YTD totals and W-2 previews." />
        <QuickCard to="/app/reports" title="Reports & exports" desc="CSV-ready for accounting." />
      </div>
    </div>
  );
}

function SetupStep({ done, label }: { done: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {done ? <CheckCircle2 className="h-4 w-4 text-[oklch(0.65_0.16_155)]" /> : <Circle className="h-4 w-4 text-muted-foreground/50" />}
      <span className={done ? "text-muted-foreground line-through" : "font-medium"}>{label}</span>
    </span>
  );
}

function QuickCard({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group rounded-2xl border bg-card p-5 transition-all hover:border-foreground hover:shadow-md">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-sm text-foreground font-medium">
        Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
