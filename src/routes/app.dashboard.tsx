import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Users, Wallet, Clock, ArrowRight } from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Paylo" }] }),
  component: Dashboard,
});

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function Dashboard() {
  const [empCount, setEmpCount] = useState(0);
  const [lastRun, setLastRun] = useState<{ net_total: number; pay_date: string } | null>(null);
  const [hoursThisPeriod, setHoursThisPeriod] = useState(0);

  useEffect(() => {
    (async () => {
      const { count } = await supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "active");
      setEmpCount(count ?? 0);
      const { data: runs } = await supabase.from("payroll_runs").select("net_total, pay_date").order("pay_date", { ascending: false }).limit(1);
      if (runs && runs[0]) setLastRun(runs[0] as { net_total: number; pay_date: string });
      const since = new Date(); since.setDate(since.getDate() - 14);
      const { data: te } = await supabase.from("time_entries").select("hours, overtime_hours").gte("work_date", since.toISOString().slice(0, 10));
      const total = (te ?? []).reduce((s, r) => s + Number(r.hours) + Number(r.overtime_hours), 0);
      setHoursThisPeriod(total);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back 👋</h1>
          <p className="text-sm text-muted-foreground">Here's a quick look at your payroll.</p>
        </div>
        <Link to="/app/payroll"><Button className="gap-2">Run payroll <ArrowRight className="h-4 w-4" /></Button></Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Active employees" value={String(empCount)} icon={Users} />
        <Stat label="Hours (last 14 days)" value={hoursThisPeriod.toFixed(1)} icon={Clock} />
        <Stat label="Last net payroll" value={lastRun ? fmtUSD(lastRun.net_total) : "—"} icon={Wallet} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <QuickCard to="/app/employees" title="Add an employee" desc="Set up hourly or salary." />
        <QuickCard to="/app/time" title="Log hours" desc="Track work for this pay period." />
        <QuickCard to="/app/payroll" title="Run payroll" desc="Calculate pay and taxes." />
      </div>
    </div>
  );
}

function QuickCard({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-sm text-primary">
        Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
