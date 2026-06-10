import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { Target, Plus, Star, TrendingUp, Flag, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/app/performance")({
  head: () => ({ meta: [{ title: "Performance — Paylo" }] }),
  component: PerformancePage,
});

interface Cycle {
  id: string; name: string; period_start: string; period_end: string; due_date: string | null;
  status: string; include_self_review: boolean; include_peer_review: boolean;
}
interface Review { id: string; cycle_id: string; employee_id: string; reviewer_id: string | null; status: string; overall_rating: number | null; review_type: string; }
interface Goal { id: string; employee_id: string; title: string; description: string | null; category: string | null; target_date: string | null; progress_pct: number; status: string; }
interface Employee { id: string; full_name: string; }

const CYCLE_TONE: Record<string,string> = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-700",
};
const GOAL_TONE: Record<string,string> = {
  not_started: "bg-slate-100 text-slate-700",
  on_track: "bg-emerald-100 text-emerald-800",
  at_risk: "bg-amber-100 text-amber-800",
  completed: "bg-sky-100 text-sky-800",
  cancelled: "bg-slate-200 text-slate-600",
};

function PerformancePage() {
  const { currentId } = useCompany();
  const [tab, setTab] = useState("cycles");
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  async function load() {
    if (!currentId) return;
    const [c, r, g, e] = await Promise.all([
      supabase.from("performance_review_cycles").select("*").eq("company_id", currentId).order("period_start", { ascending: false }),
      supabase.from("performance_reviews").select("*").eq("company_id", currentId),
      supabase.from("performance_goals").select("*").eq("company_id", currentId).order("created_at", { ascending: false }),
      supabase.from("employees").select("id, full_name").eq("company_id", currentId).order("full_name"),
    ]);
    setCycles((c.data ?? []) as Cycle[]);
    setReviews((r.data ?? []) as Review[]);
    setGoals((g.data ?? []) as Goal[]);
    setEmployees((e.data ?? []) as Employee[]);
  }
  useEffect(() => { load(); }, [currentId]);

  const stats = useMemo(() => {
    const active = cycles.filter((c) => c.status === "active").length;
    const goalsInProgress = goals.filter((g) => g.status === "on_track" || g.status === "at_risk" || g.status === "not_started").length;
    const rated = reviews.filter((r) => typeof r.overall_rating === "number");
    const avgRating = rated.length ? (rated.reduce((a, r) => a + (r.overall_rating || 0), 0) / rated.length).toFixed(1) : "—";
    const completedReviews = reviews.filter((r) => r.status === "submitted" || r.status === "acknowledged").length;
    return { active, goalsInProgress, avgRating, completedReviews };
  }, [cycles, goals, reviews]);

  async function launchCycle(c: Cycle) {
    if (!currentId) return;
    if (employees.length === 0) { toast.error("Add employees first"); return; }
    const rows = employees.map((e) => ({
      company_id: currentId, cycle_id: c.id, employee_id: e.id, review_type: "manager", status: "not_started" as const,
    }));
    const { error: rErr } = await supabase.from("performance_reviews").insert(rows);
    if (rErr) { toast.error(rErr.message); return; }
    const { error: cErr } = await supabase.from("performance_review_cycles").update({ status: "active" }).eq("id", c.id);
    if (cErr) { toast.error(cErr.message); return; }
    toast.success(`Launched: ${rows.length} reviews created`);
    load();
  }

  async function updateGoal(g: Goal, patch: Partial<Goal>) {
    const { error } = await supabase.from("performance_goals").update(patch as any).eq("id", g.id);
    if (error) { toast.error(error.message); return; }
    setGoals((cur) => cur.map((x) => x.id === g.id ? { ...x, ...patch } : x));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance"
        description="Review cycles, goals, and continuous feedback."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setGoalOpen(true)}><Flag className="mr-1 h-4 w-4" /> Add goal</Button>
            <Button size="sm" onClick={() => setCycleOpen(true)}><Plus className="mr-1 h-4 w-4" /> Review cycle</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active cycles", value: stats.active, icon: Target },
          { label: "Reviews complete", value: stats.completedReviews, icon: CheckCircle2 },
          { label: "Goals in progress", value: stats.goalsInProgress, icon: TrendingUp },
          { label: "Avg rating", value: stats.avgRating, icon: Star },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cycles">Review cycles ({cycles.length})</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
          <TabsTrigger value="goals">Goals ({goals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="cycles">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {cycles.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No review cycles yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface text-xs uppercase tracking-wide text-slate-600">
                  <tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Period</th><th className="px-4 py-3 text-left">Due</th><th className="px-4 py-3 text-left">Includes</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Reviews</th><th className="px-4 py-3"></th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cycles.map((c) => {
                    const cRev = reviews.filter((r) => r.cycle_id === c.id);
                    const done = cRev.filter((r) => r.status === "submitted" || r.status === "acknowledged").length;
                    return (
                      <tr key={c.id} className="hover:bg-surface">
                        <td className="px-4 py-3 font-semibold">{c.name}</td>
                        <td className="px-4 py-3 text-slate-600">{c.period_start} → {c.period_end}</td>
                        <td className="px-4 py-3 text-slate-600">{c.due_date || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <div className="flex flex-wrap gap-1 text-[11px]">
                            <Badge variant="secondary">Manager</Badge>
                            {c.include_self_review && <Badge variant="secondary">Self</Badge>}
                            {c.include_peer_review && <Badge variant="secondary">Peer</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${CYCLE_TONE[c.status]}`}>{c.status}</span></td>
                        <td className="px-4 py-3 text-slate-700">{done}/{cRev.length}</td>
                        <td className="px-4 py-3 text-right">
                          {c.status === "draft" && <Button size="sm" onClick={() => launchCycle(c)}>Launch</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="reviews">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {reviews.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No reviews yet. Launch a cycle to generate manager reviews for every employee.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface text-xs uppercase tracking-wide text-slate-600">
                  <tr><th className="px-4 py-3 text-left">Employee</th><th className="px-4 py-3 text-left">Cycle</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Rating</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reviews.map((r) => {
                    const emp = employees.find((e) => e.id === r.employee_id);
                    const cy = cycles.find((c) => c.id === r.cycle_id);
                    return (
                      <tr key={r.id} className="hover:bg-surface">
                        <td className="px-4 py-3 font-semibold">{emp?.full_name || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{cy?.name || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{r.review_type}</td>
                        <td className="px-4 py-3"><Badge variant="secondary">{r.status.replace("_"," ")}</Badge></td>
                        <td className="px-4 py-3 text-slate-700">{r.overall_rating ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="goals">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {goals.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No goals yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {goals.map((g) => {
                  const emp = employees.find((e) => e.id === g.employee_id);
                  return (
                    <li key={g.id} className="px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{g.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${GOAL_TONE[g.status]}`}>{g.status.replace("_"," ")}</span>
                            {g.category && <Badge variant="secondary">{g.category}</Badge>}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{emp?.full_name || "—"} {g.target_date && `· due ${g.target_date}`}</div>
                          {g.description && <p className="mt-1 text-sm text-slate-600">{g.description}</p>}
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                              <div className="h-full bg-primary transition-all" style={{ width: `${g.progress_pct}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">{g.progress_pct}%</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Select value={g.status} onValueChange={(v) => updateGoal(g, { status: v as any, progress_pct: v === "completed" ? 100 : g.progress_pct })}>
                            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_started">Not started</SelectItem>
                              <SelectItem value="on_track">On track</SelectItem>
                              <SelectItem value="at_risk">At risk</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input type="number" min={0} max={100} className="h-8 w-20 text-xs" value={g.progress_pct}
                            onChange={(e) => updateGoal(g, { progress_pct: Math.max(0, Math.min(100, Number(e.target.value))) })} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <NewCycleDialog open={cycleOpen} onClose={() => setCycleOpen(false)} companyId={currentId} onCreated={load} />
      <NewGoalDialog open={goalOpen} onClose={() => setGoalOpen(false)} companyId={currentId} employees={employees} onCreated={load} />
    </div>
  );
}

function NewCycleDialog({ open, onClose, companyId, onCreated }: { open: boolean; onClose: () => void; companyId: string | null; onCreated: () => void }) {
  const today = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({ name: "", period_start: today, period_end: today, due_date: "", include_self_review: true, include_peer_review: false });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!companyId || !form.name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const { error } = await supabase.from("performance_review_cycles").insert({
      company_id: companyId, name: form.name,
      period_start: form.period_start, period_end: form.period_end,
      due_date: form.due_date || null,
      include_self_review: form.include_self_review, include_peer_review: form.include_peer_review,
      status: "draft",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cycle created");
    onClose(); onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New review cycle</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q4 2026 Reviews" /></div>
          <div><Label>Period start</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
          <div><Label>Period end</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
          <div className="col-span-2"><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <label className="flex items-center gap-2 col-span-2 text-sm"><input type="checkbox" checked={form.include_self_review} onChange={(e) => setForm({ ...form, include_self_review: e.target.checked })} /> Include self-review</label>
          <label className="flex items-center gap-2 col-span-2 text-sm"><input type="checkbox" checked={form.include_peer_review} onChange={(e) => setForm({ ...form, include_peer_review: e.target.checked })} /> Include peer review</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGoalDialog({ open, onClose, companyId, employees, onCreated }: { open: boolean; onClose: () => void; companyId: string | null; employees: Employee[]; onCreated: () => void }) {
  const [form, setForm] = useState({ employee_id: "", title: "", description: "", category: "Performance", target_date: "" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!companyId || !form.employee_id || !form.title.trim()) { toast.error("Employee and title required"); return; }
    setBusy(true);
    const { error } = await supabase.from("performance_goals").insert({
      company_id: companyId, employee_id: form.employee_id, title: form.title,
      description: form.description || null, category: form.category,
      target_date: form.target_date || null,
      status: "not_started", progress_pct: 0,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Goal added");
    setForm({ employee_id: "", title: "", description: "", category: "Performance", target_date: "" });
    onClose(); onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add goal</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Employee *</Label>
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ship Q4 redesign" /></div>
          <div><Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Performance">Performance</SelectItem><SelectItem value="Growth">Growth</SelectItem>
                <SelectItem value="Learning">Learning</SelectItem><SelectItem value="Project">Project</SelectItem>
                <SelectItem value="Leadership">Leadership</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Target date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
          <div className="col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
