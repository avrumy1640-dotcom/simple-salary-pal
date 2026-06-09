import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Users, Wallet, Clock, ArrowRight, Sparkles, CalendarDays,
  PlayCircle, UserPlus, BarChart3, Bell, FileBadge, FileText,
} from "lucide-react";
import { fmtUSD } from "@/lib/payroll";
import { useCountUp } from "@/hooks/useCountUp";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Paylo" }] }),
  component: Dashboard,
});

function KpiCard({
  label, value, displayValue, icon: Icon, accent, delay = 0, deltaPct,
}: {
  label: string;
  value: number;
  displayValue: (n: number) => string;
  icon: typeof Users;
  accent?: boolean;
  delay?: number;
  deltaPct?: number;
}) {
  const animated = useCountUp(value, 1100);
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={[
        "group relative fade-up overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1",
        "surface-glass border border-primary/15 hover:border-primary/50 hover:shadow-glow",
        accent ? "ring-1 ring-primary/40" : "",
      ].join(" ")}
    >
      {/* Cyan top border accent */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-primary shadow-[0_0_12px_rgba(61,255,255,0.6)]" />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">{label}</span>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/30">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-5 font-display text-[2.25rem] font-extrabold tabular text-white leading-none">
        {displayValue(animated)}
      </div>
      {deltaPct !== undefined && (
        <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${up ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
          {up ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% vs last period
        </div>
      )}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="surface-glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-10 w-10 rounded-2xl" />
      </div>
      <div className="skeleton mt-5 h-8 w-24" />
    </div>
  );
}

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [empCount, setEmpCount] = useState(0);
  const [lastRun, setLastRun] = useState<{ net_total: number; pay_date: string } | null>(null);
  const [monthTotal, setMonthTotal] = useState(0);
  const [pendingPto, setPendingPto] = useState(0);
  const [nextPayDate, setNextPayDate] = useState<string | null>(null);
  const [upcomingRuns, setUpcomingRuns] = useState<{ pay_date: string; net_total: number }[]>([]);
  const [activity, setActivity] = useState<{ id: string; title: string; meta: string; icon: typeof Users }[]>([]);

  useEffect(() => {
    (async () => {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      const fom = firstOfMonth.toISOString().slice(0, 10);
      const [{ count: ec }, runsRes, monthRunsRes, ptoRes, csRes, recentPto, recentEmps] = await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payroll_runs").select("net_total, pay_date").order("pay_date", { ascending: false }).limit(6),
        supabase.from("payroll_runs").select("net_total").gte("pay_date", fom),
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("company_settings").select("next_pay_date, onboarding_complete").maybeSingle(),
        supabase.from("pto_entries").select("id, status, created_at, employees(full_name)").order("created_at", { ascending: false }).limit(3),
        supabase.from("employees").select("id, full_name, created_at").order("created_at", { ascending: false }).limit(3),
      ]);
      setEmpCount(ec ?? 0);
      const runs = runsRes.data ?? [];
      if (runs[0]) setLastRun(runs[0] as { net_total: number; pay_date: string });
      setMonthTotal((monthRunsRes.data ?? []).reduce((s, r) => s + Number(r.net_total), 0));
      setPendingPto(ptoRes.count ?? 0);
      setNextPayDate(csRes.data?.next_pay_date ?? null);
      setUpcomingRuns(runs.slice(0, 5).reverse() as typeof upcomingRuns);
      const a: typeof activity = [];
      (recentEmps.data ?? []).forEach((e) =>
        a.push({ id: `e-${e.id}`, title: `${e.full_name} joined the team`, meta: timeAgo(e.created_at), icon: UserPlus }),
      );
      (recentPto.data ?? []).forEach((p: { id: string; created_at: string; employees: { full_name: string } | { full_name: string }[] | null }) => {
        const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
        a.push({ id: `p-${p.id}`, title: `${emp?.full_name ?? "Someone"} requested time off`, meta: timeAgo(p.created_at), icon: CalendarDays });
      });
      runs.slice(0, 2).forEach((r, i) =>
        a.push({ id: `r-${i}`, title: `Payroll run — ${fmtUSD(Number(r.net_total))} net`, meta: timeAgo(r.pay_date), icon: Wallet }),
      );
      a.sort((x, y) => (x.meta > y.meta ? -1 : 1));
      setActivity(a.slice(0, 6));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[2rem] surface-hero p-6 sm:p-8 md:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl orb-1" />
        <div aria-hidden className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-card/80 blur-3xl orb-2" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-primary pulse-dot" /> Live payroll command center
            </div>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] text-foreground sm:text-5xl md:text-6xl">
              Welcome back.
            </h1>
            <p className="mt-4 max-w-xl text-sm font-medium leading-7 text-muted-foreground sm:text-base">
              Approve time, review documents, and pay your team — all from one elegant dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/app/payroll">
                <Button className="gap-2 bg-primary text-primary-foreground font-bold hover:-translate-y-0.5 hover:shadow-glow">
                  <PlayCircle className="h-4 w-4" /> Run payroll
                </Button>
              </Link>
              <Link to="/app/employees">
                <Button variant="outline" className="gap-2 border-border bg-secondary text-foreground hover:bg-muted">
                  <UserPlus className="h-4 w-4" /> Add employee
                </Button>
              </Link>
              <Link to="/app/reports">
                <Button variant="outline" className="gap-2 border-border bg-secondary text-foreground hover:bg-muted">
                  <BarChart3 className="h-4 w-4" /> View reports
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid gap-3 rounded-3xl border border-border bg-card p-5 backdrop-blur-xl shadow-card lg:min-w-[260px]">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Next pay date</div>
            {loading ? (
              <div className="skeleton h-7 w-28" />
            ) : (
              <div className="font-display text-2xl font-extrabold text-foreground">
                {nextPayDate ? new Date(nextPayDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Ready when you are"}
              </div>
            )}
            <Link to="/app/payroll">
              <Button className="w-full gap-2 bg-primary text-primary-foreground font-bold hover:shadow-glow">
                Prepare run <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>


      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          <><StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton /></>
        ) : (
          <>
            <KpiCard
              label="Payroll this month"
              value={monthTotal}
              displayValue={(n) => fmtUSD(n)}
              icon={Wallet}
              accent
              delay={0}
            />
            <KpiCard
              label="Active employees"
              value={empCount}
              displayValue={(n) => Math.round(n).toString()}
              icon={Users}
              delay={80}
            />
            <KpiCard
              label="Pending approvals"
              value={pendingPto}
              displayValue={(n) => Math.round(n).toString()}
              icon={Clock}
              delay={160}
            />
            <KpiCard
              label="Last net payroll"
              value={lastRun ? Number(lastRun.net_total) : 0}
              displayValue={(n) => fmtUSD(n)}
              icon={FileBadge}
              delay={240}
            />
          </>
        )}
      </div>

      {/* Timeline + Activity */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl surface-glass p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-lg font-bold text-foreground">Payroll timeline</div>
              <div className="text-xs font-medium text-muted-foreground">Recent and upcoming pay runs</div>
            </div>
            <Link to="/app/paystubs" className="text-xs font-bold text-primary hover:underline">View all</Link>
          </div>
          {loading ? (
            <div className="mt-5 skeleton h-24 w-full" />
          ) : upcomingRuns.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted p-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-foreground shadow-soft"><Wallet className="h-5 w-5" /></div>
              <div className="mt-3 font-display text-base font-bold text-foreground">No payroll runs yet</div>
              <div className="mt-1 text-sm text-muted-foreground">Run your first payroll in under 2 minutes.</div>
              <Link to="/app/payroll" className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:shadow-glow">
                Run payroll <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="relative mt-6 pl-2">
              <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-primary via-primary to-transparent" />
              <div className="space-y-4">
                {upcomingRuns.map((r, i) => (
                  <div key={i} className="relative pl-8" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="absolute left-0 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-card ring-2 ring-primary">
                      <div className="h-2 w-2 rounded-full bg-background" />
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-display text-base font-bold text-foreground">
                        {new Date(r.pay_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </div>
                      <div className="text-sm font-bold text-foreground tabular">{fmtUSD(Number(r.net_total))} net</div>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground">Direct deposit</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl surface-glass p-5">
          <div className="flex items-center justify-between">
            <div className="font-display text-lg font-bold text-foreground">Recent activity</div>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </div>
          {loading ? (
            <div className="mt-5 space-y-3">
              <div className="skeleton h-12 w-full" />
              <div className="skeleton h-12 w-full" />
              <div className="skeleton h-12 w-full" />
            </div>
          ) : activity.length === 0 ? (
            <div className="mt-6 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-muted text-foreground"><Sparkles className="h-4 w-4" /></div>
              <div className="mt-3 text-sm font-semibold text-foreground">All quiet here</div>
              <div className="text-xs text-muted-foreground">Activity will appear as your team uses Paylo.</div>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {activity.map((a, i) => (
                <li
                  key={a.id}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="fade-up flex items-start gap-3 rounded-2xl border border-border bg-card p-3 transition-all hover:border-primary/30 hover:-translate-y-0.5"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <a.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.meta}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <QuickCard to="/app/employees" title="Add an employee" desc="Set up hourly or salary." icon={UserPlus} />
        <QuickCard to="/app/time" title="Log hours" desc="Track work for this pay period." icon={Clock} />
        <QuickCard to="/app/benefits" title="Manage benefits" desc="Health, 401(k), and deductions." icon={Sparkles} />
        <QuickCard to="/app/pto" title="Approve time off" desc="Review PTO requests." icon={CalendarDays} />
        <QuickCard to="/app/taxes" title="Tax summary" desc="YTD totals and W-2 previews." icon={FileBadge} />
        <QuickCard to="/app/reports" title="Reports & exports" desc="CSV-ready for accounting." icon={FileText} />
      </div>
    </div>
  );
}

function QuickCard({ to, title, desc, icon: Icon }: { to: string; title: string; desc: string; icon: typeof Users }) {
  return (
    <Link
      to={to}
      className="group rounded-3xl surface-glass p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow"
    >
      <h3 className="mt-4 font-display text-lg font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
        Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
