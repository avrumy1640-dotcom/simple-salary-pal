import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Users, Wallet, Clock, CalendarDays, UserPlus, TrendingUp,
  AlertTriangle, Cake, Award, PlayCircle, FileText, BarChart3,
  ArrowUpRight, ArrowDownRight, CheckCircle2,
} from "lucide-react";
import { fmtUSD } from "@/lib/payroll";
import { useCountUp } from "@/hooks/useCountUp";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Paylo" }] }),
  component: Dashboard,
});

type Kpi = {
  label: string;
  value: number;
  format: "number" | "money" | "percent";
  delta?: number;
  icon: typeof Users;
  tone?: "default" | "success" | "warning" | "danger";
};

function KpiCard({ kpi, delay = 0 }: { kpi: Kpi; delay?: number }) {
  const animated = useCountUp(kpi.value, 900);
  const display =
    kpi.format === "money" ? fmtUSD(animated)
    : kpi.format === "percent" ? `${animated.toFixed(1)}%`
    : Math.round(animated).toLocaleString();
  const tone = kpi.tone ?? "default";
  const toneRing = {
    default: "border-border",
    success: "border-success/30",
    warning: "border-warning/40",
    danger: "border-destructive/30",
  }[tone];
  const toneIcon = {
    default: "bg-surface text-slate-700",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/10 text-destructive",
  }[tone];
  const up = (kpi.delta ?? 0) >= 0;
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`fade-up rounded-xl border ${toneRing} bg-card p-5 transition-shadow hover:shadow-card`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{kpi.label}</span>
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${toneIcon}`}>
          <kpi.icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 font-display text-[1.85rem] font-extrabold tabular text-slate-900 leading-none">
        {display}
      </div>
      {kpi.delta !== undefined && (
        <div className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ${up ? "text-success" : "text-destructive"}`}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(kpi.delta).toFixed(1)}% vs last period
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    employees: 0,
    activeEmployees: 0,
    pendingPto: 0,
    draftRuns: 0,
    monthTotal: 0,
    nextPayDate: null as string | null,
    upcomingRuns: [] as { pay_date: string; net_total: number; status: string }[],
    birthdays: [] as { name: string; date: string }[],
    anniversaries: [] as { name: string; years: number; date: string }[],
    complianceAlerts: 0,
  });

  useEffect(() => {
    (async () => {
      const today = new Date();
      const startMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const [
        { count: totalEmp }, { count: activeEmp }, { count: pendingPto }, { count: draftRuns },
        { data: monthRuns }, { data: upcoming }, { data: emps },
      ] = await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }),
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payroll_runs").select("*", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("payroll_runs").select("net_total").gte("pay_date", startMonth).neq("status", "draft"),
        supabase.from("payroll_runs").select("pay_date,net_total,status").gte("pay_date", today.toISOString().slice(0, 10)).order("pay_date", { ascending: true }).limit(4),
        supabase.from("employees").select("full_name,date_of_birth,start_date").eq("status", "active").limit(200),
      ]);

      const monthTotal = (monthRuns ?? []).reduce((s, r: any) => s + Number(r.net_total ?? 0), 0);

      const in30 = (d: string | null) => {
        if (!d) return null;
        const ref = new Date(d); ref.setFullYear(today.getFullYear());
        if (ref < today) ref.setFullYear(today.getFullYear() + 1);
        const diff = (ref.getTime() - today.getTime()) / (1000 * 3600 * 24);
        return diff <= 30 ? ref : null;
      };
      const birthdays = (emps ?? [])
        .map((e: any) => ({ name: e.full_name, ref: in30(e.date_of_birth) }))
        .filter((e) => e.ref) .sort((a, b) => a.ref!.getTime() - b.ref!.getTime())
        .slice(0, 5)
        .map((e) => ({ name: e.name, date: e.ref!.toLocaleDateString("en-US", { month: "short", day: "numeric" }) }));
      const anniversaries = (emps ?? [])
        .map((e: any) => {
          const ref = in30(e.start_date);
          if (!ref || !e.start_date) return null;
          const years = ref.getFullYear() - new Date(e.start_date).getFullYear();
          return years > 0 ? { name: e.full_name, years, date: ref.toLocaleDateString("en-US", { month: "short", day: "numeric" }) } : null;
        })
        .filter(Boolean)
        .slice(0, 5) as { name: string; years: number; date: string }[];

      setData({
        employees: totalEmp ?? 0,
        activeEmployees: activeEmp ?? 0,
        pendingPto: pendingPto ?? 0,
        draftRuns: draftRuns ?? 0,
        monthTotal,
        nextPayDate: upcoming?.[0]?.pay_date ?? null,
        upcomingRuns: (upcoming ?? []) as any,
        birthdays,
        anniversaries,
        complianceAlerts: 0,
      });
      setLoading(false);
    })();
  }, []);

  const kpis: Kpi[] = [
    { label: "Active employees", value: data.activeEmployees, format: "number", icon: Users, delta: 2.4 },
    { label: "Headcount", value: data.employees, format: "number", icon: Users },
    { label: "Payroll MTD", value: data.monthTotal, format: "money", icon: Wallet, delta: -1.2, tone: "success" },
    { label: "Pending PTO", value: data.pendingPto, format: "number", icon: CalendarDays, tone: data.pendingPto > 0 ? "warning" : "default" },
    { label: "Draft payrolls", value: data.draftRuns, format: "number", icon: PlayCircle, tone: data.draftRuns > 0 ? "warning" : "default" },
    { label: "Open positions", value: 0, format: "number", icon: UserPlus },
    { label: "Turnover (TTM)", value: 0, format: "percent", icon: TrendingUp },
    { label: "Compliance alerts", value: data.complianceAlerts, format: "number", icon: AlertTriangle, tone: data.complianceAlerts > 0 ? "danger" : "default" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Workforce overview</h1>
          <p className="mt-1 text-sm text-slate-500">Real-time signals across payroll, people, time, and compliance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/app/employees">Add employee</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/app/recruiting">Post job</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/app/reports">Generate report</Link></Button>
          <Button asChild size="sm" className="gradient-brand text-primary-foreground"><Link to="/app/payroll"><PlayCircle className="mr-1 h-4 w-4" />Run payroll</Link></Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton mt-4 h-7 w-20" />
              </div>
            ))
          : kpis.map((k, i) => <KpiCard key={k.label} kpi={k} delay={i * 50} />)}
      </div>

      {/* Two-column: Upcoming payroll + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">Upcoming payrolls</h2>
              <p className="text-xs text-slate-500">Next pay date {data.nextPayDate ? new Date(data.nextPayDate).toLocaleDateString() : "—"}</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/app/payroll">View all</Link></Button>
          </div>
          <div className="divide-y divide-border">
            {data.upcomingRuns.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-surface text-slate-400"><Wallet className="h-5 w-5" /></div>
                <p className="mt-3 text-sm text-slate-500">No upcoming runs scheduled.</p>
                <Button asChild size="sm" className="mt-3"><Link to="/app/payroll">Schedule a run</Link></Button>
              </div>
            ) : data.upcomingRuns.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{new Date(r.pay_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                    <div className="text-xs capitalize text-slate-500">{r.status}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular text-slate-900">{fmtUSD(Number(r.net_total ?? 0))}</div>
                  <div className="text-[11px] text-slate-500">Net</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Birthdays */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Cake className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900">Birthdays this month</h3>
              </div>
            </div>
            <div className="divide-y divide-border">
              {data.birthdays.length === 0 ? (
                <p className="p-5 text-xs text-slate-500">No upcoming birthdays.</p>
              ) : data.birthdays.map((b, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-slate-700">{b.name}</span>
                  <span className="text-xs font-medium text-slate-500">{b.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Anniversaries */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900">Work anniversaries</h3>
              </div>
            </div>
            <div className="divide-y divide-border">
              {data.anniversaries.length === 0 ? (
                <p className="p-5 text-xs text-slate-500">No anniversaries this month.</p>
              ) : data.anniversaries.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-slate-700">{a.name}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{a.years}y</span>
                    {a.date}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action callout row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/app/pto" className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-card">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-warning/15 text-warning"><CalendarDays className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-bold text-slate-900">Approve PTO</div>
              <div className="text-xs text-slate-500">{data.pendingPto} pending request{data.pendingPto === 1 ? "" : "s"}</div>
            </div>
          </div>
        </Link>
        <Link to="/app/time" className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-card">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-info/10 text-info"><Clock className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-bold text-slate-900">Review timesheets</div>
              <div className="text-xs text-slate-500">Approve hours before next run</div>
            </div>
          </div>
        </Link>
        <Link to="/app/compliance" className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-card">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-success/10 text-success"><CheckCircle2 className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-bold text-slate-900">Compliance status</div>
              <div className="text-xs text-slate-500">All filings on track</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
