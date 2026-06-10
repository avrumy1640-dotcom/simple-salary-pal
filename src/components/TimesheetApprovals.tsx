// Roll-up + approval panel for time-clock punches → timesheets.
// Manager picks an employee + period, rolls up punches into a timesheet via
// the FLSA/state OT engine, then submits or approves. Approval locks the
// underlying time_entries via DB trigger.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, RefreshCw, Send, ShieldCheck, Lock } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import {
  rollupTimesheet, submitTimesheet, approveTimesheet, rejectTimesheet,
} from "@/lib/timesheet.functions";

interface Emp { id: string; full_name: string }
interface Ts {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_double_ot_hours: number;
  submitted_at: string | null;
  approved_at: string | null;
  employees?: { full_name: string };
}

function isoToday() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function TimesheetApprovals() {
  const { currentId } = useCompany();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [sheets, setSheets] = useState<Ts[]>([]);
  const [empId, setEmpId] = useState("");
  const [periodStart, setPeriodStart] = useState(isoDaysAgo(13));
  const [periodEnd, setPeriodEnd] = useState(isoToday());
  const [busy, setBusy] = useState(false);

  const rollupFn = useServerFn(rollupTimesheet);
  const submitFn = useServerFn(submitTimesheet);
  const approveFn = useServerFn(approveTimesheet);
  const rejectFn = useServerFn(rejectTimesheet);

  async function load() {
    if (!currentId) return;
    const [{ data: e }, { data: t }] = await Promise.all([
      supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
      supabase.from("timesheets").select("*, employees(full_name)").order("period_end", { ascending: false }).limit(50),
    ]);
    setEmps((e ?? []) as Emp[]);
    setSheets((t ?? []) as unknown as Ts[]);
    if (e && e.length > 0 && !empId) setEmpId(e[0].id);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentId]);

  async function runRollup() {
    if (!currentId || !empId) return;
    setBusy(true);
    try {
      const res = await rollupFn({ data: {
        company_id: currentId, employee_id: empId,
        period_start: periodStart, period_end: periodEnd,
      } });
      toast.success(`Rolled up: ${res.totals.regular}h reg · ${res.totals.overtime}h OT · ${res.totals.doubleOvertime}h 2x`);
      load();
    } catch (e: any) { toast.error(e.message || "Roll-up failed"); }
    finally { setBusy(false); }
  }

  async function act(ts: Ts, action: "submit" | "approve" | "reject") {
    setBusy(true);
    try {
      if (action === "submit") await submitFn({ data: { timesheet_id: ts.id } });
      else if (action === "approve") await approveFn({ data: { timesheet_id: ts.id } });
      else await rejectFn({ data: { timesheet_id: ts.id, reason: prompt("Reason?") || "Rejected by manager" } });
      toast.success(`Timesheet ${action}d`);
      load();
    } catch (e: any) { toast.error(e.message || "Action failed"); }
    finally { setBusy(false); }
  }

  const pending = useMemo(() => sheets.filter((s) => s.status === "submitted"), [sheets]);
  const recent = useMemo(() => sheets.filter((s) => s.status !== "submitted").slice(0, 20), [sheets]);

  return (
    <div className="space-y-4">
      <div className="surface-glass rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Roll up punches → timesheet</h2>
          <p className="text-sm text-muted-foreground">
            Pairs in/out punches, subtracts breaks, applies federal weekly OT (and daily OT/2x when configured).
            Re-running before approval recomputes; after approval the timesheet is locked.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Employee</Label>
            <select
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <Label>Period start</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label>Period end</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={runRollup} disabled={busy || !empId} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Roll up from punches
          </Button>
        </div>
      </div>

      <div className="surface-glass rounded-xl p-5">
        <h2 className="font-semibold mb-3">Pending approval</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No timesheets awaiting approval.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((t) => (
              <TsRow key={t.id} ts={t} busy={busy} onAct={act} />
            ))}
          </div>
        )}
      </div>

      <div className="surface-glass rounded-xl p-5">
        <h2 className="font-semibold mb-3">Recent timesheets</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {recent.map((t) => (
              <TsRow key={t.id} ts={t} busy={busy} onAct={act} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TsRow({ ts, busy, onAct }: { ts: Ts; busy: boolean; onAct: (t: Ts, a: "submit" | "approve" | "reject") => void }) {
  const locked = ts.status === "approved" || ts.status === "locked";
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium flex items-center gap-2">
          {ts.employees?.full_name ?? "Employee"}
          <Badge variant={locked ? "default" : "outline"} className="capitalize text-xs gap-1">
            {locked && <Lock className="h-3 w-3" />}{ts.status}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {ts.period_start} → {ts.period_end} · {Number(ts.total_regular_hours).toFixed(1)}h reg
          {Number(ts.total_overtime_hours) > 0 && ` · ${Number(ts.total_overtime_hours).toFixed(1)}h OT`}
          {Number(ts.total_double_ot_hours) > 0 && ` · ${Number(ts.total_double_ot_hours).toFixed(1)}h 2x`}
        </div>
      </div>
      <div className="flex gap-2">
        {ts.status === "open" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(ts, "submit")} className="gap-1">
            <Send className="h-3.5 w-3.5" /> Submit
          </Button>
        )}
        {ts.status === "submitted" && (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(ts, "reject")} className="gap-1">
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onAct(ts, "approve")} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Approve & lock
            </Button>
          </>
        )}
        {ts.status === "rejected" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(ts, "submit")} className="gap-1">
            <Send className="h-3.5 w-3.5" /> Resubmit
          </Button>
        )}
      </div>
    </div>
  );
}
