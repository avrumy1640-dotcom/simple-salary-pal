import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, CalendarDays, Check, X, Clock, RefreshCw } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { approvePtoRequest, denyPtoRequest, runAccrual } from "@/lib/pto.functions";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

export const Route = createFileRoute("/app/pto")({
  head: () => ({ meta: [{ title: "Time off — Paylo" }] }),
  component: PTOPage,
});

interface Emp { id: string; full_name: string; pto_balance_hours: number; pto_policy_id: string | null; lifecycle_status: string | null }
interface Balance { employee_id: string; balance_hours: number; lifetime_accrued: number; lifetime_used: number }
interface Policy { id: string; name: string; hours_per_period: number; frequency: string; max_balance_hours: number | null }
interface Entry {
  id: string;
  employee_id: string;
  pto_type: string;
  start_date: string;
  end_date: string;
  hours: number;
  status: string;
  notes: string | null;
}

const TYPES = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" },
  { value: "bereavement", label: "Bereavement" },
  { value: "unpaid", label: "Unpaid leave" },
];

function PTOPage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [accrualOpen, setAccrualOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ employee_id: "", pto_type: "vacation", start_date: today, end_date: today, hours: 8, notes: "" });
  const [accrual, setAccrual] = useState<{ as_of_date: string; policy_id: string }>({ as_of_date: today, policy_id: "" });
  const { currentId } = useCompany();

  const approveFn = useServerFn(approvePtoRequest);
  const denyFn = useServerFn(denyPtoRequest);
  const runAccrualFn = useServerFn(runAccrual);

  async function refresh() {
    if (!currentId) return;
    const [{ data: e }, { data: bals }, { data: p }, { data: pols }] = await Promise.all([
      supabase.from("employees").select("id, full_name, pto_balance_hours, pto_policy_id, lifecycle_status")
        .eq("company_id", currentId)
        .neq("lifecycle_status", "terminated")
        .order("full_name"),
      supabase.from("employee_pto_balances").select("employee_id, balance_hours, lifetime_accrued, lifetime_used")
        .eq("company_id", currentId),
      supabase.from("pto_entries").select("*").eq("company_id", currentId)
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("pto_accrual_policies").select("id, name, hours_per_period, frequency, max_balance_hours")
        .eq("company_id", currentId).order("name"),
    ]);
    setEmps((e ?? []) as Emp[]);
    const map: Record<string, Balance> = {};
    for (const b of (bals ?? []) as Balance[]) map[b.employee_id] = b;
    setBalances(map);
    setEntries((p ?? []) as Entry[]);
    setPolicies((pols ?? []) as Policy[]);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [currentId]);
  useRealtimeRefresh(["pto_entries", "employees"], refresh, { companyId: currentId });

  async function add() {
    if (!form.employee_id) { toast.error("Pick an employee"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!currentId) { toast.error("No active company selected"); return; }
    const { error } = await supabase.from("pto_entries").insert({ ...form, hours: Number(form.hours) || 0, owner_id: user.id, company_id: currentId });
    if (error) { toast.error(error.message); return; }
    toast.success("Time off requested");
    setOpen(false);
    refresh();
  }

  async function approve(id: string) {
    try {
      await approveFn({ data: { entry_id: id } });
      toast.success("Request approved · balance updated");
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Approval failed"); }
  }
  async function deny(id: string) {
    try {
      await denyFn({ data: { entry_id: id } });
      toast.success("Request denied");
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Denial failed"); }
  }

  async function executeAccrual() {
    if (!currentId) return;
    try {
      const res = await runAccrualFn({
        data: {
          company_id: currentId,
          as_of_date: accrual.as_of_date,
          policy_id: accrual.policy_id || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Accrual failed");
      } else {
        toast.success(`Accrual posted: ${res.employees_accrued} employees · ${res.hours_total}h credited`);
        setAccrualOpen(false);
        refresh();
      }
    } catch (err: any) { toast.error(err?.message ?? "Accrual failed"); }
  }

  const nameOf = (id: string) => emps.find((e) => e.id === id)?.full_name ?? "—";
  const balanceFor = (id: string) => balances[id]?.balance_hours ?? Number(emps.find((e) => e.id === id)?.pto_balance_hours ?? 0);

  return (
    <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Time off</h1>
          <p className="text-slate-500 mt-1">Track balances, approve requests, and run accruals.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 rounded-xl border-border text-slate-700 hover:bg-surface" onClick={() => refresh()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Dialog open={accrualOpen} onOpenChange={setAccrualOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 rounded-xl border-border text-slate-700 hover:bg-surface">Run accrual</Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader><DialogTitle className="text-slate-900">Post a PTO accrual</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Credits each eligible employee per their assigned policy. Running again on the same day won't double-credit anyone.</p>
                <div><Label className="text-slate-700">As-of date</Label><Input type="date" value={accrual.as_of_date} onChange={(e) => setAccrual({ ...accrual, as_of_date: e.target.value })} className="rounded-xl border-border bg-white" /></div>
                <div>
                  <Label className="text-slate-700">Policy (optional — all policies if blank)</Label>
                  <Select value={accrual.policy_id || "ALL"} onValueChange={(v) => setAccrual({ ...accrual, policy_id: v === "ALL" ? "" : v })}>
                    <SelectTrigger className="rounded-xl border-border bg-white"><SelectValue placeholder="All policies" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All policies</SelectItem>
                      {policies.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.hours_per_period}h / {p.frequency})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAccrualOpen(false)} className="rounded-xl">Cancel</Button>
                <Button onClick={executeAccrual} className="bg-primary text-slate-900 hover:bg-primary/90 rounded-xl">Post accrual</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-xl bg-primary text-slate-900 hover:bg-primary/90"><Plus className="h-4 w-4" /> Log time off</Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader><DialogTitle className="text-slate-900">Log time off</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-700">Employee</Label>
                  <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                    <SelectTrigger className="rounded-xl border-border bg-white"><SelectValue placeholder="Choose an employee" /></SelectTrigger>
                    <SelectContent>{emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name} ({balanceFor(e.id).toFixed(1)}h available)</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-700">Type</Label>
                  <Select value={form.pto_type} onValueChange={(v) => setForm({ ...form, pto_type: v })}>
                    <SelectTrigger className="rounded-xl border-border bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 grid-cols-2">
                  <div><Label className="text-slate-700">Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="rounded-xl border-border bg-white" /></div>
                  <div><Label className="text-slate-700">End date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="rounded-xl border-border bg-white" /></div>
                </div>
                <div>
                  <Label className="text-slate-700">Total hours</Label>
                  <Input type="number" min={0} step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} className="rounded-xl border-border bg-white" />
                  <p className="mt-1 text-xs text-slate-500">Usually 8 hours per full day off.</p>
                </div>
                <div><Label className="text-slate-700">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} className="rounded-xl border-border bg-white" /></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
                <Button onClick={add} className="bg-primary text-slate-900 hover:bg-primary/90 rounded-xl">Submit request</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Balances */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="border-b px-5 py-3 text-sm font-semibold text-slate-700 flex items-center gap-2 bg-surface"><CalendarDays className="h-4 w-4 text-slate-500" /> PTO balances</div>
        {emps.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Add active employees to track time off.</div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {emps.map((e) => {
              const b = balances[e.id];
              const balance = b ? Number(b.balance_hours) : Number(e.pto_balance_hours);
              return (
                <div key={e.id} className="rounded-xl border border-border bg-white p-5 hover:shadow-sm transition">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">{e.full_name}</div>
                    {!e.pto_policy_id && <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-slate-500">No policy</span>}
                  </div>
                  <div className="mt-2 text-3xl font-extrabold text-slate-900">{balance.toFixed(1)}h</div>
                  <div className="text-sm text-slate-500">≈ {(balance / 8).toFixed(1)} days available</div>
                  {b && (
                    <div className="mt-2 text-xs text-slate-500">
                      Accrued: {Number(b.lifetime_accrued).toFixed(1)}h · Used: {Number(b.lifetime_used).toFixed(1)}h
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Requests */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="border-b px-5 py-3 text-sm font-semibold text-slate-700 bg-surface">Recent requests</div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No time off requests yet.</div>
        ) : (
          <ul className="divide-y divide-border/50">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface transition">
                <Clock className="h-4 w-4 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">{nameOf(e.employee_id)} · <span className="capitalize text-slate-500 font-normal">{e.pto_type}</span></div>
                  <div className="text-sm text-slate-500">{e.start_date} → {e.end_date} · {e.hours}h</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                  e.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                  e.status === "denied" || e.status === "cancelled" ? "bg-red-50 text-red-600" :
                  "bg-slate-100 text-slate-600"
                }`}>{e.status}</span>
                {e.status === "pending" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => approve(e.id)} className="gap-1 text-emerald-700 hover:bg-emerald-50 rounded-lg"><Check className="h-4 w-4" /> Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => deny(e.id)} className="gap-1 text-red-600 hover:bg-red-50 rounded-lg"><X className="h-4 w-4" /> Deny</Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
