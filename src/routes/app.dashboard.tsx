import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Paylo" }] }),
  component: Dashboard,
});

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 px-8 py-7">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">{label}</div>
      <div className="unit-num mt-3 text-4xl font-medium text-neutral-950">{value}</div>
      {sub && <div className="mt-1 text-sm text-neutral-500">{sub}</div>}
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

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const nextPayLabel = data.nextPayDate
    ? new Date(data.nextPayDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "Not scheduled";

  return (
    <div className="unit-scope -m-6 min-h-[calc(100vh-4rem)] bg-white p-0 md:-m-8">
      {/* Top bar */}
      <div className="unit-in flex flex-wrap items-end justify-between gap-6 border-b unit-hairline px-8 py-7 md:px-12">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">{today}</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.03em] text-neutral-950 md:text-5xl">Overview</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full border unit-hairline px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50">
            This month
          </button>
          <Link
            to="/app/payroll"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Run payroll
          </Link>
        </div>
      </div>

      {/* Hero KPI with aurora */}
      <div className="unit-in relative overflow-hidden border-b unit-hairline px-8 py-14 md:px-12 md:py-20" style={{ animationDelay: "60ms" }}>
        <div className="unit-aurora pointer-events-none absolute -right-32 top-1/2 h-[460px] w-[460px] -translate-y-1/2 rounded-full" />
        <div className="relative">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Paid this month</div>
          {loading ? (
            <div className="skeleton mt-5 h-16 w-72" />
          ) : (
            <div className="unit-num mt-4 text-6xl font-medium text-neutral-950 md:text-7xl">
              {fmtUSD(data.monthTotal)}
            </div>
          )}
          <div className="mt-5 flex items-center gap-6 text-sm text-neutral-600">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Next payday · <span className="text-neutral-950">{nextPayLabel}</span>
            </span>
            <Link to="/app/payroll" className="inline-flex items-center gap-1 text-neutral-950 underline-offset-4 hover:underline">
              View payroll <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="unit-in grid grid-cols-1 divide-y unit-hairline border-b unit-hairline md:grid-cols-3 md:divide-x md:divide-y-0" style={{ animationDelay: "120ms" }}>
        <StatCell label="Team members" value={loading ? "—" : data.activeEmployees.toLocaleString()} sub="Active" />
        <StatCell label="Time-off requests" value={loading ? "—" : data.pendingPto.toLocaleString()} sub="Pending review" />
        <StatCell label="Upcoming paydays" value={loading ? "—" : data.upcomingRuns.length.toLocaleString()} sub="Next 30 days" />
      </div>

      {/* Activity */}
      <div className="unit-in px-8 py-10 md:px-12 md:py-14" style={{ animationDelay: "180ms" }}>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Recent activity</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">Upcoming paydays</h2>
          </div>
          <Link to="/app/payroll" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-950">
            See all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14" />)}
          </div>
        ) : data.upcomingRuns.length === 0 ? (
          <div className="border-t unit-hairline py-12 text-center">
            <p className="text-neutral-500">No upcoming paydays scheduled.</p>
            <Link to="/app/payroll" className="mt-4 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800">
              Schedule a payday
            </Link>
          </div>
        ) : (
          <div className="border-t unit-hairline">
            {data.upcomingRuns.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b unit-hairline py-5">
                <div className="flex items-center gap-4">
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                  <div>
                    <div className="text-base font-medium text-neutral-950">
                      {new Date(r.pay_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-neutral-500">{r.status}</div>
                  </div>
                </div>
                <div className="unit-num text-lg font-medium text-neutral-950">{fmtUSD(Number(r.net_total ?? 0))}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Birthdays + Anniversaries */}
      <div className="unit-in grid border-t unit-hairline md:grid-cols-2 md:divide-x unit-hairline" style={{ animationDelay: "240ms" }}>
        <div className="px-8 py-10 md:px-12 md:py-14">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Birthdays</div>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">This month</h3>
          {data.birthdays.length === 0 ? (
            <p className="mt-6 text-sm text-neutral-500">Nothing coming up.</p>
          ) : (
            <ul className="mt-6 border-t unit-hairline">
              {data.birthdays.map((b, i) => (
                <li key={i} className="flex items-center justify-between border-b unit-hairline py-4">
                  <span className="text-base text-neutral-900">{b.name}</span>
                  <span className="text-sm text-neutral-500">{b.date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-8 py-10 md:px-12 md:py-14">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Anniversaries</div>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">This month</h3>
          {data.anniversaries.length === 0 ? (
            <p className="mt-6 text-sm text-neutral-500">Nothing coming up.</p>
          ) : (
            <ul className="mt-6 border-t unit-hairline">
              {data.anniversaries.map((a, i) => (
                <li key={i} className="flex items-center justify-between border-b unit-hairline py-4">
                  <span className="text-base text-neutral-900">{a.name}</span>
                  <span className="flex items-center gap-3 text-sm text-neutral-500">
                    <span className="rounded-full border unit-hairline px-2 py-0.5 text-[11px] font-medium text-neutral-700">{a.years} yr</span>
                    {a.date}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
