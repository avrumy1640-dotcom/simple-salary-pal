import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/_app/employees")({
  head: () => ({ meta: [{ title: "Employees — Paylo" }] }),
  component: EmployeesPage,
});

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  pay_type: "hourly" | "salary";
  pay_rate: number;
  status: "active" | "inactive";
}

function EmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  type FormState = { full_name: string; email: string; job_title: string; pay_type: "hourly" | "salary"; pay_rate: number; status: "active" | "inactive" };
  const empty: FormState = { full_name: "", email: "", job_title: "", pay_type: "hourly", pay_rate: 20, status: "active" };
  const [form, setForm] = useState<FormState>(empty);

  async function refresh() {
    setLoading(true);
    const { data } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as Employee[]);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(e: Employee) {
    setEditing(e);
    setForm({ full_name: e.full_name, email: e.email ?? "", job_title: e.job_title ?? "", pay_type: e.pay_type, pay_rate: Number(e.pay_rate), status: e.status });
    setOpen(true);
  }

  async function save() {
    if (!form.full_name.trim()) { toast.error("Name is required"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = { ...form, pay_rate: Number(form.pay_rate) || 0, owner_id: user.id };
    const { error } = editing
      ? await supabase.from("employees").update(payload).eq("id", editing.id)
      : await supabase.from("employees").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Updated" : "Employee added");
    setOpen(false);
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remove this employee?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage your team.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Add employee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={120} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
                </div>
                <div>
                  <Label>Job title</Label>
                  <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} maxLength={120} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Pay type</Label>
                  <Select value={form.pay_type} onValueChange={(v) => setForm({ ...form, pay_type: v as "hourly" | "salary" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="salary">Salary (annual)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{form.pay_type === "hourly" ? "Hourly rate ($)" : "Annual salary ($)"}</Label>
                  <Input type="number" min={0} step="0.01" value={form.pay_rate} onChange={(e) => setForm({ ...form, pay_rate: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>{editing ? "Save changes" : "Add employee"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border bg-card">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">No employees yet.</p>
            <Button onClick={openNew} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Add your first employee</Button>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-accent text-sm font-medium text-accent-foreground">
                  {e.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{e.full_name}</p>
                    {e.status === "inactive" && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {e.job_title || "—"} · {e.pay_type === "hourly" ? `${fmtUSD(e.pay_rate)}/hr` : `${fmtUSD(e.pay_rate)}/yr`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
