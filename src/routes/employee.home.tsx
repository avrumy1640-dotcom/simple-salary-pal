import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Wallet, CalendarDays, Clock, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/employee/home")({
  head: () => ({ meta: [{ title: "My workplace — Paylo" }] }),
  component: EmployeeHome,
});

function fmt(n: number) { return n.toLocaleString("en-US", { style: "currency", currency: "USD" }); }

function EmployeeHome() {
  const { employee, loading } = useMyEmployee();
  const [nextPayDate, setNextPayDate] = useState<string | null>(null);
  const [lastNet, setLastNet] = useState<number | null>(null);

  useEffect(() => {
    if (!employee) return;
    (async () => {
      const { data: items } = await supabase
        .from("payroll_items")
        .select("net_pay, payroll_runs(pay_date, status)")
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const it: any = items?.[0];
      if (it) setLastNet(Number(it.net_pay));
      const { data: nextRun } = await supabase
        .from("payroll_runs")
        .select("pay_date")
        .gte("pay_date", new Date().toISOString().slice(0, 10))
        .order("pay_date", { ascending: true })
        .limit(1);
      if (nextRun?.[0]) setNextPayDate(nextRun[0].pay_date);
    })();
  }, [employee?.id]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  if (!employee) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">Welcome!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't find an employee record linked to your email. Ask your
          administrator to add you to the team roster, then sign back in.
        </p>
      </div>
    );
  }

  const first = employee.full_name.split(" ")[0];
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-primary">Employee portal</div>
        <h1 className="text-3xl font-semibold tracking-tight">Hi {first} 👋</h1>
        <p className="text-sm text-muted-foreground">Here's your latest at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile icon={Wallet} label="Last net pay" value={lastNet != null ? fmt(lastNet) : "—"} href="/employee/paystubs" />
        <Tile icon={CalendarDays} label="PTO available" value={`${Number(employee.pto_balance_hours).toFixed(1)}h`} href="/employee/pto" />
        <Tile icon={Clock} label="Next pay date" value={nextPayDate ?? "Not scheduled"} href="/employee/paystubs" />
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h2 className="font-semibold">Quick actions</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link to="/employee/pto" className="flex items-center justify-between rounded-xl border p-4 hover:bg-surface">
            <span>Request time off</span> <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/employee/time" className="flex items-center justify-between rounded-xl border p-4 hover:bg-surface">
            <span>Clock in / out</span> <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/employee/profile" className="flex items-center justify-between rounded-xl border p-4 hover:bg-surface">
            <span>Update my info</span> <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/employee/documents" className="flex items-center justify-between rounded-xl border p-4 hover:bg-surface">
            <span>View documents</span> <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, href }: { icon: any; label: string; value: string; href: string }) {
  return (
    <Link to={href} className="rounded-2xl border bg-card p-5 hover:shadow-soft transition">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </Link>
  );
}
