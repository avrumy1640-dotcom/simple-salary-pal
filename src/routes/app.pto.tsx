import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, CalendarDays, Check, X, Clock } from "lucide-react";

export const Route = createFileRoute("/app/pto")({
  head: () => ({ meta: [{ title: "Time off — Paylo" }] }),
  component: PTOPage,
});

interface Emp { id: string; full_name: string; pto_balance_hours: number }
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ employee_id: "", pto_type: "vacation", start_date: today, end_date: today, hours: 8, notes: "" });

  async function refresh() {
    const [{ data: e }, { data: p }] = await Promise.all([
      supabase.from("employees").select("id, full_name, pto_balance_hours").eq("status", "active").order("full_name"),
      supabase.from("pto_entries").select("*").order("start_date", { ascending: false }).limit(50),
    ]);
    setEmps((e ?? []) as Emp[]);
    setEntries((p ?? []) as Entry[]);
  }
  useEffect(() => { refresh(); }, []);

  async function add() {
    if (!form.employee_id) { toast.error("Pick an employee"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("pto_entries").insert({ ...form, hours: Number(form.hours) || 0, owner_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Time off requested");
    setOpen(false);
    refresh();
  }

  async function setStatus(id: string, status: "approved" | "denied") {
    const entry = entries.find((e) => e.id === id);
    await supabase.from("pto_entries").update({ status }).eq("id", id);
    if (status === "approved" && entry) {
      const emp = emps.find((e) => e.id === entry.employee_id);
      if (emp) {
        await supabase.from("employees").update({ pto_balance_hours: Math.max(0, Number(emp.pto_balance_hours) - Number(entry.hours)) }).eq("id", emp.id);
      }
    }
    toast.success(`Request ${status}`);
    refresh();
  }

  const nameOf = (id: string) => emps.find((e) => e.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Time off (PTO)</h1>
          <p className="text-sm text-muted-foreground">Track vacation, sick days, and other leave. Approved time deducts from each employee's balance.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full bg-primary text-white hover:opacity-90"><Plus className="h-4 w-4" /> Log time off</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log time off</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>{emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name} ({e.pto_balance_hours}h available)</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.pto_type} onValueChange={(v) => setForm({ ...form, pto_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 grid-cols-2">
                <div><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>End date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div>
                <Label>Total hours</Label>
                <Input type="number" min={0} step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
                <p className="mt-1 text-xs text-muted-foreground">Usually 8 hours per full day off.</p>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={add}>Submit request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4" /> PTO balances</div>
        {emps.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Add active employees to track PTO.</div>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {emps.map((e) => (
              <div key={e.id} className="rounded-xl border bg-background p-4">
                <div className="text-sm font-medium">{e.full_name}</div>
                <div className="mt-2 text-2xl font-bold text-foreground">{Number(e.pto_balance_hours).toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">≈ {(Number(e.pto_balance_hours) / 8).toFixed(1)} days available</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium">Recent requests</div>
        {entries.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No time off requests yet.</div>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{nameOf(e.employee_id)} · <span className="capitalize text-muted-foreground font-normal">{e.pto_type}</span></div>
                  <div className="text-xs text-muted-foreground">{e.start_date} → {e.end_date} · {e.hours}h</div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  e.status === "approved" ? "bg-[oklch(0.94_0.05_155)] text-[oklch(0.4_0.16_155)]" :
                  e.status === "denied" ? "bg-destructive/10 text-destructive" :
                  "bg-muted text-muted-foreground"
                }`}>{e.status}</span>
                {e.status === "pending" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(e.id, "approved")} className="gap-1 text-[oklch(0.4_0.16_155)]"><Check className="h-4 w-4" /> Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(e.id, "denied")} className="gap-1 text-destructive"><X className="h-4 w-4" /> Deny</Button>
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
