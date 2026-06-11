import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/app/departments")({
  head: () => ({ meta: [{ title: "Departments — Paylo" }] }),
  component: Page,
});

interface Dept {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}
interface Counts { [department_id: string]: number }

function Page() {
  const { currentId } = useCompany();
  const [items, setItems] = useState<Dept[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; code: string }>({ name: "", code: "" });

  async function load() {
    if (!currentId) return;
    setLoading(true);
    const [d, e] = await Promise.all([
      supabase.from("departments")
        .select("id, name, code, is_active, created_at")
        .eq("company_id", currentId)
        .order("name"),
      supabase.from("employees")
        .select("department_id")
        .eq("company_id", currentId),
    ]);
    setItems((d.data ?? []) as Dept[]);
    const c: Counts = {};
    ((e.data ?? []) as { department_id: string | null }[]).forEach((row) => {
      if (row.department_id) c[row.department_id] = (c[row.department_id] ?? 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentId]);

  // Realtime
  useEffect(() => {
    if (!currentId) return;
    const ch = supabase.channel(`depts-admin-${currentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "departments", filter: `company_id=eq.${currentId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [currentId]);

  function startCreate() { setForm({ name: "", code: "" }); setCreating(true); }
  function startEdit(d: Dept) { setForm({ name: d.name, code: d.code ?? "" }); setEditing(d); }

  async function save() {
    const name = form.name.trim();
    if (!name) { toast.error("Name is required"); return; }
    if (!currentId) return;
    if (editing) {
      const { error } = await supabase.from("departments")
        .update({ name, code: form.code.trim() || null })
        .eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Department updated");
      setEditing(null);
    } else {
      const { error } = await supabase.from("departments")
        .insert({ company_id: currentId, name, code: form.code.trim() || null });
      if (error) { toast.error(error.message); return; }
      toast.success("Department created");
      setCreating(false);
    }
    load();
  }

  async function remove(d: Dept) {
    if (!confirm(`Delete "${d.name}"? Employees in this department will be unassigned.`)) return;
    const { error } = await supabase.from("departments").delete().eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Department removed");
    load();
  }

  async function toggleActive(d: Dept) {
    const { error } = await supabase.from("departments").update({ is_active: !d.is_active }).eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  return (
    <div className="space-y-6 unit-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900">Departments</h1>
          <p className="mt-1 text-slate-500">One source of truth for your org structure — used across HR, payroll, scheduling, and reporting.</p>
        </div>
        <Button onClick={startCreate} className="h-11 gap-2 rounded-full">
          <Plus className="h-4 w-4" /> Add department
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">No departments yet</div>
              <div className="mt-1 text-sm text-slate-500">Create departments so every module shares the same list.</div>
            </div>
            <Button onClick={startCreate} variant="outline" className="mt-2 gap-2">
              <Plus className="h-4 w-4" /> Add your first department
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((d) => (
              <li key={d.id} className="flex items-center gap-4 px-5 py-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{d.name}</span>
                    {d.code && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{d.code}</span>}
                    {!d.is_active && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Inactive</span>}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Users className="h-3 w-3" />
                    {counts[d.id] ?? 0} {counts[d.id] === 1 ? "employee" : "employees"}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(d)} className="text-slate-600">
                  {d.is_active ? "Deactivate" : "Reactivate"}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => startEdit(d)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(d)} aria-label="Delete" className="text-rose-600 hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit department" : "New department"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Engineering" />
            </div>
            <div>
              <Label>Code <span className="text-xs text-slate-400">(optional)</span></Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ENG" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
