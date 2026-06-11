import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Receipt, Plus, CheckCircle2, XCircle, Clock as ClockIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Paylo" }] }),
  component: EmployeeExpensesPage,
});

interface Row {
  id: string;
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
  reimbursed_at: string | null;
}

const CATEGORIES = ["travel", "meals", "supplies", "mileage", "lodging", "training", "other"];

function fmt(n: number, c = "USD") {
  return n.toLocaleString("en-US", { style: "currency", currency: c });
}

function EmployeeExpensesPage() {
  const { employee } = useMyEmployee();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    category: "travel",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    merchant: "",
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    if (!employee) return;
    const { data } = await supabase
      .from("expense_requests")
      .select("*")
      .eq("employee_id", employee.id)
      .order("submitted_at", { ascending: false });
    setRows((data ?? []) as any);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [employee?.id]);
  useRealtimeRefresh(["expense_requests"], load, { companyId: employee?.company_id ?? null });

  async function submit() {
    if (!employee) return;
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      let receipt_url: string | null = null;
      if (file) {
        const { data: { user } } = await supabase.auth.getUser();
        const path = `${user?.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const up = await supabase.storage.from("expense-receipts").upload(path, file);
        if (up.error) throw up.error;
        receipt_url = path;
      }
      const { error } = await supabase.from("expense_requests").insert({
        company_id: employee.company_id,
        employee_id: employee.id,
        category: form.category,
        amount: amt,
        expense_date: form.expense_date,
        merchant: form.merchant.trim() || null,
        description: form.description.trim() || null,
        receipt_url,
      });
      if (error) throw error;
      toast.success("Expense submitted");
      setOpen(false);
      setForm({ category: "travel", amount: "", expense_date: new Date().toISOString().slice(0, 10), merchant: "", description: "" });
      setFile(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  async function openReceipt(path: string) {
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return toast.error("Could not load receipt");
    window.open(data.signedUrl, "_blank");
  }

  async function cancelRow(id: string) {
    if (!confirm("Cancel this expense request?")) return;
    const { error } = await supabase.from("expense_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cancelled");
    load();
  }

  const statusBadge = (s: string) => {
    if (s === "pending") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold"><ClockIcon className="h-3 w-3"/>Pending</span>;
    if (s === "approved") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold"><CheckCircle2 className="h-3 w-3"/>Approved</span>;
    if (s === "reimbursed") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold"><CheckCircle2 className="h-3 w-3"/>Reimbursed</span>;
    if (s === "declined") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold"><XCircle className="h-3 w-3"/>Declined</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold capitalize">{s}</span>;
  };

  return (
    <div className="space-y-6 unit-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">
            My Expenses
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-500">
            Submit business expenses and track reimbursement.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1"/>New expense</Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
          <Receipt className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 font-display text-lg font-bold text-slate-900">No expenses yet</div>
          <div className="mt-1 text-sm text-slate-500">Submit your first expense to get started.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-slate-900 capitalize">{r.category}</div>
                    {statusBadge(r.status)}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {r.merchant && <>{r.merchant} • </>}{new Date(r.expense_date).toLocaleDateString()}
                  </div>
                  {r.description && <div className="mt-2 text-sm text-slate-700">{r.description}</div>}
                  {r.decline_reason && <div className="mt-2 text-sm text-rose-600">Declined: {r.decline_reason}</div>}
                </div>
                <div className="text-right">
                  <div className="font-display text-xl font-extrabold text-slate-900">{fmt(Number(r.amount), r.currency)}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                {r.receipt_url && (
                  <Button variant="outline" size="sm" onClick={() => openReceipt(r.receipt_url!)}>
                    <ExternalLink className="h-4 w-4 mr-1"/>Receipt
                  </Button>
                )}
                {r.status === "pending" && (
                  <Button variant="outline" size="sm" onClick={() => cancelRow(r.id)}>Cancel</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Category</Label>
              <select className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm capitalize"
                value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (USD)</Label>
                <Input type="number" step="0.01" min="0" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Merchant</Label>
              <Input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                placeholder="Where did you spend?" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} rows={2}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What was this for?" />
            </div>
            <div>
              <Label>Receipt (optional)</Label>
              <Input type="file" accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
