import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { calcPay, fmtUSD } from "@/lib/payroll";
import { CheckCircle2, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/app/payroll")({
  head: () => ({ meta: [{ title: "Run payroll — Paylo" }] }),
  component: PayrollPage,
});

interface Emp {
  id: string;
  full_name: string;
  pay_type: "hourly" | "salary";
  pay_rate: number;
}

interface Row {
  emp: Emp;
  regularHours: number;
  overtimeHours: number;
}

function PayrollPage() {
  const today = new Date();
  const start = new Date(today); start.setDate(today.getDate() - 13);
  const [periodStart, setPeriodStart] = useState(start.toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(today.toISOString().slice(0, 10));
  const [payDate, setPayDate] = useState(new Date(today.getTime() + 86400000 * 5).toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentRuns, setRecentRuns] = useState<{ id: string; period_start: string; period_end: string; net_total: number; status: string }[]>([]);

  async function loadRuns() {
    const { data } = await supabase.from("payroll_runs").select("id, period_start, period_end, net_total, status").order("created_at", { ascending: false }).limit(5);
    setRecentRuns((data ?? []) as typeof recentRuns);
  }

  async function loadPreview() {
    setLoading(true);
    const { data: emps } = await supabase.from("employees").select("id, full_name, pay_type, pay_rate").eq("status", "active");
    const { data: te } = await supabase.from("time_entries").select("employee_id, hours, overtime_hours").gte("work_date", periodStart).lte("work_date", periodEnd);
    const hoursByEmp = new Map<string, { reg: number; ot: number }>();
    (te ?? []).forEach((r) => {
      const cur = hoursByEmp.get(r.employee_id) ?? { reg: 0, ot: 0 };
      cur.reg += Number(r.hours);
      cur.ot += Number(r.overtime_hours);
      hoursByEmp.set(r.employee_id, cur);
    });
    const next: Row[] = (emps ?? []).map((e) => {
      const h = hoursByEmp.get(e.id) ?? { reg: 0, ot: 0 };
      return {
        emp: { ...e, pay_rate: Number(e.pay_rate) } as Emp,
        regularHours: e.pay_type === "salary" ? 0 : h.reg,
        overtimeHours: e.pay_type === "salary" ? 0 : h.ot,
      };
    });
    setRows(next);
    setLoading(false);
  }

  useEffect(() => { loadRuns(); loadPreview(); /* eslint-disable-next-line */ }, []);

  const calc = useMemo(() => rows.map((r) => ({
    row: r,
    pay: calcPay({
      payType: r.emp.pay_type,
      payRate: r.emp.pay_rate,
      regularHours: r.regularHours,
      overtimeHours: r.overtimeHours,
    }),
  })), [rows]);

  const totals = useMemo(() => {
    return calc.reduce((acc, c) => ({
      gross: acc.gross + c.pay.gross,
      tax: acc.tax + c.pay.federalTax + c.pay.stateTax + c.pay.socialSecurity + c.pay.medicare,
      net: acc.net + c.pay.net,
    }), { gross: 0, tax: 0, net: 0 });
  }, [calc]);

  async function runPayroll() {
    if (calc.length === 0) { toast.error("No active employees"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: run, error: e1 } = await supabase.from("payroll_runs").insert({
      owner_id: user.id,
      period_start: periodStart,
      period_end: periodEnd,
      pay_date: payDate,
      gross_total: totals.gross,
      tax_total: totals.tax,
      net_total: totals.net,
      status: "approved",
    }).select().single();
    if (e1 || !run) { toast.error(e1?.message || "Failed"); return; }
    const items = calc.map((c) => ({
      owner_id: user.id,
      run_id: run.id,
      employee_id: c.row.emp.id,
      employee_name: c.row.emp.full_name,
      regular_hours: c.pay.regularHours,
      overtime_hours: c.pay.overtimeHours,
      gross_pay: c.pay.gross,
      federal_tax: c.pay.federalTax,
      social_security: c.pay.socialSecurity,
      medicare: c.pay.medicare,
      state_tax: c.pay.stateTax,
      net_pay: c.pay.net,
    }));
    const { error: e2 } = await supabase.from("payroll_items").insert(items);
    if (e2) { toast.error(e2.message); return; }
    toast.success(`Payroll approved — ${fmtUSD(totals.net)} net`);
    loadRuns();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run payroll</h1>
        <p className="text-sm text-muted-foreground">Review and approve pay for this period.</p>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>Period start</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label>Period end</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div>
            <Label>Pay date</Label>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={loadPreview} disabled={loading}>Recalculate</Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium">Payroll preview</div>
        {calc.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No active employees.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-3 py-3">Hours</th>
                  <th className="px-3 py-3">Gross</th>
                  <th className="px-3 py-3">Taxes</th>
                  <th className="px-5 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {calc.map(({ row, pay }) => (
                  <tr key={row.emp.id} className="border-t">
                    <td className="px-5 py-3">
                      <div className="font-medium">{row.emp.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.emp.pay_type === "hourly" ? `${fmtUSD(row.emp.pay_rate)}/hr` : `${fmtUSD(row.emp.pay_rate)}/yr`}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.emp.pay_type === "salary" ? "—" : `${pay.regularHours}h${pay.overtimeHours > 0 ? ` + ${pay.overtimeHours} OT` : ""}`}
                    </td>
                    <td className="px-3 py-3">{fmtUSD(pay.gross)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{fmtUSD(pay.federalTax + pay.stateTax + pay.socialSecurity + pay.medicare)}</td>
                    <td className="px-5 py-3 text-right font-medium">{fmtUSD(pay.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3">{fmtUSD(totals.gross)}</td>
                  <td className="px-3 py-3">{fmtUSD(totals.tax)}</td>
                  <td className="px-5 py-3 text-right">{fmtUSD(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t p-4">
          <Button onClick={runPayroll} className="gap-2"><PlayCircle className="h-4 w-4" /> Approve & run payroll</Button>
        </div>
      </div>

      {recentRuns.length > 0 && (
        <div className="rounded-2xl border bg-card">
          <div className="border-b px-5 py-3 text-sm font-medium">Recent runs</div>
          <ul className="divide-y">
            {recentRuns.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <div className="flex-1">
                  <div className="font-medium">{r.period_start} → {r.period_end}</div>
                  <div className="text-xs text-muted-foreground capitalize">{r.status}</div>
                </div>
                <div className="font-medium">{fmtUSD(r.net_total)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
