import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarDays, Receipt, ArrowLeftRight, Check, X, Loader2, Inbox } from "lucide-react";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

export const Route = createFileRoute("/app/approvals")({
  ssr: false,
  component: ApprovalsInbox,
});

type Tab = "pto" | "expense" | "swap";

type Row = {
  id: string;
  kind: Tab;
  employee_name: string;
  summary: string;
  detail: string;
  created_at: string;
};

function ApprovalsInbox() {
  
  const [tab, setTab] = useState<Tab>("pto");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<Tab, Row[]>>({ pto: [], expense: [], swap: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<{ id: string; kind: Tab } | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    setLoading(true);
    const [pto, exp, swap] = await Promise.all([
      supabase
        .from("pto_entries")
        .select("id, pto_type, start_date, end_date, hours, notes, created_at, employee_id, employees:employee_id(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("expense_requests")
        .select("id, category, amount, currency, merchant, description, expense_date, created_at, employee_id, employees:employee_id(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("shift_swap_requests")
        .select("id, request_type, reason, created_at, requested_by_employee_id, employees:requested_by_employee_id(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    setRows({
      pto: (pto.data ?? []).map((r: any) => ({
        id: r.id,
        kind: "pto",
        employee_name: r.employees?.full_name ?? "Employee",
        summary: `${r.hours} hrs ${r.pto_type}`,
        detail: `${r.start_date} → ${r.end_date}${r.notes ? ` · ${r.notes}` : ""}`,
        created_at: r.created_at,
      })),
      expense: (exp.data ?? []).map((r: any) => ({
        id: r.id,
        kind: "expense",
        employee_name: r.employees?.full_name ?? "Employee",
        summary: `$${Number(r.amount).toFixed(2)} · ${r.category}`,
        detail: `${r.merchant ?? ""}${r.description ? ` — ${r.description}` : ""} (${r.expense_date})`,
        created_at: r.created_at,
      })),
      swap: (swap.data ?? []).map((r: any) => ({
        id: r.id,
        kind: "swap",
        employee_name: r.employees?.full_name ?? "Employee",
        summary: `${r.request_type} request`,
        detail: r.reason ?? "No reason provided",
        created_at: r.created_at,
      })),
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtimeRefresh(["pto_entries", "expense_requests", "shift_swap_requests"], load);

  async function approve(row: Row) {
    setBusy(row.id);
    let res;
    if (row.kind === "pto") {
      res = await supabase.from("pto_entries").update({ status: "approved" }).eq("id", row.id);
    } else if (row.kind === "expense") {
      res = await supabase.from("expense_requests").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", row.id);
    } else {
      res = await supabase.from("shift_swap_requests").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", row.id);
    }
    setBusy(null);
    if (res.error) {
      toast.error("Could not approve: " + res.error.message);
      return;
    }
    toast.success("Approved");
    setRows((s) => ({ ...s, [row.kind]: s[row.kind].filter((r) => r.id !== row.id) }));
  }

  async function confirmDeny() {
    if (!reasonFor) return;
    const { id, kind } = reasonFor;
    setBusy(id);
    let res;
    if (kind === "pto") {
      res = await supabase.from("pto_entries").update({ status: "denied" }).eq("id", id);
    } else if (kind === "expense") {
      res = await supabase.from("expense_requests").update({ status: "denied", decline_reason: reason || null, decided_at: new Date().toISOString() }).eq("id", id);
    } else {
      res = await supabase.from("shift_swap_requests").update({ status: "denied", decision_notes: reason || null, decided_at: new Date().toISOString() }).eq("id", id);
    }
    setBusy(null);
    setReasonFor(null);
    setReason("");
    if (res.error) {
      toast.error("Could not decline: " + res.error.message);
      return;
    }
    toast.success("Declined");
    setRows((s) => ({ ...s, [kind]: s[kind].filter((r) => r.id !== id) }));
  }

  const counts = useMemo(() => ({
    pto: rows.pto.length,
    expense: rows.expense.length,
    swap: rows.swap.length,
  }), [rows]);

  const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
    { id: "pto", label: "Time Off", icon: CalendarDays },
    { id: "expense", label: "Expenses", icon: Receipt },
    { id: "swap", label: "Shift Swaps", icon: ArrowLeftRight },
  ];

  const list = rows[tab];

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-sm text-muted-foreground">Review and decide on pending requests from your team.</p>
      </header>

      <div className="flex flex-wrap gap-2 border-b">
        {tabs.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-bold ${
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : list.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed py-16 text-center">
          <Inbox className="mb-2 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">All caught up</p>
          <p className="text-sm text-muted-foreground">No pending {tabs.find((t) => t.id === tab)?.label.toLowerCase()} requests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.employee_name}</span>
                  <span className="text-xs text-muted-foreground">· {new Date(row.created_at).toLocaleDateString()}</span>
                </div>
                <div className="text-sm">{row.summary}</div>
                <div className="text-xs text-muted-foreground">{row.detail}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setReasonFor({ id: row.id, kind: row.kind }); setReason(""); }}
                  disabled={busy === row.id}
                  className="text-rose-600 hover:bg-rose-50"
                >
                  <X className="mr-1 h-4 w-4" /> Decline
                </Button>
                <Button
                  size="sm"
                  onClick={() => approve(row)}
                  disabled={busy === row.id}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {busy === row.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {reasonFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setReasonFor(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Decline request</h2>
            <p className="mb-3 text-sm text-muted-foreground">Add an optional reason so the employee understands the decision.</p>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Reason (optional)" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReasonFor(null)}>Cancel</Button>
              <Button onClick={confirmDeny} disabled={busy !== null} className="bg-rose-600 hover:bg-rose-700">
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Confirm decline
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
