import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { calcPay, fmtUSD } from "@/lib/payroll";
import { CheckCircle2, PlayCircle, Info, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/app/payroll")({
  head: () => ({ meta: [{ title: "Run payroll — Paylo" }] }),
  component: PayrollPage,
});

interface Emp {
  id: string;
  full_name: string;
  pay_type: "hourly" | "salary";
  pay_rate: number;
  filing_status?: string | null;
  dependents?: number | null;
  extra_withholding?: number | null;
}
interface Ded { id: string; employee_id: string; name: string; pre_tax: boolean; amount: number; amount_type: string; active: boolean }
interface Row { emp: Emp; regularHours: number; overtimeHours: number; deductions: Ded[] }

function PayrollPage() {
  const today = new Date();
  const start = new Date(today); start.setDate(today.getDate() - 13);
  const [periodStart, setPeriodStart] = useState(start.toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(today.toISOString().slice(0, 10));
  const [payDate, setPayDate] = useState(new Date(today.getTime() + 86400000 * 5).toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recentRuns, setRecentRuns] = useState<{ id: string; period_start: string; period_end: string; net_total: number; status: string }[]>([]);

  async function loadRuns() {
    const { data } = await supabase.from("payroll_runs").select("id, period_start, period_end, net_total, status").order("created_at", { ascending: false }).limit(5);
    setRecentRuns((data ?? []) as typeof recentRuns);
  }

  async function loadPreview() {
    setLoading(true);
    const [{ data: emps }, { data: te }, { data: deds }] = await Promise.all([
      supabase.from("employees").select("id, full_name, pay_type, pay_rate, filing_status, dependents, extra_withholding").eq("status", "active"),
      supabase.from("time_entries").select("employee_id, hours, overtime_hours").gte("work_date", periodStart).lte("work_date", periodEnd),
      supabase.from("deductions").select("*").eq("active", true),
    ]);
    const hoursByEmp = new Map<string, { reg: number; ot: number }>();
    (te ?? []).forEach((r) => {
      const cur = hoursByEmp.get(r.employee_id) ?? { reg: 0, ot: 0 };
      cur.reg += Number(r.hours);
      cur.ot += Number(r.overtime_hours);
      hoursByEmp.set(r.employee_id, cur);
    });
    const dedsByEmp = new Map<string, Ded[]>();
    (deds ?? []).forEach((d) => {
      const arr = dedsByEmp.get(d.employee_id) ?? [];
      arr.push(d as Ded);
      dedsByEmp.set(d.employee_id, arr);
    });
    const next: Row[] = (emps ?? []).map((e) => {
      const h = hoursByEmp.get(e.id) ?? { reg: 0, ot: 0 };
      return {
        emp: { ...e, pay_rate: Number(e.pay_rate) } as Emp,
        regularHours: e.pay_type === "salary" ? 0 : h.reg,
        overtimeHours: e.pay_type === "salary" ? 0 : h.ot,
        deductions: dedsByEmp.get(e.id) ?? [],
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
      filingStatus: r.emp.filing_status ?? "single",
      dependents: Number(r.emp.dependents ?? 0),
      extraWithholding: Number(r.emp.extra_withholding ?? 0),
      deductions: r.deductions.map((d) => ({ name: d.name, pre_tax: d.pre_tax, amount: Number(d.amount), amount_type: d.amount_type })),
    }),
  })), [rows]);

  const totals = useMemo(() => calc.reduce((acc, c) => ({
    gross: acc.gross + c.pay.gross,
    tax: acc.tax + c.pay.federalTax + c.pay.stateTax + c.pay.socialSecurity + c.pay.medicare,
    deductions: acc.deductions + c.pay.preTaxDeductions + c.pay.postTaxDeductions,
    net: acc.net + c.pay.net,
  }), { gross: 0, tax: 0, deductions: 0, net: 0 }), [calc]);

  function toggle(id: string) {
    setExpanded((s) => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns; });
  }

  async function runPayroll() {
    if (calc.length === 0) { toast.error("No active employees"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: run, error: e1 } = await supabase.from("payroll_runs").insert({
      owner_id: user.id, period_start: periodStart, period_end: periodEnd, pay_date: payDate,
      gross_total: totals.gross, tax_total: totals.tax, net_total: totals.net, status: "approved",
    }).select().single();
    if (e1 || !run) { toast.error(e1?.message || "Failed"); return; }
    const items = calc.map((c) => ({
      owner_id: user.id, run_id: run.id, employee_id: c.row.emp.id, employee_name: c.row.emp.full_name,
      regular_hours: c.pay.regularHours, overtime_hours: c.pay.overtimeHours,
      gross_pay: c.pay.gross, federal_tax: c.pay.federalTax, social_security: c.pay.socialSecurity,
      medicare: c.pay.medicare, state_tax: c.pay.stateTax, net_pay: c.pay.net,
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
        <p className="text-sm text-muted-foreground">Pick your pay period, review the math, and approve. We'll do the rest.</p>
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
            <Button variant="outline" className="w-full rounded-full" onClick={loadPreview} disabled={loading}>Recalculate</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Tile label="Gross" value={fmtUSD(totals.gross)} />
        <Tile label="Taxes" value={fmtUSD(totals.tax)} />
        <Tile label="Deductions" value={fmtUSD(totals.deductions)} />
        <Tile label="Net (take-home)" value={fmtUSD(totals.net)} accent />
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b px-5 py-3 text-sm font-medium">Per-employee breakdown — tap a row to see the math</div>
        {calc.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No active employees. Add some on the Employees page.</div>
        ) : (
          <ul className="divide-y">
            {calc.map(({ row, pay }) => {
              const open = expanded.has(row.emp.id);
              return (
                <li key={row.emp.id}>
                  <button onClick={() => toggle(row.emp.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-accent/30 transition">
                    {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{row.emp.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.emp.pay_type === "hourly" ? `${pay.regularHours}h${pay.overtimeHours > 0 ? ` + ${pay.overtimeHours} OT` : ""} @ ${fmtUSD(row.emp.pay_rate)}/hr` : `Salary ${fmtUSD(row.emp.pay_rate)}/yr`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Gross {fmtUSD(pay.gross)}</div>
                      <div className="font-semibold">{fmtUSD(pay.net)} <span className="text-xs font-normal text-muted-foreground">net</span></div>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t bg-accent/20 px-5 py-4 space-y-1.5 text-sm">
                      <Line label="Gross pay" value={fmtUSD(pay.gross)} />
                      {pay.deductionLines.filter((d) => d.pre_tax).map((d, i) => (
                        <Line key={`pre-${i}`} label={`− ${d.name} (pre-tax)`} value={`−${fmtUSD(d.amount)}`} muted />
                      ))}
                      {pay.preTaxDeductions > 0 && <Line label="Taxable income" value={fmtUSD(pay.taxableIncome)} bold />}
                      <Line label="− Federal income tax" value={`−${fmtUSD(pay.federalTax)}`} muted />
                      <Line label="− Social Security (6.2%)" value={`−${fmtUSD(pay.socialSecurity)}`} muted />
                      <Line label="− Medicare (1.45%)" value={`−${fmtUSD(pay.medicare)}`} muted />
                      <Line label="− State tax" value={`−${fmtUSD(pay.stateTax)}`} muted />
                      {pay.deductionLines.filter((d) => !d.pre_tax).map((d, i) => (
                        <Line key={`post-${i}`} label={`− ${d.name} (post-tax)`} value={`−${fmtUSD(d.amount)}`} muted />
                      ))}
                      <div className="border-t pt-2 mt-2"><Line label="Net pay" value={fmtUSD(pay.net)} bold /></div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-between items-center gap-2 border-t p-4 bg-card">
          <div className="flex gap-2 items-start text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 mt-0.5" /> Once approved, this becomes a sealed record on the Reports page.</div>
          <Button onClick={runPayroll} className="gap-2 rounded-full bg-foreground text-white hover:opacity-90 px-6"><PlayCircle className="h-4 w-4" /> Approve & run payroll</Button>
        </div>
      </div>

      {recentRuns.length > 0 && (
        <div className="rounded-2xl border bg-card">
          <div className="border-b px-5 py-3 text-sm font-medium">Recent runs</div>
          <ul className="divide-y">
            {recentRuns.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[oklch(0.65_0.16_155)]" />
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

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "bg-gradient-to-br from-[oklch(0.62_0.22_260)] to-[oklch(0.55_0.22_260)] text-white border-transparent" : "bg-card"}`}>
      <div className={`text-xs font-medium uppercase tracking-wider ${accent ? "text-white/80" : "text-muted-foreground"}`}>{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Line({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""} ${bold ? "font-semibold text-foreground" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
