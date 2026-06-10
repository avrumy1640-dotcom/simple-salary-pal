import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { FileText, Plus, Trash2, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/app/onboarding-templates")({
  head: () => ({ meta: [{ title: "Onboarding templates — Paylo" }] }),
  component: OnboardingTemplatesPage,
});

interface Template { id: string; name: string; description: string | null; target_department: string | null; target_role: string | null; default_duration_days: number; is_active: boolean; }
interface TaskRow { id: string; template_id: string; title: string; description: string | null; category: string | null; day_offset: number; assignee_role: string | null; is_required: boolean; sort_order: number; }

function OnboardingTemplatesPage() {
  const { currentId } = useCompany();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  async function load() {
    if (!currentId) return;
    const [t, tk] = await Promise.all([
      supabase.from("onboarding_templates").select("*").eq("company_id", currentId).order("name"),
      supabase.from("onboarding_template_tasks").select("*").eq("company_id", currentId).order("sort_order"),
    ]);
    setTemplates((t.data ?? []) as Template[]);
    setTasks((tk.data ?? []) as TaskRow[]);
    if (!selected && t.data && t.data.length > 0) setSelected(t.data[0].id);
  }
  useEffect(() => { load(); }, [currentId]);

  const tpl = templates.find((x) => x.id === selected) || null;
  const tplTasks = tasks.filter((x) => x.template_id === selected).sort((a,b) => a.day_offset - b.day_offset || a.sort_order - b.sort_order);

  async function deleteTask(id: string) {
    const { error } = await supabase.from("onboarding_template_tasks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTasks((c) => c.filter((t) => t.id !== id));
  }
  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template and all its tasks?")) return;
    const { error } = await supabase.from("onboarding_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTemplates((c) => c.filter((t) => t.id !== id));
    setSelected(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding templates"
        description="Reusable checklists for new-hire onboarding by role or department."
        actions={<Button size="sm" onClick={() => setNewOpen(true)}><Plus className="mr-1 h-4 w-4" /> New template</Button>}
      />

      {templates.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-slate-400" />
          <h3 className="mt-3 font-display text-lg font-bold text-slate-900">No templates yet</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">Create reusable onboarding checklists — for example one per department — and apply them when a new employee starts.</p>
          <Button className="mt-4" size="sm" onClick={() => setNewOpen(true)}>Create template</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
          <aside className="space-y-1 rounded-xl border border-border bg-card p-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${selected === t.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-surface text-slate-700"}`}>
                <div className="flex items-center justify-between">
                  <span>{t.name}</span>
                  {!t.is_active && <Badge variant="secondary">inactive</Badge>}
                </div>
                <div className="text-[11px] text-slate-500">{tasks.filter((x) => x.template_id === t.id).length} tasks · {t.default_duration_days}d</div>
              </button>
            ))}
          </aside>

          <section className="rounded-xl border border-border bg-card">
            {tpl ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">{tpl.name}</h2>
                    {tpl.description && <p className="mt-1 text-sm text-slate-500">{tpl.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                      {tpl.target_department && <Badge variant="secondary">Dept: {tpl.target_department}</Badge>}
                      {tpl.target_role && <Badge variant="secondary">Role: {tpl.target_role}</Badge>}
                      <Badge variant="secondary">{tpl.default_duration_days} day plan</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => deleteTemplate(tpl.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" onClick={() => setTaskOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add task</Button>
                  </div>
                </div>

                {tplTasks.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">No tasks yet.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {tplTasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="w-16 shrink-0 text-right text-xs font-semibold text-slate-500">Day {t.day_offset}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <span className="font-semibold text-slate-900">{t.title}</span>
                            {t.is_required && <Badge variant="secondary">Required</Badge>}
                            {t.category && <Badge variant="secondary">{t.category}</Badge>}
                            {t.assignee_role && <Badge variant="secondary">Owner: {t.assignee_role}</Badge>}
                          </div>
                          {t.description && <p className="mt-1 text-xs text-slate-500">{t.description}</p>}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => deleteTask(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="p-10 text-center text-sm text-slate-500">Select a template.</div>
            )}
          </section>
        </div>
      )}

      <NewTemplateDialog open={newOpen} onClose={() => setNewOpen(false)} companyId={currentId} onCreated={(id) => { setSelected(id); load(); }} />
      {tpl && <NewTaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} companyId={currentId} templateId={tpl.id} onCreated={load} />}
    </div>
  );
}

function NewTemplateDialog({ open, onClose, companyId, onCreated }: { open: boolean; onClose: () => void; companyId: string | null; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: "", description: "", target_department: "", target_role: "", default_duration_days: 30 });
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!companyId || !form.name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("onboarding_templates").insert({
      company_id: companyId, name: form.name,
      description: form.description || null,
      target_department: form.target_department || null,
      target_role: form.target_role || null,
      default_duration_days: form.default_duration_days,
    }).select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Template created");
    setForm({ name: "", description: "", target_department: "", target_role: "", default_duration_days: 30 });
    onClose(); onCreated(data!.id);
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New onboarding template</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Engineering New Hire" /></div>
          <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Department</Label><Input value={form.target_department} onChange={(e) => setForm({ ...form, target_department: e.target.value })} /></div>
          <div><Label>Role</Label><Input value={form.target_role} onChange={(e) => setForm({ ...form, target_role: e.target.value })} /></div>
          <div><Label>Duration (days)</Label><Input type="number" value={form.default_duration_days} onChange={(e) => setForm({ ...form, default_duration_days: Number(e.target.value) || 30 })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTaskDialog({ open, onClose, companyId, templateId, onCreated }: { open: boolean; onClose: () => void; companyId: string | null; templateId: string; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", category: "Paperwork", day_offset: 0, assignee_role: "HR", is_required: true });
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!companyId || !form.title.trim()) { toast.error("Title required"); return; }
    setBusy(true);
    const { error } = await supabase.from("onboarding_template_tasks").insert({
      company_id: companyId, template_id: templateId,
      title: form.title, description: form.description || null,
      category: form.category, day_offset: form.day_offset,
      assignee_role: form.assignee_role, is_required: form.is_required,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Task added");
    setForm({ title: "", description: "", category: "Paperwork", day_offset: 0, assignee_role: "HR", is_required: true });
    onClose(); onCreated();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add template task</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Complete I-9 form" /></div>
          <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div><Label>Day offset</Label><Input type="number" value={form.day_offset} onChange={(e) => setForm({ ...form, day_offset: Number(e.target.value) })} /></div>
          <div><Label>Assignee role</Label><Input value={form.assignee_role} onChange={(e) => setForm({ ...form, assignee_role: e.target.value })} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} /> Required</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
