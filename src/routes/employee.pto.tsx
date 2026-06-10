import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Plus } from "lucide-react";

export const Route = createFileRoute("/employee/pto")({
  head: () => ({ meta: [{ title: "My time off — Paylo" }] }),
  component: Page,
});

interface PTO { id: string; pto_type: string; start_date: string; end_date: string; hours: number; status: string; notes: string | null; }

function Page() {
  const { employee, loading } = useMyEmployee();
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PTO[]>([]);
  const [form, setForm] = useState({ pto_type: "vacation", start_date: today, end_date: today, hours: 8, notes: "" });

  async function load() {
    if (!employee) return;
    const { data } = await supabase
      .from("pto_entries")
      .select("id, pto_type, start_date, end_date, hours, status, notes")
      .eq("employee_id", employee.id)
      .order("start_date", { ascending: false })
      .limit(50);
    setItems((data ?? []) as PTO[]);
  }
  useEffect(() => { load(); }, [employee?.id]);

  async function submit() {
    if (!employee) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("pto_entries").insert({
      ...form, hours: Number(form.hours) || 0,
      employee_id: employee.id, owner_id: user.id, status: "pending",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Time off request submitted");
    setOpen(false);
    setForm({ pto_type: "vacation", start_date: today, end_date: today, hours: 8, notes: "" });
    load();
  }

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Time off</h1>
          <p className="text-sm text-muted-foreground">You have {Number(employee.pto_balance_hours).toFixed(1)}h available.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Request time off</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request time off</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Type</Label>
                <Select value={form.pto_type} onValueChange={(v) => setForm({ ...form, pto_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Vacation</SelectItem>
                    <SelectItem value="sick">Sick</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="bereavement">Bereavement</SelectItem>
                    <SelectItem value="unpaid">Unpaid leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>From</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>To</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div><Label>Total hours</Label><Input type="number" min={0} step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} /></div>
              <div><Label>Reason (optional)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border bg-card">
        {items.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No requests yet.</div>
        ) : (
          <ul className="divide-y">
            {items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium capitalize">{p.pto_type}</div>
                  <div className="text-xs text-muted-foreground">{p.start_date} → {p.end_date} · {p.hours}h{p.notes ? ` · ${p.notes}` : ""}</div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  p.status === "approved" ? "bg-[oklch(0.94_0.05_155)] text-[oklch(0.4_0.16_155)]" :
                  p.status === "denied" || p.status === "rejected" ? "bg-destructive/10 text-destructive" :
                  "bg-muted text-muted-foreground"
                }`}>{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
