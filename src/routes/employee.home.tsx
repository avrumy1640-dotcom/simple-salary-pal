import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Wallet, CalendarDays, Clock, ArrowRight, FileText, User } from "lucide-react";

export const Route = createFileRoute("/employee/home")({
  head: () => ({ meta: [{ title: "My workplace — Paylo" }] }),
  component: EmployeeHome,
});

function fmt(n: number) { return n.toLocaleString("en-US", { style: "currency", currency: "USD" }); }

function Tile({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
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

function ActionLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 transition-shadow hover:shadow-card">
      <span className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-slate-900">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-base font-semibold text-slate-900">{label}</span>
      </span>
      <ArrowRight className="h-5 w-5 text-slate-400" />
    </Link>
  );
}

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

  if (loading) return <div className="text-base text-slate-500">Loading…</div>;

  if (!employee) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <CalendarDays className="mx-auto h-12 w-12 text-slate-400" />
        <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">Welcome!</h1>
        <p className="mx-auto mt-2 max-w-md text-base text-slate-600">
          We couldn't find an employee record linked to your email. Ask your
          administrator to add you to the team roster, then sign back in.
        </p>
      </div>
    );
  }

  const first = employee.full_name.split(" ")[0];
  const nextDateFmt = nextPayDate
    ? new Date(nextPayDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Not scheduled";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Hi {first}
          </h1>
          <p className="mt-2 text-base text-slate-600">Here's everything you need today.</p>
        </div>
        <Button asChild size="lg">
          <Link to="/employee/pto">Request time off</Link>
        </Button>
      </div>

      {/* 3 tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile icon={Wallet} label="Last paycheck" value={lastNet != null ? fmt(lastNet) : "—"} />
        <Tile icon={CalendarDays} label="Time off available" value={`${Number(employee.pto_balance_hours).toFixed(0)} hrs`} />
        <Tile icon={Clock} label="Next payday" value={nextDateFmt} />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="font-display text-lg font-bold text-slate-900">What would you like to do?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ActionLink to="/employee/paystubs" icon={Wallet} label="View my paychecks" />
          <ActionLink to="/employee/pto" icon={CalendarDays} label="Request time off" />
          <ActionLink to="/employee/time" icon={Clock} label="Clock in or out" />
          <ActionLink to="/employee/documents" icon={FileText} label="View my documents" />
          <ActionLink to="/employee/profile" icon={User} label="Update my information" />
        </div>
      </div>
    </div>
  );
}
