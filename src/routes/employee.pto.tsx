import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

export const Route = createFileRoute("/employee/pto")({
  head: () => ({ meta: [{ title: "Time off — Paylo" }] }),
  component: Page,
});

interface PTO { id: string; pto_type: string; start_date: string; end_date: string; hours: number; status: string; notes: string | null; }

const TYPES = {
  vacation:    { label: "Vacation", total: 120, color: "#10b981", tone: "bg-emerald-100 text-emerald-700" },
  sick:        { label: "Sick",     total: 80,  color: "#0ea5e9", tone: "bg-sky-100 text-sky-700" },
  personal:    { label: "Personal", total: 40,  color: "#8b5cf6", tone: "bg-violet-100 text-violet-700" },
  bereavement: { label: "Bereavement", total: 0, color: "#64748b", tone: "bg-slate-100 text-slate-700" },
  unpaid:      { label: "Unpaid",   total: 0,  color: "#64748b", tone: "bg-slate-100 text-slate-700" },
} as const;

type TypeKey = keyof typeof TYPES;
const PRIMARY_TYPES: TypeKey[] = ["vacation", "sick", "personal"];

function statusTone(s: string) {
  if (s === "approved") return "bg-emerald-100 text-emerald-700";
  if (s === "denied" || s === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function businessDaysBetween(a: string, b: string) {
  const start = new Date(a), end = new Date(b);
  if (end < start) return 0;
  let days = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days++;
  }
  return days;
}

function Donut({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const R = 60; const C = 2 * Math.PI * R;
  const dash = `${C * pct} ${C}`;
  return (
    <svg viewBox="0 0 160 160" className="h-[140px] w-[140px] -rotate-90">
      <circle cx="80" cy="80" r={R} fill="none" stroke="#F1F5F9" strokeWidth="16" />
      <circle cx="80" cy="80" r={R} fill="none" stroke={color} strokeWidth="16" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
}

function Page() {
  const { employee, loading } = useMyEmployee();
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PTO[]>([]);
  const [form, setForm] = useState({ pto_type: "vacation" as TypeKey, start_date: today, end_date: today, hours: 8, notes: "" });

  async function load() {
    if (!employee) return;
    const { data: entries } = await supabase
      .from("pto_entries")
      .select("id, pto_type, start_date, end_date, hours, status, notes")
      .eq("employee_id", employee.id)
      .order("start_date", { ascending: false })
      .limit(60);
    setItems((entries ?? []) as PTO[]);
  }
  useEffect(() => { load(); }, [employee?.id]);

  const usedByType = useMemo(() => {
    const u: Record<string, number> = {};
    for (const e of items) {
      if (e.status === "approved") u[e.pto_type] = (u[e.pto_type] ?? 0) + Number(e.hours);
    }
    return u;
  }, [items]);

  const days = businessDaysBetween(form.start_date, form.end_date);
  const selectedTotal = TYPES[form.pto_type].total;
  const selectedUsed = usedByType[form.pto_type] ?? 0;
  const selectedRem = Math.max(0, selectedTotal - selectedUsed);

  async function submit() {
    if (!employee) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("pto_entries").insert({
      ...form, hours: Number(form.hours) || 0,
      employee_id: employee.id, company_id: employee.company_id, owner_id: user.id, status: "pending",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Your request has been submitted and is waiting for manager approval.");
    setOpen(false);
    setForm({ pto_type: "vacation", start_date: today, end_date: today, hours: 8, notes: "" });
    load();
  }

  async function cancelRequest(id: string) {
    const { error } = await supabase.from("pto_entries").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Request cancelled");
    load();
  }

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-8 unit-in">
      <div>
        <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">Time Off</h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">Plan your time off and track your balance.</p>
      </div>

      {/* Donut balance cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PRIMARY_TYPES.map((k) => {
          const t = TYPES[k];
          const usedH = usedByType[k] ?? 0;
          const remH = Math.max(0, t.total - usedH);
          const remDays = Math.floor(remH / 8);
          return (
            <div key={k} className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.label}</div>
              <div className="mt-3 flex items-center justify-center">
                <div className="relative">
                  <Donut used={usedH} total={t.total} color={t.color} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="font-display text-3xl font-extrabold tabular text-slate-900">{remDays}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">days left</div>
                  </div>
                </div>
              </div>
              <div className="mt-2 text-center text-xs text-slate-500">
                {(usedH / 8).toFixed(1)} of {(t.total / 8).toFixed(0)} days used
              </div>
            </div>
          );
        })}
      </div>

      {/* Request button */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="h-14 w-full text-base font-bold sm:w-auto sm:px-8">
            <Plus className="mr-2 h-5 w-5" /> Request Time Off
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Request time off</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Leave type</Label>
              <Select value={form.pto_type} onValueChange={(v) => setForm({ ...form, pto_type: v as TypeKey })}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPES) as TypeKey[]).map(k => (
                    <SelectItem key={k} value={k}>{TYPES[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start date</Label><Input className="h-12" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>End date</Label><Input className="h-12" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div className="rounded-lg bg-surface px-4 py-3 text-sm text-slate-700">
              <div><strong>{days}</strong> business {days === 1 ? "day" : "days"} selected</div>
              {selectedTotal > 0 && (
                <div className="mt-1 text-xs text-slate-500">
                  You have {(selectedRem / 8).toFixed(0)} {TYPES[form.pto_type].label.toLowerCase()} days remaining.
                  This request will use {days} {days === 1 ? "day" : "days"}, leaving you with {Math.max(0, (selectedRem / 8) - days).toFixed(0)} days.
                </div>
              )}
            </div>
            <div>
              <Label>Hours total</Label>
              <Input className="h-12" type="number" min={0} step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Submit request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <div className="rounded-3xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4 font-display text-lg font-bold text-slate-900">
          Request history
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No requests yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((p) => {
              const t = (TYPES as any)[p.pto_type] ?? { label: p.pto_type, tone: "bg-slate-100 text-slate-700" };
              const ddays = businessDaysBetween(p.start_date, p.end_date);
              return (
                <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-4 sm:flex sm:flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${t.tone}`}>{t.label}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusTone(p.status)}`}>{p.status}</span>
                    </div>
                    <div className="mt-1.5 truncate text-sm font-semibold text-slate-900">
                      {new Date(p.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} → {new Date(p.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div className="text-xs text-slate-500">
                      {ddays} {ddays === 1 ? "day" : "days"} · {p.hours}h{p.notes ? ` · ${p.notes}` : ""}
                    </div>
                  </div>
                  {p.status === "pending" && (
                    <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => cancelRequest(p.id)}>
                      <X className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
