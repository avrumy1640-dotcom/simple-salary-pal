import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Wallet, CheckCircle2, XCircle, Clock as ClockIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/pay-on-demand")({
  head: () => ({ meta: [{ title: "Pay On-Demand — Paylo" }] }),
  component: PayOnDemandAdmin,
});

interface Req {
  id: string;
  employee_id: string;
  requested_amount: number;
  service_fee: number;
  total_payout: number;
  payout_method: string | null;
  status: string;
  decline_reason: string | null;
  requested_at: string;
  decided_at: string | null;
  employees?: { full_name: string; job_title: string | null; bank_account_last4: string | null } | null;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function PayOnDemandAdmin() {
  const { companyId } = useCompany();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [rows, setRows] = useState<Req[]>([]);
  const [declineFor, setDeclineFor] = useState<Req | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    const { data } = await supabase
      .from("pay_on_demand_requests")
      .select("*, employees(full_name, job_title, bank_account_last4)")
      .eq("company_id", companyId)
      .order("requested_at", { ascending: false });
    setRows((data ?? []) as any);
  }
  useEffect(() => { load(); }, [companyId]);

  const list = rows.filter((r) => tab === "pending" ? r.status === "pending" : r.status !== "pending");

  async function approve(r: Req) {
    setBusy(r.id);
    const { error } = await supabase
      .from("pay_on_demand_requests")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", r.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Request approved");
    load();
  }

  async function decline() {
    if (!declineFor) return;
    if (!declineReason.trim()) return toast.error("Please provide a reason");
    setBusy(declineFor.id);
    const { error } = await supabase
      .from("pay_on_demand_requests")
      .update({
        status: "declined",
        decline_reason: declineReason.trim(),
        decided_at: new Date().toISOString(),
      })
      .eq("id", declineFor.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Request declined");
    setDeclineFor(null);
    setDeclineReason("");
    load();
  }

  return (
    <div className="space-y-6 unit-in">
      <div>
        <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">
          Pay On-Demand
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">
          Approve early-wage payout requests from your team.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-soft">
        {(["pending", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg capitalize transition ${
              tab === t ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t} {tab !== t && t === "pending" && rows.some(r => r.status === "pending") ? `(${rows.filter(r => r.status === "pending").length})` : ""}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
          <Wallet className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 font-display text-lg font-bold text-slate-900">
            {tab === "pending" ? "No pending requests" : "No history yet"}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {tab === "pending" ? "Employee payout requests will appear here." : "Approved and declined requests show up here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const name = r.employees?.full_name ?? "Employee";
            const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-base font-bold text-primary">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <div className="font-display text-lg font-bold text-slate-900">{name}</div>
                      <div className="text-xs text-slate-500">{r.employees?.job_title}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Requested {new Date(r.requested_at).toLocaleString()}
                    </div>
                  </div>
                  {r.status !== "pending" && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                        r.status === "approved"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : r.status === "declined"
                          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {r.status === "approved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : r.status === "declined" ? <XCircle className="h-3.5 w-3.5" /> : null}
                      {r.status}
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Stat label="Amount Requested" value={fmt(Number(r.requested_amount))} accent />
                  <Stat label="Service Fee" value={fmt(Number(r.service_fee))} />
                  <Stat label="Total Payout" value={fmt(Number(r.total_payout))} />
                  <Stat label="Payout Method" value={r.payout_method ?? (r.employees?.bank_account_last4 ? `Bank ****${r.employees.bank_account_last4}` : "Direct deposit")} small />
                </div>

                {r.decline_reason && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    <span className="font-semibold">Decline reason:</span> {r.decline_reason}
                  </div>
                )}

                {r.status === "pending" && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="destructive"
                      className="flex-1 h-12"
                      disabled={busy === r.id}
                      onClick={() => { setDeclineFor(r); setDeclineReason(""); }}
                    >
                      <XCircle className="mr-2 h-5 w-5" /> Decline
                    </Button>
                    <Button
                      className="flex-1 h-12 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={busy === r.id}
                      onClick={() => approve(r)}
                    >
                      <CheckCircle2 className="mr-2 h-5 w-5" /> Approve
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!declineFor} onOpenChange={(v) => !v && setDeclineFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Pay On-Demand request</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={4}
              placeholder="Explain why this request is being declined…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={decline} disabled={!!busy}>Confirm decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 font-display font-extrabold tabular ${small ? "text-sm text-slate-700" : accent ? "text-xl text-primary" : "text-xl text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
