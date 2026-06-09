import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, HeartHandshake, Info } from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/benefits")({
  head: () => ({ meta: [{ title: "Benefits & deductions — Paylo" }] }),
  component: BenefitsPage,
});

interface Emp { id: string; full_name: string }
interface Deduction {
  id: string;
  employee_id: string;
  name: string;
  category: string;
  pre_tax: boolean;
  amount: number;
  amount_type: string;
  active: boolean;
}

const CATEGORIES = [
  { value: "health", label: "Health insurance", preTax: true },
  { value: "dental", label: "Dental / vision", preTax: true },
  { value: "401k", label: "401(k) retirement", preTax: true },
  { value: "hsa", label: "HSA / FSA", preTax: true },
  { value: "garnishment", label: "Wage garnishment", preTax: false },
  { value: "other", label: "Other", preTax: false },
];

function BenefitsPage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [items, setItems] = useState<Deduction[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "", name: "", category: "health", pre_tax: true, amount: 0, amount_type: "fixed",
  });

  async function refresh() {
    const [{ data: e }, { data: d }] = await Promise.all([
      supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
      supabase.from("deductions").select("*").order("created_at", { ascending: false }),
    ]);
    setEmps((e ?? []) as Emp[]);
    setItems((d ?? []) as Deduction[]);
  }
  useEffect(() => { refresh(); }, []);

  async function add() {
    if (!form.employee_id || !form.name.trim()) { toast.error("Pick an employee and a name"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("deductions").insert({ ...form, amount: Number(form.amount) || 0, owner_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Benefit added");
    setOpen(false);
    setForm({ employee_id: "", name: "", category: "health", pre_tax: true, amount: 0, amount_type: "fixed" });
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remove this deduction?")) return;
    await supabase.from("deductions").delete().eq("id", id);
    refresh();
  }

  async function toggle(d: Deduction) {
    await supabase.from("deductions").update({ active: !d.active }).eq("id", d.id);
    refresh();
  }

  const grouped = emps.map((e) => ({
    emp: e,
    deductions: items.filter((i) => i.employee_id === e.id),
  })).filter((g) => g.deductions.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Benefits & deductions</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Set up recurring deductions like health insurance, 401(k), HSA, or wage garnishments. They'll automatically come out of every paycheck.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full bg-primary text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" /> Add deduction</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a deduction</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Employee</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>{emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.category} onValueChange={(v) => {
                  const cat = CATEGORIES.find((c) => c.value === v);
                  setForm({ ...form, category: v, pre_tax: cat?.preTax ?? false, name: form.name || (cat?.label ?? "") });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name (shown on pay stub)</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Blue Cross PPO" />
              </div>
              <div className="grid gap-3 grid-cols-2">
                <div>
                  <Label>Amount type</Label>
                  <Select value={form.amount_type} onValueChange={(v) => setForm({ ...form, amount_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed $ per paycheck</SelectItem>
                      <SelectItem value="percent">% of gross pay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{form.amount_type === "percent" ? "Percent" : "Amount per pay period"}</Label>
                  <Input type="number" step="0.01" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Pre-tax deduction</div>
                  <div className="text-xs text-muted-foreground">Lowers taxable income (e.g. 401k, health).</div>
                </div>
                <Switch checked={form.pre_tax} onCheckedChange={(v) => setForm({ ...form, pre_tax: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={add}>Add deduction</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {emps.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <HeartHandshake className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">Add employees first, then you can set up their benefits.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
          <HeartHandshake className="mx-auto h-10 w-10 text-foreground" />
          <p className="text-sm text-muted-foreground">No deductions yet. Add health insurance, 401(k), or other recurring deductions.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ emp, deductions }) => (
            <div key={emp.id} className="rounded-2xl border bg-card">
              <div className="border-b px-5 py-3 font-medium">{emp.full_name}</div>
              <ul className="divide-y">
                {deductions.map((d) => (
                  <li key={d.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{d.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.pre_tax ? "bg-accent text-foreground" : "bg-muted text-muted-foreground"}`}>
                          {d.pre_tax ? "Pre-tax" : "Post-tax"}
                        </span>
                        {!d.active && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Paused</span>}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {d.amount_type === "percent" ? `${d.amount}% of gross` : `${fmtUSD(d.amount)} per pay period`}
                      </div>
                    </div>
                    <Switch checked={d.active} onCheckedChange={() => toggle(d)} />
                    <Button variant="ghost" size="icon" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 rounded-xl border bg-accent/40 p-4 text-sm">
        <Info className="h-4 w-4 mt-0.5 text-foreground flex-shrink-0" />
        <p className="text-foreground/80"><span className="font-medium">Tip:</span> Pre-tax deductions like 401(k) and health insurance reduce the federal tax your employees pay. Post-tax deductions (like garnishments) come out after taxes are calculated.</p>
      </div>
    </div>
  );
}
