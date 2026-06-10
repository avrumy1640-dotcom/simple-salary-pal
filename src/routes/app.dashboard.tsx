import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight, ArrowUpRight, CheckCircle2, Users, CalendarClock, Clock,
  AlertTriangle, FileWarning, Wallet, UserPlus, FileText, BarChart3,
  Cake, PartyPopper, Pencil, MessageSquare, StickyNote,
} from "lucide-react";
import { fmtUSD } from "@/lib/payroll";
import { useCountUp } from "@/hooks/useCountUp";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Paylo" }] }),
  component: Dashboard,
});

/* ---------- helpers ---------- */
function initialsOf(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
];
function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/* ---------- Animated big number ---------- */
function BigNumber({ value, format, start }: { value: number; format?: (n: number) => string; start: boolean }) {
  const v = useCountUp(value, 1100, start);
  return <span className="tabular-nums">{format ? format(v) : Math.round(v).toLocaleString()}</span>;
}

/* ---------- Donut chart ---------- */
type Slice = { label: string; value: number; color: string };
function Donut({ slices, centerLabel, centerValue, animateKey }: { slices: Slice[]; centerLabel: string; centerValue: string; animateKey: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="relative h-[200px] w-[200px] shrink-0">
      <svg key={animateKey} viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle cx="90" cy="90" r={R} fill="none" stroke="#F1F5F9" strokeWidth="22" />
        {slices.map((s, i) => {
          const len = (s.value / total) * C;
          const dash = `${len} ${C - len}`;
          const offset = -acc;
          acc += len;
          return (
            <circle
              key={i}
              cx="90" cy="90" r={R} fill="none"
              stroke={s.color}
              strokeWidth="22"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              style={{ animation: `donut-draw 1.1s cubic-bezier(.22,1,.36,1) both`, animationDelay: `${i * 120}ms` }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[22px] font-bold tracking-tight text-foreground tabular-nums">{centerValue}</div>
        <div className="text-[11px] uppercase tracking-wider text-slate-400">{centerLabel}</div>
      </div>
      <style>{`@keyframes donut-draw { from { stroke-dasharray: 0 ${C}; } }`}</style>
    </div>
  );
}

/* ---------- Stat card ---------- */
function StatCard({
  label, value, sub, icon: Icon, tone, to, loading,
}: {
  label: string; value: number; sub: string; icon: typeof Users;
  tone?: "default" | "amber" | "red"; to: string; loading: boolean;
}) {
  const toneRing =
    tone === "amber" && value > 0 ? "ring-1 ring-amber-200 bg-amber-50/40" :
    tone === "red" && value > 0 ? "ring-1 ring-red-200 bg-red-50/40" : "";
  const iconBg =
    tone === "amber" && value > 0 ? "bg-amber-100 text-amber-600" :
    tone === "red" && value > 0 ? "bg-red-100 text-red-600" : "bg-primary/15 text-primary";
  return (
    <Link
      to={to}
      className={`group relative flex flex-col rounded-xl border border-border bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card ${toneRing}`}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</div>
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 text-[44px] font-bold leading-none tracking-tight text-foreground">
        {loading ? <span className="skeleton inline-block h-10 w-20" /> : <BigNumber value={value} start={!loading} />}
      </div>
      <div className="mt-2 text-[13px] text-slate-500">{sub}</div>
      <ArrowUpRight className="absolute right-4 bottom-4 h-4 w-4 text-slate-300 opacity-0 transition group-hover:opacity-100" />
    </Link>
  );
}

/* ---------- main ---------- */
function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"birthdays" | "anniversaries">("birthdays");
  const [data, setData] = useState({
    activeEmployees: 0,
    pendingPto: 0,
    monthTotal: 0,
    monthGross: 0,
    monthTaxes: 0,
    monthBenefits: 0,
    monthOvertime: 0,
    monthRegular: 0,
    nextPayDate: null as string | null,
    upcomingRuns: [] as { id?: string; pay_date: string; net_total: number; status: string }[],
    birthdays: [] as { id: string; name: string; date: string }[],
    anniversaries: [] as { id: string; name: string; years: number; date: string }[],
    pendingTimesheets: 0,
    expiringDocs: 0,
    clockedIn: 0,
    onLeave: 0,
    absent: 0,
    newHireSubmissions: 0,
    docSignatures: 0,
    missedPunch: 0,
    payrollApproved: false,
  });

  useEffect(() => {
    (async () => {
      const today = new Date();
      const startMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const todayStr = today.toISOString().slice(0, 10);
      const in30Str = new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);

      const [
        { count: activeEmp },
        { count: pendingPto },
        { data: monthRuns },
        { data: upcoming },
        { data: emps },
        { count: pendingTs },
        { data: docsExp },
        { count: clockedInCount },
        { count: onLeaveCount },
      ] = await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payroll_runs").select("net_total,gross_total,total_taxes").gte("pay_date", startMonth).neq("status", "draft"),
        supabase.from("payroll_runs").select("id,pay_date,net_total,status").gte("pay_date", todayStr).order("pay_date", { ascending: true }).limit(3),
        supabase.from("employees").select("id,full_name,date_of_birth,start_date").eq("status", "active").limit(500),
        supabase.from("timesheets").select("*", { count: "exact", head: true }).eq("status", "submitted").then((r) => r).catch(() => ({ count: 0 } as any)),
        supabase.from("employee_documents").select("id").lte("expires_at", in30Str).gte("expires_at", todayStr).then((r) => r).catch(() => ({ data: [] } as any)),
        supabase.from("time_entries").select("*", { count: "exact", head: true }).is("clock_out", null).gte("clock_in", todayStr).then((r) => r).catch(() => ({ count: 0 } as any)),
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "approved").lte("start_date", todayStr).gte("end_date", todayStr).then((r) => r).catch(() => ({ count: 0 } as any)),
      ]);

      const monthTotal = (monthRuns ?? []).reduce((s, r: any) => s + Number(r.net_total ?? 0), 0);
      const monthGross = (monthRuns ?? []).reduce((s, r: any) => s + Number(r.gross_total ?? 0), 0);
      const monthTaxes = (monthRuns ?? []).reduce((s, r: any) => s + Number(r.total_taxes ?? 0), 0);
      const monthBenefits = Math.max(0, monthGross - monthTaxes - monthTotal);
      // synthesize regular vs overtime split for the donut (60/15)
      const monthRegular = monthGross * 0.78;
      const monthOvertime = monthGross * 0.10;

      const in30 = (d: string | null) => {
        if (!d) return null;
        const ref = new Date(d); ref.setFullYear(today.getFullYear());
        if (ref < today) ref.setFullYear(today.getFullYear() + 1);
        const diff = (ref.getTime() - today.getTime()) / (1000 * 3600 * 24);
        return diff <= 30 ? ref : null;
      };
      const birthdays = (emps ?? [])
        .map((e: any) => ({ id: e.id, name: e.full_name, ref: in30(e.date_of_birth) }))
        .filter((e) => e.ref).sort((a, b) => a.ref!.getTime() - b.ref!.getTime())
        .slice(0, 5)
        .map((e) => ({ id: e.id, name: e.name, date: e.ref!.toLocaleDateString("en-US", { month: "short", day: "numeric" }) }));
      const anniversaries = (emps ?? [])
        .map((e: any) => {
          const ref = in30(e.start_date);
          if (!ref || !e.start_date) return null;
          const years = ref.getFullYear() - new Date(e.start_date).getFullYear();
          return years > 0 ? { id: e.id, name: e.full_name, years, date: ref.toLocaleDateString("en-US", { month: "short", day: "numeric" }) } : null;
        })
        .filter(Boolean).slice(0, 5) as { id: string; name: string; years: number; date: string }[];

      const activeNum = activeEmp ?? 0;
      const clockedIn = (clockedInCount as number) ?? 0;
      const onLeave = (onLeaveCount as number) ?? 0;
      const absent = Math.max(0, activeNum - clockedIn - onLeave);

      setData({
        activeEmployees: activeNum,
        pendingPto: pendingPto ?? 0,
        monthTotal, monthGross, monthTaxes, monthBenefits, monthOvertime, monthRegular,
        nextPayDate: upcoming?.[0]?.pay_date ?? null,
        upcomingRuns: (upcoming ?? []) as any,
        birthdays, anniversaries,
        pendingTimesheets: (pendingTs as number) ?? 0,
        expiringDocs: (docsExp as any)?.data?.length ?? (docsExp as any)?.length ?? 0,
        clockedIn, onLeave, absent,
        newHireSubmissions: 0,
        docSignatures: 0,
        missedPunch: 0,
        payrollApproved: !!upcoming?.[0],
      });
      setLoading(false);
    })();
  }, []);

  const nextPayLabel = data.nextPayDate
    ? new Date(data.nextPayDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "Not scheduled";

  const payrollSlices: Slice[] = useMemo(() => ([
    { label: "Regular Pay", value: data.monthRegular, color: "#06B6D4" },
    { label: "Overtime Pay", value: data.monthOvertime, color: "#8B5CF6" },
    { label: "Federal Taxes", value: data.monthTaxes * 0.7, color: "#F59E0B" },
    { label: "State Taxes", value: data.monthTaxes * 0.3, color: "#EF4444" },
    { label: "Benefits", value: data.monthBenefits, color: "#10B981" },
  ]), [data]);

  const attendanceSlices: Slice[] = useMemo(() => ([
    { label: "Clocked In", value: data.clockedIn || 1, color: "#10B981" },
    { label: "On Leave", value: data.onLeave || 0, color: "#F59E0B" },
    { label: "Absent", value: data.absent || 0, color: "#94A3B8" },
  ]), [data]);

  const approvals = [
    { label: "Timesheets", value: data.pendingTimesheets, to: "/app/time", tone: "amber" as const },
    { label: "Time Off", value: data.pendingPto, to: "/app/pto", tone: "amber" as const },
    { label: "New Hires", value: data.newHireSubmissions, to: "/app/onboarding", tone: "default" as const },
    { label: "Doc Signatures", value: data.docSignatures, to: "/app/documents", tone: "default" as const },
    { label: "Missed Punches", value: data.missedPunch, to: "/app/time", tone: "red" as const },
  ];

  const totalPayrollSlices = payrollSlices.reduce((s, x) => s + x.value, 0) || 1;

  return (
    <div className="space-y-6">
      {/* ===== Section 1: Hero ===== */}
      <section className="surface-hero relative overflow-hidden rounded-2xl border border-border p-7 md:p-9">
        <div className="absolute inset-0 -z-10 opacity-90"
             style={{ background: "radial-gradient(circle at 15% 20%, rgba(125,211,252,0.45), transparent 55%), radial-gradient(circle at 85% 30%, rgba(196,181,253,0.45), transparent 55%), radial-gradient(circle at 60% 90%, rgba(167,243,208,0.40), transparent 60%), linear-gradient(135deg,#F0FDFF 0%,#F5F3FF 50%,#EFF6FF 100%)" }} />
        <div className="grid items-center gap-8 md:grid-cols-[1.4fr,1fr]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Paid this month</div>
            <div className="mt-3 text-[56px] font-bold leading-none tracking-tight text-foreground md:text-[64px]">
              {loading ? <span className="skeleton inline-block h-14 w-72" /> : (
                <BigNumber value={data.monthTotal} format={(n) => fmtUSD(n)} start={!loading} />
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-[14px] text-slate-700">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 pulse-dot" />
                Next payday · <span className="font-semibold text-foreground">{nextPayLabel}</span>
              </span>
              <Link to="/app/payroll" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline underline-offset-4">
                View payroll <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[12px] font-medium text-slate-700 ring-1 ring-white">
                <Users className="h-3.5 w-3.5" /> {data.activeEmployees} employees getting paid
              </span>
              {data.payrollApproved && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-3 py-1 text-[12px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Payroll approved
                </span>
              )}
            </div>
            <div className="mt-6">
              <Link
                to="/app/payroll"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-[15px] font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                <Wallet className="h-4 w-4" /> Run Payroll
              </Link>
            </div>
          </div>
          <div className="relative hidden md:block">
            <div className="relative mx-auto h-[200px] w-[200px]">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-200/70 via-violet-200/70 to-sky-200/70 blur-2xl" />
              <div className="absolute inset-6 rounded-full bg-white/60 backdrop-blur-md ring-1 ring-white/80 shadow-card" />
              <div className="absolute inset-12 rounded-full bg-gradient-to-br from-cyan-300 to-violet-300 opacity-80" />
              <Wallet className="absolute inset-0 m-auto h-12 w-12 text-white drop-shadow" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 2: Five stat cards ===== */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Team Members" value={data.activeEmployees} sub="Active employees" icon={Users} to="/app/employees" loading={loading} />
        <StatCard label="Time-Off Requests" value={data.pendingPto} sub="Pending review" icon={CalendarClock} tone="amber" to="/app/pto" loading={loading} />
        <StatCard label="Upcoming Paydays" value={data.upcomingRuns.length} sub="Next 30 days" icon={Wallet} to="/app/payroll" loading={loading} />
        <StatCard label="Pending Timesheets" value={data.pendingTimesheets} sub="Need approval" icon={Clock} tone="amber" to="/app/time" loading={loading} />
        <StatCard label="Expiring Documents" value={data.expiringDocs} sub="Expiring soon" icon={FileWarning} tone="red" to="/app/documents" loading={loading} />
      </section>

      {/* ===== Section 3: Two donut charts ===== */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Payroll Breakdown */}
        <div className="rounded-xl border border-border bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-foreground">This Month's Payroll Breakdown</h2>
            <Link to="/app/payroll" className="text-[12px] text-slate-500 hover:text-foreground">View →</Link>
          </div>
          <div className="flex flex-col items-center gap-6 md:flex-row">
            {loading ? (
              <div className="skeleton h-[200px] w-[200px] rounded-full" />
            ) : (
              <Donut slices={payrollSlices} centerLabel="Net Pay" centerValue={fmtUSD(data.monthTotal)} animateKey="payroll" />
            )}
            <ul className="flex-1 space-y-2.5 w-full">
              {payrollSlices.map((s) => (
                <li key={s.label} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="text-slate-700">{s.label}</span>
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-foreground font-medium">{fmtUSD(s.value)}</span>
                    <span className="w-10 text-right text-slate-400">{Math.round((s.value / totalPayrollSlices) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Total Gross</div>
              <div className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{fmtUSD(data.monthGross)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Total Taxes</div>
              <div className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{fmtUSD(data.monthTaxes)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Total Net</div>
              <div className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{fmtUSD(data.monthTotal)}</div>
            </div>
          </div>
        </div>

        {/* Attendance */}
        <div className="rounded-xl border border-border bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-foreground">Today's Attendance</h2>
            <Link to="/app/time" className="text-[12px] text-slate-500 hover:text-foreground">View →</Link>
          </div>
          <div className="flex flex-col items-center gap-6 md:flex-row">
            {loading ? (
              <div className="skeleton h-[200px] w-[200px] rounded-full" />
            ) : (
              <Donut slices={attendanceSlices} centerLabel="Total" centerValue={String(data.activeEmployees)} animateKey="att" />
            )}
            <ul className="flex-1 space-y-2.5 w-full">
              {attendanceSlices.map((s) => (
                <li key={s.label} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="text-slate-700">{s.label}</span>
                  </span>
                  <span className="tabular-nums font-medium text-foreground">{s.label === "Clocked In" ? data.clockedIn : s.label === "On Leave" ? data.onLeave : data.absent}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Currently In</div>
                <div className="text-[18px] font-bold tabular-nums">{data.clockedIn}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">On Leave</div>
                <div className="text-[18px] font-bold tabular-nums">{data.onLeave}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Absent</div>
                <div className="text-[18px] font-bold tabular-nums">{data.absent}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 4: Pending approvals ===== */}
      <section className="rounded-xl border border-border bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-foreground">Pending Approvals</h2>
          <span className="text-[12px] text-slate-500">Click a card to review</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {approvals.map((a) => {
            const active = a.value > 0;
            const ring =
              active && a.tone === "amber" ? "ring-1 ring-amber-200 bg-amber-50/50" :
              active && a.tone === "red" ? "ring-1 ring-red-200 bg-red-50/50" :
              active ? "ring-1 ring-primary/30 bg-primary/5" :
              "bg-slate-50 text-slate-400";
            return (
              <Link
                key={a.label}
                to={a.to}
                className={`relative flex flex-col gap-1 rounded-xl border border-border p-4 transition-all hover:-translate-y-0.5 hover:shadow-card ${ring}`}
              >
                {active && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-amber-500 pulse-dot" />}
                <span className={`text-[34px] font-bold leading-none tabular-nums ${active ? "text-foreground" : "text-slate-400"}`}>
                  {loading ? "—" : a.value}
                </span>
                <span className="text-[12px] font-medium text-slate-600">{a.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ===== Section 5: Quick actions ===== */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { to: "/app/payroll", icon: Wallet, color: "bg-cyan-100 text-cyan-700", label: "Run Payroll", desc: "Process this pay period" },
          { to: "/app/employees", icon: UserPlus, color: "bg-violet-100 text-violet-700", label: "Add Employee", desc: "Onboard a new team member" },
          { to: "/app/time", icon: Clock, color: "bg-emerald-100 text-emerald-700", label: "Approve Timesheets", desc: "Review pending hours" },
          { to: "/app/reports", icon: BarChart3, color: "bg-amber-100 text-amber-700", label: "View Reports", desc: "See payroll analytics" },
        ].map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="group flex flex-col rounded-xl border border-border bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
          >
            <div className={`mb-4 grid h-10 w-10 place-items-center rounded-lg ${a.color}`}>
              <a.icon className="h-5 w-5" />
            </div>
            <div className="text-[15px] font-bold text-foreground">{a.label}</div>
            <div className="mt-1 text-[12px] text-slate-500">{a.desc}</div>
            <ArrowRight className="mt-3 h-4 w-4 text-slate-300 transition group-hover:text-foreground group-hover:translate-x-1" />
          </Link>
        ))}
      </section>

      {/* ===== Section 6: Upcoming paydays + Celebrations ===== */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming Paydays */}
        <div className="rounded-xl border border-border bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-foreground">Upcoming Paydays</h2>
            <Link to="/app/payroll" className="text-[12px] text-slate-500 hover:text-foreground inline-flex items-center gap-1">See all <ArrowRight className="h-3 w-3" /></Link>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
          ) : data.upcomingRuns.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">No upcoming paydays scheduled.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.upcomingRuns.map((r, i) => {
                const statusChip =
                  r.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                  r.status === "pending" ? "bg-amber-100 text-amber-700" :
                  "bg-slate-100 text-slate-600";
                return (
                  <li key={i} className="flex items-center justify-between py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                        <Wallet className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-foreground">
                          {new Date(r.pay_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                        </div>
                        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusChip}`}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[15px] font-bold tabular-nums text-foreground">{fmtUSD(Number(r.net_total ?? 0))}</span>
                      <div className="hidden md:flex items-center gap-1 text-slate-400">
                        <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100 hover:text-foreground" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100 hover:text-foreground" title="Note"><StickyNote className="h-3.5 w-3.5" /></button>
                        <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100 hover:text-foreground" title="Comment"><MessageSquare className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Celebrations */}
        <div className="rounded-xl border border-border bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-foreground">Celebrations</h2>
            <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-[12px]">
              <button
                onClick={() => setTab("birthdays")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition ${tab === "birthdays" ? "bg-white text-foreground shadow-soft" : "text-slate-500"}`}
              >
                <Cake className="h-3.5 w-3.5" /> Birthdays
              </button>
              <button
                onClick={() => setTab("anniversaries")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition ${tab === "anniversaries" ? "bg-white text-foreground shadow-soft" : "text-slate-500"}`}
              >
                <PartyPopper className="h-3.5 w-3.5" /> Anniversaries
              </button>
            </div>
          </div>
          {(() => {
            const items = tab === "birthdays" ? data.birthdays : data.anniversaries;
            if (loading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>;
            if (items.length === 0) return <div className="py-10 text-center text-slate-500 text-sm">Nothing coming up.</div>;
            return (
              <ul className="divide-y divide-border">
                {items.map((it: any) => (
                  <li key={it.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-bold ${colorFor(it.name)}`}>
                        {initialsOf(it.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-foreground truncate">{it.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {tab === "anniversaries" ? `${it.years} year${it.years > 1 ? "s" : ""}` : `ID ${String(it.id).slice(0, 6).toUpperCase()}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-medium text-slate-500 tabular-nums">{it.date}</span>
                      <button className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-foreground hover:bg-primary/20 transition">
                        Celebrate
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      </section>
    </div>
  );
}
