import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Wallet, Play, Square, CalendarDays, FileText, CheckCircle2, Clock as ClockIcon,
  MapPin, FolderOpen, ChevronRight, Zap,
} from "lucide-react";

export const Route = createFileRoute("/employee/home")({
  head: () => ({ meta: [{ title: "My workplace — Paylo" }] }),
  component: EmployeeHome,
});

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function daysUntil(iso: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
function elapsedFmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

const PTO_TOTALS = {
  vacation: { total: 120, color: "bg-emerald-500", tone: "text-emerald-700", bg: "bg-emerald-50" },
  sick:     { total: 80,  color: "bg-sky-500",     tone: "text-sky-700",     bg: "bg-sky-50" },
  personal: { total: 40,  color: "bg-violet-500",  tone: "text-violet-700",  bg: "bg-violet-50" },
} as const;
type PtoKind = keyof typeof PTO_TOTALS;

function EmployeeHome() {
  const { employee, loading } = useMyEmployee();
  const [nextPayDate, setNextPayDate] = useState<string | null>(null);
  const [lastNet, setLastNet] = useState<number | null>(null);
  const [lastPunch, setLastPunch] = useState<{ id: string; punched_at: string; punch_type: string } | null>(null);
  const [punches, setPunches] = useState<{ punched_at: string; punch_type: string }[]>([]);
  const [ptoUsedByType, setPtoUsedByType] = useState<Record<PtoKind, number>>({ vacation: 0, sick: 0, personal: 0 });
  const [activity, setActivity] = useState<{ icon: "pay" | "pto" | "doc"; text: string; date: string }[]>([]);
  const [podAvailable, setPodAvailable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    if (!employee) return;
    const [items, runs, lastPunches, allPunches, ptos, docs] = await Promise.all([
      supabase.from("payroll_items")
        .select("net_pay, payroll_runs(pay_date, status)")
        .eq("employee_id", employee.id).order("created_at", { ascending: false }).limit(3),
      supabase.from("payroll_runs")
        .select("pay_date").gte("pay_date", new Date().toISOString().slice(0, 10))
        .order("pay_date", { ascending: true }).limit(1),
      supabase.from("time_clock_punches")
        .select("id, punched_at, punch_type")
        .eq("employee_id", employee.id).order("punched_at", { ascending: false }).limit(1),
      supabase.from("time_clock_punches")
        .select("punched_at, punch_type")
        .eq("employee_id", employee.id)
        .gte("punched_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order("punched_at", { ascending: true }),
      supabase.from("pto_entries")
        .select("pto_type, hours, status, start_date, end_date")
        .eq("employee_id", employee.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("hr_documents").select("title, created_at")
        .or(`employee_id.eq.${employee.id},employee_id.is.null`)
        .order("created_at", { ascending: false }).limit(2),
    ]);

    const it: any = items.data?.[0];
    if (it) setLastNet(Number(it.net_pay));
    if (runs.data?.[0]) setNextPayDate(runs.data[0].pay_date);
    setLastPunch((lastPunches.data?.[0] as any) ?? null);
    setPunches((allPunches.data ?? []) as any);

    // PTO used per type (approved only) from pto_entries
    const used: Record<PtoKind, number> = { vacation: 0, sick: 0, personal: 0 };
    for (const e of (ptos.data ?? []) as any[]) {
      if (e.status === "approved" && (used as any)[e.pto_type] !== undefined) {
        (used as any)[e.pto_type] += Number(e.hours);
      }
    }
    setPtoUsedByType(used);

    // Recent activity
    const acts: { icon: "pay" | "pto" | "doc"; text: string; date: string }[] = [];
    for (const p of (items.data ?? []) as any[]) {
      if (p.payroll_runs?.pay_date) {
        acts.push({
          icon: "pay",
          text: `Paycheck of ${fmt(Number(p.net_pay))} ${p.payroll_runs.status === "paid" ? "deposited" : "scheduled"}`,
          date: p.payroll_runs.pay_date,
        });
      }
    }
    for (const e of ((ptos.data ?? []) as any[]).slice(0, 2)) {
      acts.push({
        icon: "pto",
        text: `Time off request for ${e.start_date}${e.end_date !== e.start_date ? ` to ${e.end_date}` : ""} — ${e.status}`,
        date: e.start_date,
      });
    }
    for (const d of (docs.data ?? []) as any[]) {
      acts.push({ icon: "doc", text: `${d.title} is available`, date: d.created_at });
    }
    acts.sort((a, b) => +new Date(b.date) - +new Date(a.date));
    setActivity(acts.slice(0, 5));

    // Pay On-Demand available
    const { data: lastRun } = await supabase.from("payroll_runs")
      .select("period_end").eq("company_id", employee.company_id).eq("status", "paid")
      .order("pay_date", { ascending: false }).limit(1);
    const sinceDate = lastRun?.[0]?.period_end ?? new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const { data: te } = await supabase.from("time_entries")
      .select("hours, overtime_hours").eq("employee_id", employee.id).gt("work_date", sinceDate);
    const totalHours = (te ?? []).reduce((acc: number, r: any) =>
      acc + Number(r.hours || 0) + Number(r.overtime_hours || 0) * 1.5, 0);
    const rate = Number((employee as any).pay_rate || 0);
    const earned = (employee as any).pay_type === "salary" ? rate / 26 : rate * totalHours;
    const { data: podPending } = await supabase.from("pay_on_demand_requests")
      .select("requested_amount, status").eq("employee_id", employee.id)
      .in("status", ["pending", "approved"]);
    const pendingTotal = (podPending ?? []).reduce((a: number, r: any) => a + Number(r.requested_amount || 0), 0);
    setPodAvailable(Math.max(0, Math.round(earned * 0.5 * 100) / 100 - pendingTotal));
  }
  useEffect(() => { load(); }, [employee?.id]);
  useRealtimeRefresh(
    ["pto_entries", "expense_requests", "general_requests", "pay_on_demand_requests", "notifications", "announcements", "payroll_runs"],
    load,
    { companyId: employee?.company_id ?? null }
  );

  const clockedIn = lastPunch?.punch_type === "in" || lastPunch?.punch_type === "break_end";

  // Today's worked total (rough): pair sequential in -> out segments
  const todayWorkedMs = useMemo(() => {
    let total = 0;
    let start: Date | null = null;
    for (const p of punches) {
      if (p.punch_type === "in" || p.punch_type === "break_end") {
        start = new Date(p.punched_at);
      } else if ((p.punch_type === "out" || p.punch_type === "break_start") && start) {
        total += +new Date(p.punched_at) - +start;
        start = null;
      }
    }
    if (clockedIn && lastPunch) {
      total += +now - +new Date(lastPunch.punched_at);
    }
    return total;
  }, [punches, now, clockedIn, lastPunch]);

  async function punch(type: "in" | "out") {
    if (!employee) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = await supabase.from("time_clock_punches").insert({
      employee_id: employee.id, company_id: employee.company_id, user_id: user.id,
      punch_type: type, punched_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (type === "in") toast.success("Clocked in");
    else toast.success(`Clocked out. You worked ${elapsedFmt(todayWorkedMs)} today.`);
    load();
  }

  if (loading) return <div className="text-base text-slate-500">Loading…</div>;
  if (!employee) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-soft">
        <CalendarDays className="mx-auto h-12 w-12 text-slate-400" />
        <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">Welcome!</h1>
        <p className="mx-auto mt-2 max-w-md text-base text-slate-600">
          We couldn't find an employee record linked to your email. Ask your admin to add you to the team roster.
        </p>
      </div>
    );
  }

  const first = employee.full_name.split(" ")[0];
  const greet = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const todayStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

  const clockedInSince = clockedIn && lastPunch ? +now - +new Date(lastPunch.punched_at) : 0;
  const payDays = nextPayDate ? daysUntil(nextPayDate) : null;
  const nextPayPretty = nextPayDate
    ? new Date(nextPayDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "Not scheduled";

  return (
    <div className="space-y-6 unit-in">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">
          {greet}, {first}
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">{todayStr}</p>
      </div>

      {/* Hero payday card */}
      <div className="relative overflow-hidden rounded-3xl border border-border p-6 sm:p-8 shadow-soft"
           style={{ background: "var(--gradient-primary, linear-gradient(135deg, oklch(0.94 0.05 250), oklch(0.96 0.03 280)))" }}>
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/30 blur-3xl" />
        <div className="relative grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700/70">Next Payday</div>
            <div className="mt-2 font-display text-3xl sm:text-4xl font-extrabold tabular text-slate-900">
              {nextPayPretty}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {payDays === null ? "—" : payDays === 0 ? "Today" : payDays === 1 ? "Tomorrow" : `in ${payDays} days`}
            </div>
          </div>
          <div className="sm:border-l sm:border-white/40 sm:pl-6">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700/70">Last Paycheck</div>
            <div className="mt-2 font-display text-3xl sm:text-4xl font-extrabold tabular text-slate-900">
              {lastNet != null ? fmt(lastNet) : "—"}
            </div>
            <Link to="/employee/paystubs" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              View pay stub →
            </Link>
          </div>
        </div>
      </div>

      {/* Pay On-Demand */}
      <Link
        to="/employee/pay-on-demand"
        className="group flex items-center gap-4 rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-soft transition hover:border-primary/40 hover:shadow-md active:translate-y-px"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <Zap className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-bold text-slate-900">Pay On-Demand</div>
          <div className="mt-0.5 text-sm text-slate-500">
            Available now: <span className="font-display font-extrabold tabular text-slate-900">{fmt(podAvailable)}</span>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft">
          Get Paid Early
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-slate-500 sm:hidden" />
      </Link>

      {/* Clock In/Out widget */}
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Time clock</div>
        <div className="mt-2 font-display text-4xl sm:text-5xl font-extrabold tabular text-slate-900">{timeStr}</div>
        <div className="mt-1 text-sm text-slate-500">{todayStr}</div>

        {clockedIn ? (
          <>
            <Button
              onClick={() => punch("out")}
              disabled={busy}
              className="mt-5 h-[120px] sm:h-[200px] w-full rounded-3xl bg-rose-600 text-2xl sm:text-3xl font-extrabold text-white shadow-lg shadow-rose-600/25 transition active:scale-[0.99] hover:bg-rose-700"
            >
              <Square className="mr-3 h-7 w-7" /> Clock Out
            </Button>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Clocked in for {elapsedFmt(clockedInSince)}
            </div>
          </>
        ) : (
          <>
            <Button
              onClick={() => punch("in")}
              disabled={busy}
              className="mt-5 h-[120px] sm:h-[200px] w-full rounded-3xl bg-emerald-600 text-2xl sm:text-3xl font-extrabold text-white shadow-lg shadow-emerald-600/25 transition active:scale-[0.99] hover:bg-emerald-700"
            >
              <Play className="mr-3 h-7 w-7" /> Clock In
            </Button>
            {todayWorkedMs > 0 && (
              <div className="mt-3 text-sm text-slate-500">You worked {elapsedFmt(todayWorkedMs)} today.</div>
            )}
          </>
        )}
      </div>

      {/* PTO balance bars */}
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-display text-lg font-bold text-slate-900">Time off available</div>
            <p className="text-sm text-slate-500">Days remaining this year</p>
          </div>
          <Link to="/employee/pto" className="text-sm font-semibold text-primary hover:underline">
            Request →
          </Link>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {(Object.keys(PTO_TOTALS) as PtoKind[]).map((k) => {
            const t = PTO_TOTALS[k];
            const usedH = ptoUsedByType[k];
            const remH = Math.max(0, t.total - usedH);
            const pct = Math.min(100, Math.round((remH / t.total) * 100));
            return (
              <div key={k}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold capitalize text-slate-700">{k} days</span>
                  <span className="font-display text-base font-bold text-slate-900">{(remH / 8).toFixed(0)} of {(t.total / 8).toFixed(0)}</span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${t.color}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 text-xs text-slate-500">{(usedH / 8).toFixed(1)} days used</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* More tools */}
      <div>
        <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">More</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { to: "/employee/schedule", label: "My schedule", desc: "Shifts & swaps", icon: CalendarDays, tone: "bg-violet-50 text-violet-700" },
            { to: "/employee/punch", label: "Clock in / out", desc: "Punches & geofence", icon: MapPin, tone: "bg-emerald-50 text-emerald-700" },
            { to: "/employee/documents", label: "Documents", desc: "Handbook & forms", icon: FolderOpen, tone: "bg-sky-50 text-sky-700" },
          ].map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:border-primary/40 hover:shadow-md active:translate-y-px"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${q.tone}`}>
                <q.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{q.label}</span>
                <span className="block truncate text-[12px] text-slate-500">{q.desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-3xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <div className="font-display text-lg font-bold text-slate-900">Recent activity</div>
        </div>
        {activity.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">Nothing yet — check back after your first paycheck.</div>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((a, i) => {
              const Icon = a.icon === "pay" ? Wallet : a.icon === "pto" ? CalendarDays : FileText;
              const tone = a.icon === "pay" ? "bg-emerald-50 text-emerald-700" : a.icon === "pto" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700";
              return (
                <li key={i} className="flex items-center gap-3 px-6 py-4">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{a.text}</div>
                    <div className="text-xs text-slate-500">{new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                  </div>
                  {a.icon === "pto" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  {a.icon === "pay" && <ClockIcon className="h-4 w-4 text-slate-300" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
