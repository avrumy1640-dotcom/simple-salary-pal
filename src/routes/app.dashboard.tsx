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

type StatProps = { label: string; value: string; icon: typeof Users; accent?: boolean; gold?: boolean };

function Stat({ label, value, icon: Icon, accent, gold }: StatProps) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 sm:rounded-3xl sm:p-5 ${
      gold ? "border-[#F5C518]/30 bg-gradient-to-br from-[#F5C518]/14 to-transparent hover:shadow-gold" :
      accent ? "border-[#2563EB]/30 bg-gradient-to-br from-[#2563EB]/18 to-transparent hover:shadow-glow" :
      "surface-glass hover:border-white/20 hover:shadow-card"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 sm:text-[11px]">{label}</span>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:rounded-2xl ${
          gold ? "bg-[#F5C518]/18 text-[#F5C518]" : accent ? "bg-[#2563EB]/22 text-[#60A5FA]" : "bg-white/6 text-white/75"
        }`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 font-display text-3xl font-bold tabular text-white sm:text-[2rem]">{value}</div>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="surface-glass rounded-2xl border border-white/8 p-4 sm:rounded-3xl sm:p-5">
      <div className="flex items-center justify-between">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-9 w-9 rounded-2xl" />
      </div>
      <div className="skeleton mt-5 h-8 w-24" />
    </div>
  );
}

function QuickSkeleton() {
  return (
    <div className="surface-glass rounded-2xl border border-white/8 p-4 sm:rounded-3xl sm:p-5">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton mt-3 h-3 w-1/2" />
      <div className="skeleton mt-5 h-3 w-16" />
    </div>
  );
}

function Dashboard() {
  const [loading, setLoading] = useState(true);
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
      setLoading(false);
    })();
  }, []);

  const allSetup = setupSteps.company && setupSteps.employees && setupSteps.payroll;

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 surface-hero p-5 sm:rounded-[2rem] sm:p-7 md:p-9">
        <div aria-hidden className="absolute inset-0 grid-bg opacity-30" />
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#2563EB]/30 blur-3xl orb-1" />
        <div aria-hidden className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-[#F5C518]/14 blur-3xl orb-2" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/75 backdrop-blur sm:text-xs">
              <span className="h-2 w-2 rounded-full bg-[#F5C518] pulse-dot" /> Live payroll command center
            </div>
            <h1 className="mt-4 font-display text-[2rem] font-bold leading-[1.05] text-white sm:mt-5 sm:text-5xl md:text-6xl">
              Welcome back.<br />
              <span className="script-typer text-[1.5em] leading-none">Run payroll</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-white/65 sm:text-base sm:leading-7">
              Approve time, review documents, and pay your team — all from one elegant dashboard.
            </p>
          </div>
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:rounded-3xl lg:min-w-[240px]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/55 sm:text-xs">Next pay date</div>
            {loading ? (
              <div className="skeleton h-7 w-28" />
            ) : (
              <div className="font-display text-2xl font-bold text-white">
                {nextPayDate ? new Date(nextPayDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Ready"}
              </div>
            )}
            <Link to="/app/payroll">
              <Button className="w-full gap-2 gradient-gold text-[#0A0F2C] font-bold hover:opacity-95 hover:shadow-gold">
                Run payroll <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Setup checklist */}
      {!loading && !allSetup && (
        <Link to="/app/getting-started" className="block surface-glass rounded-2xl border border-white/10 p-4 transition-all hover:-translate-y-0.5 hover:border-[#F5C518]/40 hover:shadow-gold sm:rounded-3xl sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3 md:contents">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl gradient-gold text-[#0A0F2C] shadow-gold sm:h-14 sm:w-14"><Sparkles className="h-5 w-5" /></div>
              <div className="flex-1">
                <div className="font-display text-base font-bold text-white sm:text-lg">Finish setting up your payroll</div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
                  <SetupStep done={setupSteps.company} label="Company info" />
                  <SetupStep done={setupSteps.employees} label="Add employees" />
                  <SetupStep done={setupSteps.payroll} label="First payroll" />
                </div>
              </div>
            </div>
            <ArrowRight className="hidden h-5 w-5 text-white/60 md:block" />
          </div>
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading ? (
          <>
            <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
          </>
        ) : (
          <>
            <Stat label="Active employees" value={String(empCount)} icon={Users} />
            <Stat label="Hours (14d)" value={hoursThisPeriod.toFixed(1)} icon={Clock} />
            <Stat label="Pending PTO" value={String(pendingPto)} icon={CalendarDays} accent />
            <Stat label="Last net payroll" value={lastRun ? fmtUSD(lastRun.net_total) : "—"} icon={Wallet} gold />
          </>
        )}
      </div>

      {/* Next pay panel */}
      {loading ? (
        <div className="surface-glass rounded-2xl border border-white/8 p-4 sm:rounded-3xl sm:p-5">
          <div className="flex items-center gap-3">
            <div className="skeleton h-12 w-12 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-5 w-48" />
            </div>
          </div>
        </div>
      ) : nextPayDate ? (
        <div className="flex flex-col gap-4 surface-glass rounded-2xl border border-white/10 p-4 sm:rounded-3xl sm:p-5 md:flex-row md:items-center">
          <div className="flex items-center gap-3 md:contents">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#F5C518]/14 text-[#F5C518]"><CalendarDays className="h-5 w-5" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/55 sm:text-xs">Next pay date</div>
              <div className="font-display text-base font-bold text-white sm:text-xl">{new Date(nextPayDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
            </div>
          </div>
          <Link to="/app/payroll" className="md:ml-auto"><Button variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-[#F5C518]/40 md:w-auto">Prepare payroll</Button></Link>
        </div>
      ) : null}

      {/* Quick actions */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 md:grid-cols-3">
        {loading ? (
          <>
            <QuickSkeleton /><QuickSkeleton /><QuickSkeleton />
            <QuickSkeleton /><QuickSkeleton /><QuickSkeleton />
          </>
        ) : (
          <>
            <QuickCard to="/app/employees" title="Add an employee" desc="Set up hourly or salary." />
            <QuickCard to="/app/time" title="Log hours" desc="Track work for this pay period." />
            <QuickCard to="/app/benefits" title="Manage benefits" desc="Health, 401(k), and deductions." />
            <QuickCard to="/app/pto" title="Approve time off" desc="Review PTO requests." />
            <QuickCard to="/app/taxes" title="Tax summary" desc="YTD totals and W-2 previews." />
            <QuickCard to="/app/reports" title="Reports & exports" desc="CSV-ready for accounting." />
          </>
        )}
      </div>
    </div>
  );
}

function SetupStep({ done, label }: { done: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {done ? <CheckCircle2 className="h-4 w-4 text-[#22C55E]" /> : <Circle className="h-4 w-4 text-white/35" />}
      <span className={done ? "text-white/50 line-through" : "font-medium text-white/85"}>{label}</span>
    </span>
  );
}

function QuickCard({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group surface-glass rounded-2xl border border-white/10 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[#F5C518]/40 hover:shadow-gold sm:rounded-3xl sm:p-5">
      <h3 className="font-display text-lg font-bold text-white">{title}</h3>
      <p className="mt-1 text-sm text-white/60">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#F5C518] sm:mt-5">
        Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
