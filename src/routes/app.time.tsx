import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/time")({
  head: () => ({ meta: [{ title: "Time tracking — Paylo" }] }),
  component: TimePage,
});

interface Emp { id: string; full_name: string; pay_type: string }
interface Entry {
  id: string;
  employee_id: string;
  work_date: string;
  hours: number;
  overtime_hours: number;
  notes: string | null;
  employees?: { full_name: string };
}

function TimePage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState({
    employee_id: "",
    work_date: new Date().toISOString().slice(0, 10),
    hours: 8,
    overtime_hours: 0,
    notes: "",
  });

  async function refresh() {
    const { data: e } = await supabase.from("employees").select("id, full_name, pay_type").eq("status", "active").order("full_name");
    setEmps((e ?? []) as Emp[]);
    const { data: t } = await supabase.from("time_entries").select("*, employees(full_name)").order("work_date", { ascending: false }).limit(50);
    setEntries((t ?? []) as Entry[]);
  }
  useEffect(() => { refresh(); }, []);

  async function add() {
    if (!form.employee_id) { toast.error("Pick an employee"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("time_entries").insert({
      ...form,
      hours: Number(form.hours) || 0,
      overtime_hours: Number(form.overtime_hours) || 0,
      owner_id: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Logged");
    setForm({ ...form, hours: 8, overtime_hours: 0, notes: "" });
    refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Time tracking</h1>
        <p className="text-sm text-muted-foreground">Log hours for your team.</p>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-medium">Log hours</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Employee</Label>
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
          </div>
          <div>
            <Label>Hours</Label>
            <Input type="number" min={0} step="0.25" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
          </div>
          <div>
            <Label>OT hours</Label>
            <Input type="number" min={0} step="0.25" value={form.overtime_hours} onChange={(e) => setForm({ ...form, overtime_hours: Number(e.target.value) })} />
          </div>
          <div className="flex items-end">
            <Button className="w-full gap-2" onClick={add}><Plus className="h-4 w-4" /> Log</Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium">Recent entries</div>
        {entries.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No entries yet.</div>
        ) : (
          <ul className="divide-y">
            {entries.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.employees?.full_name ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.work_date} · {Number(t.hours)}h{Number(t.overtime_hours) > 0 ? ` + ${Number(t.overtime_hours)}h OT` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
