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
  Clock, ClipboardCheck, Sparkles, AlertTriangle, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/hooks/useCompany";

export const Route = createFileRoute("/app/payroll")({
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
  { key: "period", label: "Select period", icon: CalendarDays },
  { key: "employees", label: "Review employees", icon: Users },
  { key: "hours", label: "Review hours", icon: Clock },
  { key: "approve", label: "Approve", icon: ClipboardCheck },
  { key: "confirm", label: "Confirm", icon: Sparkles },
] as const;

function PayrollWizard() {
  const today = new Date();
  const start = new Date(today); start.setDate(today.getDate() - 13);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
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

  function next() {
    if (step < STEPS.length - 1) { setDirection(1); setStep(step + 1); }
  }
  function back() {
    if (step > 0) { setDirection(-1); setStep(step - 1); }
  }

  const calculateFn = useServerFn(calculatePayrollRun);
  const approveFn = useServerFn(approvePayrollRun);

  async function approveAndRun() {
    if (calc.length === 0) { toast.error("No employees selected"); return; }
    if (!currentId) { toast.error("No active company selected"); return; }
    setSubmitting(true);
    try {
      // Server-side authoritative computation. Client-side `calc` is preview only.
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
      const serverNet = result.totals.net;
      toast.success(
        `Payroll approved — ${fmtUSD(serverNet)} net${
          !result.provider.productionReady ? " (calc engine: non-certified stub)" : ""
        }`
      );
      setDirection(1); setStep(4);
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve payroll");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">Run payroll</h1>
          <p className="mt-1 text-sm text-white">Five quick steps. We do the math, you press approve.</p>
        </div>
        {step < 4 && (
          <Button
            variant="outline"
            className="border-white/20/15 bg-card text-foreground hover:bg-muted"
            onClick={() => setShowCancel(true)}
          >
            Cancel payroll
          </Button>
        )}
      </div>

      {/* Stepper */}
      <div className="rounded-3xl surface-glass p-4 sm:p-5">
        <div className="flex items-center justify-between gap-1">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={cn(
                    "grid h-10 w-10 place-items-center rounded-2xl border-2 transition-all duration-300",
                    done && "border-foreground bg-primary text-primary-foreground",
                    active && "border-white/20 bg-primary text-primary-foreground shadow-glow scale-110",
                    !done && !active && "border-primary bg-card text-white",
                  )}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className={cn(
                    "hidden whitespace-nowrap text-[11px] font-bold uppercase tracking-wider sm:block",
                    active ? "text-foreground" : "text-white",
                  )}>{s.label}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mx-2 h-0.5 flex-1 rounded-full bg-primary/60 sm:mx-3">
                    <div
                      className="h-0.5 rounded-full bg-primary transition-all duration-500"
                      style={{ width: i < step ? "100%" : "0%" }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content + running totals sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div key={step} className={direction === 1 ? "slide-in-right" : "slide-in-left"}>
          {step === 0 && (
            <StepPeriod
              periodStart={periodStart} setPeriodStart={setPeriodStart}
              periodEnd={periodEnd} setPeriodEnd={setPeriodEnd}
              payDate={payDate} setPayDate={setPayDate}
              onContinue={async () => { await loadPreview(); next(); }}
              loading={loading}
            />
          )}
          {step === 1 && (
            <StepEmployees rows={rows} setRows={setRows} loading={loading} onBack={back} onContinue={next} />
          )}
          {step === 2 && (
            <StepHours rows={rows} setRows={setRows} onBack={back} onContinue={next} />
          )}
          {step === 3 && (
            <StepApprove
              calc={calc} totals={totals} periodStart={periodStart} periodEnd={periodEnd} payDate={payDate}
              submitting={submitting} onBack={back} onApprove={approveAndRun}
            />
          )}
          {step === 4 && (
            <StepConfirm netTotal={totals.net} runId={runId} payDate={payDate} count={calc.length} />
          )}
        </div>

        {/* Running totals sidebar */}
        {step < 4 && (
          <aside className="lg:sticky lg:top-24 h-fit rounded-3xl surface-glass p-5 border border-primary/25">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Running totals</div>
            <div className="mt-1 text-xs text-white/60">Updates as you move through steps</div>
            <div className="mt-5 space-y-4">
              <TotalsRow label="Employees" value={String(calc.length)} />
              <TotalsRow label="Gross" value={fmtUSD(totals.gross)} />
              <TotalsRow label="Est. taxes" value={fmtUSD(totals.tax)} muted />
              <TotalsRow label="Deductions" value={fmtUSD(totals.deductions)} muted />
              <div className="border-t border-primary/20 pt-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Net take-home</div>
                <div className="mt-1 font-display text-3xl font-extrabold tabular text-primary">{fmtUSD(totals.net)}</div>
              </div>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs text-white/70">
                Pay date <span className="font-bold text-white">{new Date(payDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Cancel modal */}
      {showCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-muted/40 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-float" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#FEF3C7] text-[#92400E]">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-lg font-bold text-foreground">Cancel this payroll run?</div>
                <p className="mt-1 text-sm text-white">Nothing is saved yet — your progress in this wizard will be cleared.</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" className="border-white/20/15 bg-card text-foreground hover:bg-muted" onClick={() => setShowCancel(false)}>
                Keep going
              </Button>
              <Button className="bg-primary text-primary-foreground hover:shadow-glow" onClick={() => { setShowCancel(false); setStep(0); }}>
                Yes, cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Steps ─────────── */

function StepPeriod({ periodStart, setPeriodStart, periodEnd, setPeriodEnd, payDate, setPayDate, onContinue, loading }: {
  periodStart: string; setPeriodStart: (v: string) => void;
  periodEnd: string; setPeriodEnd: (v: string) => void;
  payDate: string; setPayDate: (v: string) => void;
  onContinue: () => void; loading: boolean;
}) {
  return (
    <div className="rounded-3xl surface-glass p-6 sm:p-8">
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary bg-muted px-3 py-1 text-xs font-bold text-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> Step 1 of 5
        </div>
        <h2 className="mt-3 font-display text-2xl font-extrabold text-foreground">When are you paying your team?</h2>
        <p className="mt-1 text-sm text-white">Pick the work period and the day money lands in their account.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-foreground">Period start</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-foreground">Period end</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div>
            <Label className="text-foreground">Pay date</Label>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-7 flex justify-end">
          <Button className="gap-2 bg-primary text-primary-foreground font-bold hover:-translate-y-0.5 hover:shadow-glow" onClick={onContinue} disabled={loading}>
            {loading ? "Loading…" : "Continue"} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepEmployees({ rows, setRows, loading, onBack, onContinue}: {
  rows: Row[]; setRows: (r: Row[]) => void; loading: boolean; onBack: () => void; onContinue: () => void;
}) {
  function toggle(id: string) {
    setRows(rows.map((r) => r.emp.id === id ? { ...r, selected: !r.selected } : r));
  }
  const selectedCount = rows.filter((r) => r.selected).length;
  return (
    <div className="rounded-3xl surface-glass p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary bg-muted px-3 py-1 text-xs font-bold text-foreground">
            <Users className="h-3.5 w-3.5" /> Step 2 of 5
          </div>
          <h2 className="mt-3 font-display text-2xl font-extrabold text-foreground">Who's getting paid this run?</h2>
          <p className="mt-1 text-sm text-white">{selectedCount} of {rows.length} employees included.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-white/20/15 bg-card text-foreground hover:bg-muted" onClick={() => setRows(rows.map((r) => ({ ...r, selected: true })))}>Select all</Button>
          <Button variant="outline" className="border-white/20/15 bg-card text-foreground hover:bg-muted" onClick={() => setRows(rows.map((r) => ({ ...r, selected: false })))}>Clear</Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-primary bg-muted p-8 text-center">
          <div className="font-display text-lg font-bold text-foreground">No active employees</div>
          <p className="mt-1 text-sm text-white">Add employees first, then come back.</p>
          <Link to="/app/employees" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:shadow-glow">
            Add employee <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.emp.id}>
              <button
                onClick={() => toggle(r.emp.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted"
              >
                <div className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-all",
                  r.selected ? "border-foreground bg-primary text-primary-foreground" : "border-primary bg-card",
                )}>
                  {r.selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground">{r.emp.full_name}</div>
                  <div className="text-xs text-white">
                    {r.emp.pay_type === "hourly" ? `Hourly · ${fmtUSD(r.emp.pay_rate)}/hr` : `Salary · ${fmtUSD(r.emp.pay_rate)}/yr`}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <NavRow onBack={onBack} onContinue={onContinue} disabled={selectedCount === 0} />
    </div>
  );
}

function StepHours({ rows, setRows, onBack, onContinue}: { rows: Row[]; setRows: (r: Row[]) => void; onBack: () => void; onContinue: () => void }) {
  const active = rows.filter((r) => r.selected);
  function update(id: string, field: "regularHours" | "overtimeHours", v: number) {
    setRows(rows.map((r) => r.emp.id === id ? { ...r, [field]: isNaN(v) ? 0 : v } : r));
  }
  return (
    <div className="rounded-3xl surface-glass p-6 sm:p-8">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary bg-muted px-3 py-1 text-xs font-bold text-foreground">
        <Clock className="h-3.5 w-3.5" /> Step 3 of 5
      </div>
      <h2 className="mt-3 font-display text-2xl font-extrabold text-foreground">Review hours worked</h2>
      <p className="mt-1 text-sm text-white">Edit any hours that look off. Salary employees skip this.</p>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-primary/60 bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[11px] font-bold uppercase tracking-wider text-white">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Regular hrs</th>
              <th className="px-4 py-3 text-right">Overtime hrs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {active.map((r) => (
              <tr key={r.emp.id} className="text-foreground">
                <td className="px-4 py-3 font-semibold">{r.emp.full_name}</td>
                <td className="px-4 py-3 capitalize text-white">{r.emp.pay_type}</td>
                <td className="px-4 py-3 text-right">
                  {r.emp.pay_type === "salary" ? (
                    <span className="text-white">—</span>
                  ) : (
                    <Input type="number" min={0} step="0.25" value={r.regularHours}
                      onChange={(e) => update(r.emp.id, "regularHours", parseFloat(e.target.value))}
                      className="ml-auto h-9 w-24 text-right" />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.emp.pay_type === "salary" ? (
                    <span className="text-white">—</span>
                  ) : (
                    <Input type="number" min={0} step="0.25" value={r.overtimeHours}
                      onChange={(e) => update(r.emp.id, "overtimeHours", parseFloat(e.target.value))}
                      className="ml-auto h-9 w-24 text-right" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NavRow onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

function StepApprove({ calc, totals, periodStart, periodEnd, payDate, submitting, onBack, onApprove }: {
  calc: { row: Row; pay: ReturnType<typeof calcPay> }[];
  totals: { gross: number; tax: number; deductions: number; net: number };
  periodStart: string; periodEnd: string; payDate: string;
  submitting: boolean; onBack: () => void; onApprove: () => void;
}) {
  return (
    <div className="rounded-3xl surface-glass p-6 sm:p-8">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary bg-muted px-3 py-1 text-xs font-bold text-foreground">
        <ClipboardCheck className="h-3.5 w-3.5" /> Step 4 of 5
      </div>
      <h2 className="mt-3 font-display text-2xl font-extrabold text-foreground">Final approval</h2>
      <p className="mt-1 text-sm text-white">
        Pay date <span className="font-semibold text-foreground">{new Date(payDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span> ·
        Period {periodStart} → {periodEnd}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Tile label="Gross" value={fmtUSD(totals.gross)} />
        <Tile label="Taxes" value={fmtUSD(totals.tax)} />
        <Tile label="Deductions" value={fmtUSD(totals.deductions)} />
        <Tile label="Net take-home" value={fmtUSD(totals.net)} accent />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-primary/60 bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[11px] font-bold uppercase tracking-wider text-white">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Taxes</th>
              <th className="px-4 py-3 text-right">Deductions</th>
              <th className="px-4 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {calc.map(({ row, pay }) => (
              <tr key={row.emp.id}>
                <td className="px-4 py-3 font-semibold">{row.emp.full_name}</td>
                <td className="px-4 py-3 text-right tabular">{fmtUSD(pay.gross)}</td>
                <td className="px-4 py-3 text-right tabular text-white">{fmtUSD(pay.federalTax + pay.stateTax + pay.socialSecurity + pay.medicare)}</td>
                <td className="px-4 py-3 text-right tabular text-white">{fmtUSD(pay.preTaxDeductions + pay.postTaxDeductions)}</td>
                <td className="px-4 py-3 text-right font-bold tabular">{fmtUSD(pay.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-2xl border border-primary/70 bg-muted p-3 text-xs text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Once approved, this becomes a sealed payroll record. You can view it any time in Pay history.
      </div>

      <div className="mt-6 space-y-3">
        <Button
          className="w-full gap-2 bg-primary text-primary-foreground font-extrabold text-base h-14 rounded-2xl glow-pulse hover:-translate-y-0.5 disabled:opacity-60"
          onClick={onApprove}
          disabled={submitting || calc.length === 0}
        >
          <PlayCircle className="h-5 w-5" /> {submitting ? "Submitting…" : `Approve & run payroll · ${fmtUSD(totals.net)}`}
        </Button>
        <Button variant="outline" className="w-full gap-2 border-primary/30 bg-card text-white hover:bg-primary/5" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    </div>
  );
}

function StepConfirm({ netTotal, runId, payDate, count }: { netTotal: number; runId: string | null; payDate: string; count: number }) {
  return (
    <div className="relative overflow-hidden rounded-3xl surface-hero p-8 text-center sm:p-12">
      <Confetti />
      <div className="relative z-10">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-card text-primary-foreground shadow-glow checkmark-pop">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 className="mt-5 font-display text-3xl font-extrabold text-foreground sm:text-4xl">Payroll approved!</h2>
        <p className="mt-2 text-sm text-white sm:text-base">
          {count} {count === 1 ? "employee" : "employees"} · {fmtUSD(netTotal)} net · paying out{" "}
          <span className="font-semibold text-foreground">{new Date(payDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
        </p>
        {runId && <p className="mt-2 font-mono text-xs text-white">Run ID: {runId.slice(0, 8)}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/app/paystubs">
            <Button className="gap-2 bg-primary text-primary-foreground font-bold hover:-translate-y-0.5 hover:shadow-glow">
              View pay history <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/app/dashboard">
            <Button variant="outline" className="gap-2 border-white/20/15 bg-card text-foreground hover:bg-muted">
              Back to dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function TotalsRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs font-semibold text-white/60">{label}</span>
      <span className={`tabular font-bold ${muted ? "text-white/75" : "text-white"}`}>{value}</span>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl p-4 transition-all hover:-translate-y-0.5",
      accent ? "bg-primary text-primary-foreground shadow-glow" : "bg-card border border-primary/60 text-foreground shadow-soft",
    )}>
      <div className={cn("text-[10px] font-bold uppercase tracking-wider", accent ? "text-foreground/70" : "text-white")}>{label}</div>
      <div className="mt-2 font-display text-2xl font-extrabold tabular">{value}</div>
    </div>
  );
}

function NavRow({ onBack, onContinue, disabled }: { onBack: () => void; onContinue: () => void; disabled?: boolean }) {
  return (
    <div className="mt-7 flex items-center justify-between">
      <Button variant="outline" className="gap-2 border-white/20/15 bg-card text-foreground hover:bg-muted" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" /> Back
      </Button>
      <Button className="gap-2 bg-primary text-primary-foreground font-bold hover:-translate-y-0.5 hover:shadow-glow" onClick={onContinue} disabled={disabled}>
        Continue<ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Confetti() {
  // Lightweight CSS confetti — no deps
  const pieces = Array.from({ length: 28 });
  const colors = ["primary", "blue-400", "slate-300", "foreground"];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 10) * 0.12;
        const dur = 2.4 + ((i * 13) % 18) / 10;
        const color = colors[i % colors.length];
        const size = 6 + (i % 4) * 2;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size * 0.4}px`,
              background: color,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}
    </div>
  );
}
