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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import {
  FileText, Plus, Trash2, ClipboardList, UserMinus, CheckCircle2, Circle,
  AlertTriangle, PlayCircle,
} from "lucide-react";

export const Route = createFileRoute("/app/offboarding")({
  head: () => ({ meta: [{ title: "Offboarding — Paylo" }] }),
  component: OffboardingPage,
});

interface Template { id: string; name: string; description: string | null; active: boolean }
interface TemplateTask {
  id: string; template_id: string; title: string; description: string | null;
  category: string; day_offset: number; is_required: boolean; sort_order: number;
}
interface Assignment {
  id: string; company_id: string; template_id: string | null; employee_id: string;
  termination_date: string; reason: string | null; status: string;
  completed_at: string | null; created_at: string;
  employee?: { full_name: string | null; job_title: string | null };
}
interface OffTask {
  id: string; assignment_id: string | null; employee_id: string; title: string;
  description: string | null; category: string; required: boolean; status: string;
  due_date: string | null; completed_at: string | null; sort_order: number;
}
interface Employee { id: string; full_name: string | null; job_title: string | null }

function OffboardingPage() {
  const { currentId, hasRole } = useCompany();
  const canManage = hasRole("owner", "admin", "hr_admin");

  if (!canManage) {
    return <div className="p-6 text-sm text-muted-foreground">You don't have permission to manage offboarding.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offboarding"
        description="Track exit checklists, asset returns, and final-pay tasks for departing employees."
      />
      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments" className="gap-1.5"><UserMinus className="h-4 w-4" /> Active offboardings</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><ClipboardList className="h-4 w-4" /> Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments" className="mt-4"><AssignmentsTab companyId={currentId!} /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab companyId={currentId!} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------- Templates tab -------------------- */
function TemplatesTab({ companyId }: { companyId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tasks, setTasks] = useState<TemplateTask[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  async function load() {
    const [t, tk] = await Promise.all([
      supabase.from("offboarding_templates").select("*").eq("company_id", companyId).order("name"),
      supabase.from("offboarding_template_tasks").select("*").order("sort_order"),
    ]);
    setTemplates((t.data ?? []) as Template[]);
    setTasks((tk.data ?? []) as TemplateTask[]);
    if (!selected && t.data && t.data.length > 0) setSelected(t.data[0].id);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const tpl = templates.find((x) => x.id === selected) || null;
  const tplTasks = tasks.filter((x) => x.template_id === selected).sort((a, b) => a.day_offset - b.day_offset || a.sort_order - b.sort_order);

  async function deleteTask(id: string) {
    const { error } = await supabase.from("offboarding_template_tasks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTasks((c) => c.filter((t) => t.id !== id));
  }
  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template and all its tasks?")) return;
    const { error } = await supabase.from("offboarding_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTemplates((c) => c.filter((t) => t.id !== id));
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="mr-1 h-4 w-4" /> New template</Button>
      </div>

      {templates.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-3 text-lg font-bold">No offboarding templates yet</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Define reusable exit checklists — for example, asset return, final paycheck, knowledge transfer — and apply them when an employee leaves.</p>
          <Button className="mt-4" size="sm" onClick={() => setNewOpen(true)}>Create template</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
          <aside className="space-y-1 rounded-xl border border-border bg-card p-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${selected === t.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground"}`}>
                <div className="flex items-center justify-between">
                  <span>{t.name}</span>
                  {!t.active && <Badge variant="secondary">inactive</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground">{tasks.filter((x) => x.template_id === t.id).length} tasks</div>
              </button>
            ))}
          </aside>

          <section className="rounded-xl border border-border bg-card">
            {tpl ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
                  <div>
                    <h2 className="text-lg font-bold">{tpl.name}</h2>
                    {tpl.description && <p className="mt-1 text-sm text-muted-foreground">{tpl.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => deleteTemplate(tpl.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" onClick={() => setTaskOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add task</Button>
                  </div>
                </div>
                {tplTasks.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">No tasks yet.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {tplTasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="w-20 shrink-0 text-right text-xs font-semibold text-muted-foreground">
                          {t.day_offset === 0 ? "Day of" : t.day_offset > 0 ? `+${t.day_offset}d` : `${t.day_offset}d`}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-semibold">{t.title}</span>
                            {t.is_required && <Badge variant="secondary">Required</Badge>}
                            <Badge variant="secondary">{t.category}</Badge>
                          </div>
                          {t.description && <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => deleteTask(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">Select a template.</div>
            )}
          </section>
        </div>
      )}

      <NewTemplateDialog open={newOpen} onClose={() => setNewOpen(false)} companyId={companyId} onCreated={(id) => { setSelected(id); load(); }} />
      {tpl && <NewTemplateTaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} templateId={tpl.id} onCreated={load} />}
    </div>
  );
}

function NewTemplateDialog({ open, onClose, companyId, onCreated }: { open: boolean; onClose: () => void; companyId: string; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("offboarding_templates").insert({
      company_id: companyId, name: form.name, description: form.description || null,
    }).select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Template created");
    setForm({ name: "", description: "" });
    onClose(); onCreated(data!.id);
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New offboarding template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Standard Exit Checklist" /></div>
          <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTemplateTaskDialog({ open, onClose, templateId, onCreated }: { open: boolean; onClose: () => void; templateId: string; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", category: "general", day_offset: 0, is_required: true });
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setBusy(true);
    const { error } = await supabase.from("offboarding_template_tasks").insert({
      template_id: templateId, title: form.title, description: form.description || null,
      category: form.category, day_offset: form.day_offset, is_required: form.is_required,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Task added");
    setForm({ title: "", description: "", category: "general", day_offset: 0, is_required: true });
    onClose(); onCreated();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add template task</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Return laptop and badge" /></div>
          <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["general","assets","accounts","payroll","benefits","knowledge_transfer","compliance"].map((c) => (
                  <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Day offset (from term. date)</Label>
            <Input type="number" value={form.day_offset} onChange={(e) => setForm({ ...form, day_offset: Number(e.target.value) })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} /> Required</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Assignments tab -------------------- */
function AssignmentsTab({ companyId }: { companyId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tasks, setTasks] = useState<OffTask[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [a, t] = await Promise.all([
      supabase.from("offboarding_assignments")
        .select("*, employee:employees(full_name, job_title)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase.from("offboarding_tasks").select("*").eq("company_id", companyId).order("sort_order"),
    ]);
    setAssignments((a.data ?? []) as any);
    setTasks((t.data ?? []) as OffTask[]);
    if (!selected && a.data && a.data.length > 0) setSelected(a.data[0].id);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const cur = assignments.find((a) => a.id === selected) || null;
  const curTasks = tasks.filter((t) => t.assignment_id === selected);
  const progress = (a: Assignment) => {
    const list = tasks.filter((t) => t.assignment_id === a.id);
    const done = list.filter((t) => t.status === "completed").length;
    return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  };

  async function toggleTask(t: OffTask) {
    const next = t.status === "completed" ? "pending" : "completed";
    const { error } = await supabase.from("offboarding_tasks").update({
      status: next, completed_at: next === "completed" ? new Date().toISOString() : null,
    }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  async function completeAssignment(a: Assignment) {
    const remaining = tasks.filter((t) => t.assignment_id === a.id && t.required && t.status !== "completed").length;
    if (remaining > 0 && !confirm(`${remaining} required task(s) still open. Mark offboarding complete anyway?`)) return;
    const { error } = await supabase.from("offboarding_assignments").update({
      status: "completed", completed_at: new Date().toISOString(),
    }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Offboarding completed");
    load();
  }
  async function cancelAssignment(a: Assignment) {
    if (!confirm("Cancel this offboarding?")) return;
    const { error } = await supabase.from("offboarding_assignments").update({ status: "cancelled" }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="mr-1 h-4 w-4" /> Start offboarding</Button>
      </div>

      {loading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      ) : assignments.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <UserMinus className="h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-3 text-lg font-bold">No active offboardings</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Apply an offboarding template when an employee gives notice — the checklist drives asset return, final pay, and account cleanup.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[340px_1fr] gap-4">
          <aside className="surface-glass rounded-2xl overflow-hidden">
            <ul className="divide-y divide-border/50 max-h-[70vh] overflow-y-auto">
              {assignments.map((a) => {
                const p = progress(a);
                const active = selected === a.id;
                return (
                  <li key={a.id}>
                    <button onClick={() => setSelected(a.id)} className={`w-full text-left px-4 py-3 hover:bg-muted/40 ${active ? "bg-muted/40" : ""}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold truncate">{a.employee?.full_name ?? "—"}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Term {new Date(a.termination_date).toLocaleDateString()} · {p.done}/{p.total} tasks
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${p.pct}%` }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="surface-glass rounded-2xl">
            {cur ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 p-5">
                  <div>
                    <h2 className="text-lg font-bold">{cur.employee?.full_name ?? "—"}</h2>
                    <div className="text-sm text-muted-foreground">
                      {cur.employee?.job_title ?? ""} · Termination {new Date(cur.termination_date).toLocaleDateString()}
                    </div>
                    {cur.reason && <p className="mt-2 text-sm">{cur.reason}</p>}
                  </div>
                  <div className="flex gap-2">
                    {cur.status === "in_progress" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => cancelAssignment(cur)}>Cancel</Button>
                        <Button size="sm" onClick={() => completeAssignment(cur)} className="gap-1.5"><CheckCircle2 className="h-4 w-4" /> Complete</Button>
                      </>
                    )}
                  </div>
                </div>
                {curTasks.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">No tasks attached to this offboarding.</div>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {curTasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-3 px-5 py-3">
                        <button onClick={() => toggleTask(t)} className="mt-0.5">
                          {t.status === "completed"
                            ? <CheckCircle2 className="h-5 w-5 text-success" />
                            : <Circle className="h-5 w-5 text-muted-foreground" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium ${t.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                            <Badge variant="secondary">{t.category}</Badge>
                            {t.required && <Badge variant="secondary">Required</Badge>}
                            {t.due_date && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                {new Date(t.due_date) < new Date() && t.status !== "completed" && <AlertTriangle className="h-3 w-3 text-warning" />}
                                Due {new Date(t.due_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">Select an offboarding.</div>
            )}
          </section>
        </div>
      )}

      <NewAssignmentDialog open={openNew} onClose={() => setOpenNew(false)} companyId={companyId} onCreated={() => load()} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    in_progress: "bg-primary/15 text-primary",
    completed: "bg-success/15 text-success",
    cancelled: "bg-muted text-muted-foreground",
  };
  return <span className={`text-[10px] rounded-full px-2 py-0.5 ${styles[status] ?? "bg-muted text-muted-foreground"}`}>{status.replace("_", " ")}</span>;
}

function NewAssignmentDialog({
  open, onClose, companyId, onCreated,
}: { open: boolean; onClose: () => void; companyId: string; onCreated: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateTasks, setTemplateTasks] = useState<TemplateTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({
    employee_id: "", template_id: "", termination_date: new Date().toISOString().slice(0, 10), reason: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from("offboarding_templates").select("id, name, description, active").eq("company_id", companyId).eq("active", true).order("name"),
      supabase.from("offboarding_template_tasks").select("*"),
      supabase.from("employees").select("id, full_name, job_title").eq("company_id", companyId).eq("lifecycle_status", "active").order("full_name"),
    ]).then(([t, tt, e]) => {
      setTemplates((t.data ?? []) as Template[]);
      setTemplateTasks((tt.data ?? []) as TemplateTask[]);
      setEmployees((e.data ?? []) as Employee[]);
    });
  }, [open, companyId]);

  async function submit() {
    if (!form.employee_id || !form.termination_date) { toast.error("Employee and termination date are required"); return; }
    setBusy(true);

    const { data: created, error } = await supabase.from("offboarding_assignments").insert({
      company_id: companyId, employee_id: form.employee_id,
      template_id: form.template_id || null,
      termination_date: form.termination_date,
      reason: form.reason || null,
      status: "in_progress",
    }).select("id").single();

    if (error || !created) { setBusy(false); toast.error(error?.message ?? "Failed"); return; }

    // Materialize tasks from template, if any
    if (form.template_id) {
      const rows = templateTasks.filter((t) => t.template_id === form.template_id).map((t) => {
        const due = new Date(form.termination_date);
        due.setDate(due.getDate() + t.day_offset);
        return {
          company_id: companyId,
          assignment_id: created.id,
          employee_id: form.employee_id,
          template_id: form.template_id,
          template_task_id: t.id,
          title: t.title, description: t.description, category: t.category,
          required: t.is_required, sort_order: t.sort_order,
          status: "pending", due_date: due.toISOString().slice(0, 10),
        };
      });
      if (rows.length) {
        const { error: insErr } = await supabase.from("offboarding_tasks").insert(rows);
        if (insErr) toast.error(`Tasks: ${insErr.message}`);
      }
    }

    setBusy(false);
    toast.success("Offboarding started");
    setForm({ employee_id: "", template_id: "", termination_date: new Date().toISOString().slice(0, 10), reason: "" });
    onClose(); onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><PlayCircle className="h-5 w-5" /> Start offboarding</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Employee *</Label>
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Template</Label>
            <Select value={form.template_id || "none"} onValueChange={(v) => setForm({ ...form, template_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="No template" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template (blank)</SelectItem>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Termination date *</Label>
            <Input type="date" value={form.termination_date} onChange={(e) => setForm({ ...form, termination_date: e.target.value })} />
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Resigned, terminated, end of contract…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Start</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
