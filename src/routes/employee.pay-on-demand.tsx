import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Wallet, Clock as ClockIcon, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/pay-on-demand")({
  head: () => ({ meta: [{ title: "Pay On-Demand — Paylo" }] }),
  component: EmployeePayOnDemandPage,
});

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

interface Req {
  id: string;
  requested_amount: number;
  service_fee: number;
  total_payout: number;
  status: string;
  decline_reason: string | null;
  requested_at: string;
  decided_at: string | null;
}

function EmployeePayOnDemandPage() {
  const { employee, loading } = useMyEmployee();
  const navigate = useNavigate();
  const [available, setAvailable] = useState(0);
  const [lastPayDate, setLastPayDate] = useState<string | null>(null);
  const [requests, setRequests] = useState<Req[]>([]);
  const [reqOpen, setReqOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fee = 0;

  async function load() {
    if (!employee) return;
    const [{ data: lastRun }, { data: reqs }] = await Promise.all([
      supabase.from("payroll_runs")
        .select("pay_date, period_end")
        .eq("company_id", employee.company_id)
        .eq("status", "paid")
        .order("pay_date", { ascending: false })
        .limit(1),
      supabase.from("pay_on_demand_requests")
        .select("*")
        .eq("employee_id", employee.id)
        .order("requested_at", { ascending: false })
        .limit(20),
    ]);

    const sinceDate = lastRun?.[0]?.period_end ?? new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    setLastPayDate(lastRun?.[0]?.pay_date ?? null);

    const { data: te } = await supabase
      .from("time_entries")
      .select("hours, overtime_hours")
      .eq("employee_id", employee.id)
      .gt("work_date", sinceDate);

    const totalHours = (te ?? []).reduce(
      (acc: number, r: any) => acc + Number(r.hours || 0) + Number(r.overtime_hours || 0) * 1.5,
      0,
    );
    const rate = Number(employee.pay_rate || 0);
    const earned = employee.pay_type === "salary" ? rate / 26 : rate * totalHours;
    // 50% cap, minus pending requests
    const pending = (reqs ?? [])
      .filter((r: any) => r.status === "pending" || r.status === "approved")
      .reduce((a: number, r: any) => a + Number(r.requested_amount || 0), 0);
    setAvailable(Math.max(0, Math.round(earned * 0.5 * 100) / 100 - pending));
    setRequests((reqs ?? []) as any);
  }
  useEffect(() => { load(); }, [employee?.id]);

  const amt = Number(amount || 0);
  const total = Math.max(0, amt - fee);
  const canSubmit = amt > 0 && amt <= available;

  async function submit() {
    if (!employee) return;
    setBusy(true);
    const { error } = await supabase.from("pay_on_demand_requests").insert({
      company_id: employee.company_id,
      employee_id: employee.id,
      requested_amount: amt,
      service_fee: fee,
      total_payout: total,
      payout_method: employee.bank_account_last4 ? `Bank ****${employee.bank_account_last4}` : "Direct deposit",
      available_at_request: available,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request submitted");
    setConfirmOpen(false);
    setReqOpen(false);
    setAmount("");
    load();
  }

  if (loading) return <div className="text-base text-slate-500">Loading…</div>;
  if (!employee) return null;

  return (
    <div className="space-y-6 unit-in">
      <button onClick={() => navigate({ to: "/employee/home" })} className="text-sm text-primary hover:underline">
        ← Back
      </button>

      <div className="rounded-3xl border border-border p-6 sm:p-10 shadow-soft text-center"
           style={{ background: "var(--gradient-primary, linear-gradient(135deg, oklch(0.94 0.05 250), oklch(0.96 0.03 280)))" }}>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700/70">Total Unpaid Wages</div>
        <div className="mt-3 font-display text-5xl sm:text-6xl font-extrabold tabular text-slate-900">{fmt(available)}</div>
        <div className="mt-2 text-sm text-slate-600">
          {lastPayDate ? `Last pay date: ${new Date(lastPayDate + "T00:00:00").toLocaleDateString()}` : "No previous paychecks yet"}
        </div>
        <Button
          onClick={() => { setAmount(String(available.toFixed(2))); setReqOpen(true); }}
          disabled={available <= 0}
          className="mt-6 h-14 w-full sm:w-auto px-10 text-base"
        >
          <Wallet className="mr-2 h-5 w-5" /> Request Payout
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-5 py-4">
          <div className="font-display text-base font-bold text-slate-900">Previous Requests</div>
        </div>
        {requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No requests yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-4">
                {r.status === "approved" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : r.status === "declined" ? (
                  <XCircle className="h-5 w-5 text-rose-500" />
                ) : (
                  <ClockIcon className="h-5 w-5 text-slate-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base font-bold text-slate-900 tabular">{fmt(Number(r.requested_amount))}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(r.requested_at).toLocaleDateString()} · <span className="capitalize">{r.status}</span>
                    {r.decline_reason && ` · ${r.decline_reason}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Request modal */}
      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request payout</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available</div>
              <div className="mt-0.5 font-display text-2xl font-extrabold tabular text-primary">{fmt(available)}</div>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)}>Cancel</Button>
            <Button disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
              Continue <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm request</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            <Row label="Payout method" value={employee.bank_account_last4 ? `Bank ****${employee.bank_account_last4}` : "Direct deposit"} />
            <Row label="Requested amount" value={fmt(amt)} />
            <Row label="Service fee" value={fmt(fee)} />
            <li className="my-2 border-t border-border" />
            <Row label="Total payout" value={fmt(total)} bold />
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={bold ? "font-display text-base font-extrabold tabular text-slate-900" : "tabular text-slate-900"}>{value}</span>
    </li>
  );
}
