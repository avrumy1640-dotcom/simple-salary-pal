import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Users, Wallet, CalendarDays, PlayCircle, Cake, Award, ArrowRight } from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Paylo" }] }),
  component: Dashboard,
});

function Tile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-slate-900">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <div className="mt-4 font-display text-3xl font-extrabold tabular text-slate-900">{value}</div>
    </div>
  );
}

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    activeEmployees: 0,
    pendingPto: 0,
    monthTotal: 0,
    nextPayDate: null as string | null,
    upcomingRuns: [] as { pay_date: string; net_total: number; status: string }[],
    birthdays: [] as { name: string; date: string }[],
    anniversaries: [] as { name: string; years: number; date: string }[],
  });

  useEffect(() => {
    (async () => {
      const today = new Date();
      const startMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const [
        { count: activeEmp }, { count: pendingPto },
        { data: monthRuns }, { data: upcoming }, { data: emps },
      ] = await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payroll_runs").select("net_total").gte("pay_date", startMonth).neq("status", "draft"),
        supabase.from("payroll_runs").select("pay_date,net_total,status").gte("pay_date", today.toISOString().slice(0, 10)).order("pay_date", { ascending: true }).limit(3),
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
        .filter((e) => e.ref).sort((a, b) => a.ref!.getTime() - b.ref!.getTime())
        .slice(0, 4)
        .map((e) => ({ name: e.name, date: e.ref!.toLocaleDateString("en-US", { month: "short", day: "numeric" }) }));
      const anniversaries = (emps ?? [])
        .map((e: any) => {
          const ref = in30(e.start_date);
          if (!ref || !e.start_date) return null;
          const years = ref.getFullYear() - new Date(e.start_date).getFullYear();
          return years > 0 ? { name: e.full_name, years, date: ref.toLocaleDateString("en-US", { month: "short", day: "numeric" }) } : null;
        })
        .filter(Boolean).slice(0, 4) as { name: string; years: number; date: string }[];

      setData({
        activeEmployees: activeEmp ?? 0,
        pendingPto: pendingPto ?? 0,
        monthTotal,
        nextPayDate: upcoming?.[0]?.pay_date ?? null,
        upcomingRuns: (upcoming ?? []) as any,
        birthdays,
        anniversaries,
      });
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Welcome back</h1>
          <p className="mt-2 text-base text-slate-600">Here's what's happening with your team today.</p>
        </div>
        <Button asChild size="lg">
          <Link to="/app/payroll"><PlayCircle className="mr-2 h-5 w-5" />Run payroll</Link>
        </Button>
      </div>

      {/* 4 simple tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-6">
            <div className="skeleton h-4 w-24" /><div className="skeleton mt-5 h-8 w-24" />
          </div>
        )) : (
          <>
            <Tile label="Team members" value={data.activeEmployees.toLocaleString()} icon={Users} />
            <Tile label="Paid this month" value={fmtUSD(data.monthTotal)} icon={Wallet} />
            <Tile label="Time-off requests" value={data.pendingPto.toLocaleString()} icon={CalendarDays} />
            <Tile label="Next payday" value={data.nextPayDate ? new Date(data.nextPayDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} icon={PlayCircle} />
          </>
        )}
      </div>

      {/* Upcoming payrolls */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 className="font-display text-lg font-bold text-slate-900">Upcoming paydays</h2>
          <Button asChild variant="ghost" size="sm"><Link to="/app/payroll">See all <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </div>
        {data.upcomingRuns.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-base text-slate-600">No upcoming paydays scheduled.</p>
            <Button asChild className="mt-4"><Link to="/app/payroll">Schedule a payday</Link></Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.upcomingRuns.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-4">
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    {new Date(r.pay_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </div>
                  <div className="text-sm capitalize text-slate-500">{r.status}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold tabular text-slate-900">{fmtUSD(Number(r.net_total ?? 0))}</div>
                  <div className="text-xs text-slate-500">Total pay</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Birthdays + Anniversaries */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-6 py-5">
            <Cake className="h-5 w-5 text-slate-500" />
            <h3 className="font-display text-base font-bold text-slate-900">Birthdays this month</h3>
          </div>
          {data.birthdays.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">Nothing coming up.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.birthdays.map((b, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-3">
                  <span className="text-base text-slate-800">{b.name}</span>
                  <span className="text-sm font-medium text-slate-500">{b.date}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-6 py-5">
            <Award className="h-5 w-5 text-slate-500" />
            <h3 className="font-display text-base font-bold text-slate-900">Work anniversaries</h3>
          </div>
          {data.anniversaries.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">Nothing coming up.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.anniversaries.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-3">
                  <span className="text-base text-slate-800">{a.name}</span>
                  <span className="text-sm font-medium text-slate-500">
                    <span className="mr-2 rounded-md bg-primary/20 px-2 py-0.5 text-xs font-bold text-slate-900">{a.years} yr</span>
                    {a.date}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
