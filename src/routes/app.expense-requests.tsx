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
import { Receipt, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

export const Route = createFileRoute("/app/expense-requests")({
  head: () => ({ meta: [{ title: "Expense Requests — Paylo" }] }),
  component: ExpenseRequestsAdmin,
});

interface Row {
  id: string;
  employee_id: string;
  category: string;
  amount: number;
  currency: string;
  expense_date: string;
  merchant: string | null;
  description: string | null;
  receipt_url: string | null;
  status: string;
  decline_reason: string | null;
  submitted_at: string;
  decided_at: string | null;
  reimbursed_at: string | null;
  employees?: { full_name: string; job_title: string | null } | null;
}

function fmt(n: number, currency = "USD") {
  return n.toLocaleString("en-US", { style: "currency", currency });
}

function ExpenseRequestsAdmin() {
  const { currentId: companyId } = useCompany();
  const [tab, setTab] = useState<"pending" | "approved" | "history">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [declineFor, setDeclineFor] = useState<Row | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    const { data } = await supabase
      .from("expense_requests")
      .select("*, employees(full_name, job_title)")
      .eq("company_id", companyId)
      .order("submitted_at", { ascending: false });
    setRows((data ?? []) as any);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);
  useRealtimeRefresh(["expense_requests"], load, { companyId });

  const list = rows.filter((r) => {
    if (tab === "pending") return r.status === "pending";
    if (tab === "approved") return r.status === "approved";
    return r.status !== "pending" && r.status !== "approved";
  });

  async function approve(r: Row) {
    setBusy(r.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("expense_requests")
      .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: user?.id ?? null })
      .eq("id", r.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Expense approved");
    load();
  }

  async function reimburse(r: Row) {
    setBusy(r.id);
    const { error } = await supabase.from("expense_requests")
      .update({ status: "reimbursed", reimbursed_at: new Date().toISOString() })
      .eq("id", r.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Marked as reimbursed");
    load();
  }

  async function decline() {
    if (!declineFor) return;
    if (!declineReason.trim()) return toast.error("Please provide a reason");
    setBusy(declineFor.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("expense_requests")
      .update({
        status: "declined",
        decline_reason: declineReason.trim(),
        decided_at: new Date().toISOString(),
        decided_by: user?.id ?? null,
      })
      .eq("id", declineFor.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Expense declined");
    setDeclineFor(null);
    setDeclineReason("");
    load();
  }

  async function openReceipt(path: string) {
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return toast.error("Could not load receipt");
    window.open(data.signedUrl, "_blank");
  }

  const pendingCount = rows.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-6 unit-in">
      <div>
        <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">
          Expense Requests
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">
          Review and reimburse employee expenses.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-soft">
        {([
          ["pending", `Pending${pendingCount ? ` (${pendingCount})` : ""}`],
          ["approved", "Approved"],
          ["history", "History"],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              tab === t ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
          <Receipt className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 font-display text-lg font-bold text-slate-900">No {tab} expenses</div>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-slate-900">{r.employees?.full_name ?? "—"}</div>
                    {r.employees?.job_title && (
                      <span className="text-xs text-slate-500">• {r.employees.job_title}</span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    <span className="capitalize font-medium">{r.category}</span>
                    {r.merchant && <> • {r.merchant}</>} • {new Date(r.expense_date).toLocaleDateString()}
                  </div>
                  {r.description && <div className="mt-2 text-sm text-slate-700">{r.description}</div>}
                  {r.decline_reason && (
                    <div className="mt-2 text-sm text-rose-600">Declined: {r.decline_reason}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl font-extrabold text-slate-900">
                    {fmt(Number(r.amount), r.currency)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Submitted {new Date(r.submitted_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.receipt_url && (
                  <Button variant="outline" size="sm" onClick={() => openReceipt(r.receipt_url!)}>
                    <ExternalLink className="h-4 w-4 mr-1" /> View receipt
                  </Button>
                )}
                {r.status === "pending" && (
                  <>
                    <Button size="sm" disabled={busy === r.id} onClick={() => approve(r)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === r.id}
                      onClick={() => { setDeclineFor(r); setDeclineReason(""); }}>
                      <XCircle className="h-4 w-4 mr-1" /> Decline
                    </Button>
                  </>
                )}
                {r.status === "approved" && (
                  <Button size="sm" disabled={busy === r.id} onClick={() => reimburse(r)}>
                    Mark as reimbursed
                  </Button>
                )}
                {r.status === "reimbursed" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    <CheckCircle2 className="h-3 w-3" /> Reimbursed
                    {r.reimbursed_at ? ` on ${new Date(r.reimbursed_at).toLocaleDateString()}` : ""}
                  </span>
                )}
                {r.status === "declined" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold">
                    <XCircle className="h-3 w-3" /> Declined
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!declineFor} onOpenChange={(o) => !o && setDeclineFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decline expense</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={3}
              placeholder="Reason shown to the employee" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineFor(null)}>Cancel</Button>
            <Button onClick={decline} disabled={!!busy}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
