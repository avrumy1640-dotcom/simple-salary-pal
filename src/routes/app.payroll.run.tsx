import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { calcPay, fmtUSD } from "@/lib/payroll";
import { calculatePayrollRun, approvePayrollRun } from "@/lib/payroll-workflow.functions";
import {
  CheckCircle2, ChevronLeft, ChevronRight, PlayCircle, CalendarDays, Users,
  Clock, ClipboardCheck, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/hooks/useCompany";

export const Route = createFileRoute("/app/payroll/run")({
  head: () => ({ meta: [{ title: "Run payroll — Paylo" }] }),
  component: PayrollWizard,
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
interface Row {
  emp: Emp;
  selected: boolean;
  regularHours: number;
  overtimeHours: number;
  deductions: Ded[];
}

const STEPS = [
  { key: "period", label: "Pick dates", icon: CalendarDays },
  { key: "employees", label: "Pick people", icon: Users },
  { key: "hours", label: "Check hours", icon: Clock },
  { key: "approve", label: "Approve", icon: ClipboardCheck },
  { key: "confirm", label: "Done", icon: CheckCircle2 },
] as const;

function PayrollWizard() {
  const today = new Date();
  const start = new Date(today); start.setDate(today.getDate() - 13);

  const [step, setStep] = useState(0);
  const [periodStart, setPeriodStart] = useState(start.toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(today.toISOString().slice(0, 10));
  const [payDate, setPayDate] = useState(new Date(today.getTime() + 86400000 * 5).toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const { currentId } = useCompany();

  async function loadPreview() {
    if (!currentId) { toast.error("Select a company first"); return; }
    setLoading(true);
    const [{ data: emps }, { data: te }, { data: deds }] = await Promise.all([
      supabase.from("employees")
        .select("id, full_name, pay_type, pay_rate, filing_status, dependents, extra_withholding, state")
        .eq("company_id", currentId).eq("status", "active"),
      supabase.from("time_entries")
        .select("employee_id, hours, overtime_hours")
        .eq("company_id", currentId)
        .gte("work_date", periodStart).lte("work_date", periodEnd),
      supabase.from("deductions").select("*")
        .eq("company_id", currentId).eq("active", true),
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
        selected: true,
        regularHours: e.pay_type === "salary" ? 0 : h.reg,
        overtimeHours: e.pay_type === "salary" ? 0 : h.ot,
        deductions: dedsByEmp.get(e.id) ?? [],
      };
    });
    setRows(next);
    setLoading(false);
  }

  useEffect(() => { loadPreview(); /* eslint-disable-next-line */ }, []);

  const activeRows = useMemo(() => rows.filter((r) => r.selected), [rows]);

  const calc = useMemo(() => activeRows.map((r) => ({
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
  })), [activeRows]);

  const totals = useMemo(() => calc.reduce((acc, c) => ({
    gross: acc.gross + c.pay.gross,
    tax: acc.tax + c.pay.federalTax + c.pay.stateTax + c.pay.socialSecurity + c.pay.medicare,
    deductions: acc.deductions + c.pay.preTaxDeductions + c.pay.postTaxDeductions,
    net: acc.net + c.pay.net,
  }), { gross: 0, tax: 0, deductions: 0, net: 0 }), [calc]);

  function next() { if (step < STEPS.length - 1) setStep(step + 1); }
  function back() { if (step > 0) setStep(step - 1); }

  const calculateFn = useServerFn(calculatePayrollRun);
  const approveFn = useServerFn(approvePayrollRun);

  async function approveAndRun() {
    if (calc.length === 0) { toast.error("No employees selected"); return; }
    if (!currentId) { toast.error("No active company selected"); return; }
    setSubmitting(true);
    try {
      const result = await calculateFn({
        data: {
          company_id: currentId,
          period_start: periodStart,
          period_end: periodEnd,
          pay_date: payDate,
          pay_periods_per_year: 26,
          rows: activeRows.map((r) => ({
            employee_id: r.emp.id,
            regular_hours: Number(r.regularHours) || 0,
            overtime_hours: Number(r.overtimeHours) || 0,
            double_overtime_hours: 0,
            holiday_hours: 0,
            pto_hours: 0,
            sick_hours: 0,
            bonuses: 0,
            commissions: 0,
            reimbursements: 0,
          })),
        },
      });
      await approveFn({ data: { run_id: result.run.id } });
      setRunId(result.run.id);
      toast.success(`Payroll approved — ${fmtUSD(result.totals.net)} total`);
      setStep(4);
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve payroll");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Run payroll</h1>
          <p className="mt-2 text-base text-slate-600">Five simple steps. We do the math, you press approve.</p>
        </div>
        {step < 4 && (
          <Button variant="outline" onClick={() => setShowCancel(true)}>Cancel</Button>
        )}
      </div>

      {/* Stepper */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-1">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-2">
                  <div className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border-2 transition-all",
                    active && "border-slate-900 bg-primary text-slate-900",
                    done && "border-primary bg-primary text-slate-900",
                    !done && !active && "border-border bg-card text-slate-400",
                  )}>
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className={cn(
                    "hidden whitespace-nowrap text-xs font-semibold sm:block",
                    active ? "text-slate-900" : "text-slate-500",
                  )}>{s.label}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mx-2 h-0.5 flex-1 rounded-full bg-border sm:mx-3">
                    <div className="h-0.5 rounded-full bg-primary transition-all duration-500" style={{ width: i < step ? "100%" : "0%" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content + sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {step === 0 && (
            <StepPeriod
              periodStart={periodStart} setPeriodStart={setPeriodStart}
              periodEnd={periodEnd} setPeriodEnd={setPeriodEnd}
              payDate={payDate} setPayDate={setPayDate}
              onContinue={async () => { await loadPreview(); next(); }}
              loading={loading}
            />
          )}
          {step === 1 && <StepEmployees rows={rows} setRows={setRows} loading={loading} onBack={back} onContinue={next} />}
          {step === 2 && <StepHours rows={rows} setRows={setRows} onBack={back} onContinue={next} />}
          {step === 3 && (
            <StepApprove
              calc={calc} totals={totals} periodStart={periodStart} periodEnd={periodEnd} payDate={payDate}
              submitting={submitting} onBack={back} onApprove={approveAndRun}
            />
          )}
          {step === 4 && <StepConfirm netTotal={totals.net} runId={runId} payDate={payDate} count={calc.length} />}
        </div>

        {step < 4 && (
          <aside className="lg:sticky lg:top-24 h-fit rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-semibold text-slate-600">Running totals</div>
            <div className="mt-5 space-y-3">
              <SideRow label="People" value={String(calc.length)} />
              <SideRow label="Gross pay" value={fmtUSD(totals.gross)} />
              <SideRow label="Taxes" value={fmtUSD(totals.tax)} />
              <SideRow label="Deductions" value={fmtUSD(totals.deductions)} />
            </div>
            <div className="mt-5 border-t border-border pt-5">
              <div className="text-sm font-semibold text-slate-600">Total take-home</div>
              <div className="mt-2 font-display text-3xl font-extrabold tabular text-slate-900">{fmtUSD(totals.net)}</div>
              <div className="mt-3 text-sm text-slate-500">
                Pay date <span className="font-semibold text-slate-900">{new Date(payDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Cancel modal */}
      {showCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-xl font-bold text-slate-900">Cancel this payroll?</div>
            <p className="mt-2 text-base text-slate-600">Nothing has been saved. Your progress will be cleared.</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCancel(false)}>Keep going</Button>
              <Button onClick={() => { setShowCancel(false); setStep(0); }}>Yes, cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Steps ─────────── */

function StepCard({ stepNum, title, subtitle, children }: { stepNum: number; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="text-sm font-semibold text-slate-500">Step {stepNum} of 5</div>
      <h2 className="mt-1 font-display text-2xl font-extrabold text-slate-900">{title}</h2>
      <p className="mt-1 text-base text-slate-600">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function StepPeriod({ periodStart, setPeriodStart, periodEnd, setPeriodEnd, payDate, setPayDate, onContinue, loading }: {
  periodStart: string; setPeriodStart: (v: string) => void;
  periodEnd: string; setPeriodEnd: (v: string) => void;
  payDate: string; setPayDate: (v: string) => void;
  onContinue: () => void; loading: boolean;
}) {
  return (
    <StepCard stepNum={1} title="When are you paying your team?" subtitle="Pick the work period and the day money lands in their account.">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Work period starts</Label>
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div>
          <Label>Work period ends</Label>
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <div>
          <Label>Money lands on</Label>
          <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </div>
      </div>
      <div className="mt-8 flex justify-end">
        <Button size="lg" onClick={onContinue} disabled={loading}>
          {loading ? "Loading…" : "Continue"} <ChevronRight className="ml-1 h-5 w-5" />
        </Button>
      </div>
    </StepCard>
  );
}

function StepEmployees({ rows, setRows, loading, onBack, onContinue }: {
  rows: Row[]; setRows: (r: Row[]) => void; loading: boolean; onBack: () => void; onContinue: () => void;
}) {
  function toggle(id: string) {
    setRows(rows.map((r) => r.emp.id === id ? { ...r, selected: !r.selected } : r));
  }
  const selectedCount = rows.filter((r) => r.selected).length;
  return (
    <StepCard stepNum={2} title="Who's getting paid?" subtitle={`${selectedCount} of ${rows.length} people included.`}>
      <div className="mb-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setRows(rows.map((r) => ({ ...r, selected: true })))}>Select everyone</Button>
        <Button variant="outline" size="sm" onClick={() => setRows(rows.map((r) => ({ ...r, selected: false })))}>Clear</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <div className="font-display text-lg font-bold text-slate-900">No active people yet</div>
          <p className="mt-1 text-base text-slate-600">Add team members first, then come back.</p>
          <Button asChild className="mt-4"><Link to="/app/employees">Add a person</Link></Button>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.emp.id}>
              <button onClick={() => toggle(r.emp.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface">
                <div className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-all",
                  r.selected ? "border-slate-900 bg-primary text-slate-900" : "border-border bg-card",
                )}>
                  {r.selected && <CheckCircle2 className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-slate-900">{r.emp.full_name}</div>
                  <div className="text-sm text-slate-500">
                    {r.emp.pay_type === "hourly" ? `Hourly · ${fmtUSD(r.emp.pay_rate)}/hr` : `Salary · ${fmtUSD(r.emp.pay_rate)}/yr`}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <NavRow onBack={onBack} onContinue={onContinue} disabled={selectedCount === 0} />
    </StepCard>
  );
}

function StepHours({ rows, setRows, onBack, onContinue }: { rows: Row[]; setRows: (r: Row[]) => void; onBack: () => void; onContinue: () => void }) {
  const active = rows.filter((r) => r.selected);
  function update(id: string, field: "regularHours" | "overtimeHours", v: number) {
    setRows(rows.map((r) => r.emp.id === id ? { ...r, [field]: isNaN(v) ? 0 : v } : r));
  }
  return (
    <StepCard stepNum={3} title="Check the hours" subtitle="Edit anything that looks off. Salary people skip this.">
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-5 py-3">Person</th>
              <th className="px-5 py-3">Pay type</th>
              <th className="px-5 py-3 text-right">Regular hrs</th>
              <th className="px-5 py-3 text-right">Overtime hrs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {active.map((r) => (
              <tr key={r.emp.id}>
                <td className="px-5 py-3 text-base font-semibold text-slate-900">{r.emp.full_name}</td>
                <td className="px-5 py-3 capitalize text-slate-500">{r.emp.pay_type}</td>
                <td className="px-5 py-3 text-right">
                  {r.emp.pay_type === "salary" ? <span className="text-slate-400">—</span> : (
                    <Input type="number" min={0} step="0.25" value={r.regularHours}
                      onChange={(e) => update(r.emp.id, "regularHours", parseFloat(e.target.value))}
                      className="ml-auto h-10 w-24 text-right" />
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {r.emp.pay_type === "salary" ? <span className="text-slate-400">—</span> : (
                    <Input type="number" min={0} step="0.25" value={r.overtimeHours}
                      onChange={(e) => update(r.emp.id, "overtimeHours", parseFloat(e.target.value))}
                      className="ml-auto h-10 w-24 text-right" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NavRow onBack={onBack} onContinue={onContinue} />
    </StepCard>
  );
}

function StepApprove({ calc, totals, periodStart, periodEnd, payDate, submitting, onBack, onApprove }: {
  calc: { row: Row; pay: ReturnType<typeof calcPay> }[];
  totals: { gross: number; tax: number; deductions: number; net: number };
  periodStart: string; periodEnd: string; payDate: string;
  submitting: boolean; onBack: () => void; onApprove: () => void;
}) {
  return (
    <StepCard
      stepNum={4}
      title="Final check"
      subtitle={`Paying ${new Date(payDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · period ${periodStart} → ${periodEnd}`}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <SumTile label="Gross pay" value={fmtUSD(totals.gross)} />
        <SumTile label="Taxes" value={fmtUSD(totals.tax)} />
        <SumTile label="Deductions" value={fmtUSD(totals.deductions)} />
        <SumTile label="Total take-home" value={fmtUSD(totals.net)} accent />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-5 py-3">Person</th>
              <th className="px-5 py-3 text-right">Gross</th>
              <th className="px-5 py-3 text-right">Taxes</th>
              <th className="px-5 py-3 text-right">Deductions</th>
              <th className="px-5 py-3 text-right">Take-home</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {calc.map(({ row, pay }) => (
              <tr key={row.emp.id}>
                <td className="px-5 py-3 font-semibold text-slate-900">{row.emp.full_name}</td>
                <td className="px-5 py-3 text-right tabular text-slate-700">{fmtUSD(pay.gross)}</td>
                <td className="px-5 py-3 text-right tabular text-slate-500">{fmtUSD(pay.federalTax + pay.stateTax + pay.socialSecurity + pay.medicare)}</td>
                <td className="px-5 py-3 text-right tabular text-slate-500">{fmtUSD(pay.preTaxDeductions + pay.postTaxDeductions)}</td>
                <td className="px-5 py-3 text-right font-bold tabular text-slate-900">{fmtUSD(pay.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <span>Once you approve, this becomes a sealed record. View it any time in pay history.</span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr]">
        <Button variant="outline" size="lg" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="mr-1 h-5 w-5" /> Back
        </Button>
        <Button size="lg" onClick={onApprove} disabled={submitting || calc.length === 0}>
          <PlayCircle className="mr-2 h-5 w-5" />
          {submitting ? "Submitting…" : `Approve and run — ${fmtUSD(totals.net)}`}
        </Button>
      </div>
    </StepCard>
  );
}

function StepConfirm({ netTotal, runId, payDate, count }: { netTotal: number; runId: string | null; payDate: string; count: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center sm:p-14">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary text-slate-900">
        <CheckCircle2 className="h-10 w-10" />
      </div>
      <h2 className="mt-6 font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">All done!</h2>
      <p className="mx-auto mt-3 max-w-lg text-base text-slate-600">
        {count} {count === 1 ? "person" : "people"} will be paid {fmtUSD(netTotal)} on{" "}
        <span className="font-semibold text-slate-900">
          {new Date(payDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>.
      </p>
      {runId && <p className="mt-2 font-mono text-xs text-slate-400">Reference: {runId.slice(0, 8)}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg"><Link to="/app/paystubs">See pay history</Link></Button>
        <Button asChild variant="outline" size="lg"><Link to="/app/dashboard">Back to dashboard</Link></Button>
      </div>
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-base font-semibold tabular text-slate-900">{value}</span>
    </div>
  );
}

function SumTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-slate-900 bg-primary" : "border-border bg-card")}>
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-2 font-display text-xl font-extrabold tabular text-slate-900">{value}</div>
    </div>
  );
}

function NavRow({ onBack, onContinue, disabled }: { onBack: () => void; onContinue: () => void; disabled?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between">
      <Button variant="outline" size="lg" onClick={onBack}>
        <ChevronLeft className="mr-1 h-5 w-5" /> Back
      </Button>
      <Button size="lg" onClick={onContinue} disabled={disabled}>
        Continue <ChevronRight className="ml-1 h-5 w-5" />
      </Button>
    </div>
  );
}
