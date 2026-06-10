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
import { UserPlus, Search, Briefcase, Users, Calendar, TrendingUp, Star, Mail, Phone, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/app/recruiting")({
  head: () => ({ meta: [{ title: "Recruiting — Paylo" }] }),
  component: RecruitingPage,
});

const STAGES = [
  { key: "applied", label: "Applied" },
  { key: "screening", label: "Screening" },
  { key: "interview", label: "Interview" },
  { key: "final", label: "Final" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
] as const;

const STATUS_TONES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  open: "bg-emerald-100 text-emerald-800",
  on_hold: "bg-amber-100 text-amber-800",
  closed: "bg-slate-200 text-slate-700",
  filled: "bg-sky-100 text-sky-800",
};

interface Job {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  status: string;
  description: string | null;
  requirements: string | null;
  opened_at: string | null;
  created_at: string;
}

interface Candidate {
  id: string;
  job_posting_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  current_stage: string;
  rating: number | null;
  applied_at: string;
}

interface Interview {
  id: string;
  candidate_id: string;
  round: number;
  scheduled_at: string;
  mode: string;
  status: string;
}

function RecruitingPage() {
  const { currentId } = useCompany();
  const [tab, setTab] = useState("pipeline");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newCandOpen, setNewCandOpen] = useState(false);

  async function load() {
    if (!currentId) return;
    const [j, c, i] = await Promise.all([
      supabase.from("job_postings").select("*").eq("company_id", currentId).order("created_at", { ascending: false }),
      supabase.from("candidates").select("*").eq("company_id", currentId).order("applied_at", { ascending: false }),
      supabase.from("interviews").select("*").eq("company_id", currentId).gte("scheduled_at", new Date(Date.now() - 7*864e5).toISOString()),
    ]);
    setJobs((j.data ?? []) as Job[]);
    setCandidates((c.data ?? []) as Candidate[]);
    setInterviews((i.data ?? []) as Interview[]);
  }

  useEffect(() => { load(); }, [currentId]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (jobFilter !== "all" && c.job_posting_id !== jobFilter) return false;
      if (!q) return true;
      return `${c.first_name} ${c.last_name} ${c.email ?? ""}`.toLowerCase().includes(q);
    });
  }, [candidates, search, jobFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of STAGES) map[s.key] = 0;
    for (const c of filteredCandidates) if (map[c.current_stage] !== undefined) map[c.current_stage]++;
    return map;
  }, [filteredCandidates]);

  const upcoming = useMemo(() =>
    interviews.filter((i) => new Date(i.scheduled_at) >= new Date() && i.status === "scheduled")
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
    [interviews]
  );

  const stats = {
    openJobs: jobs.filter((j) => j.status === "open").length,
    inPipeline: candidates.filter((c) => !["hired","rejected","withdrawn"].includes(c.current_stage)).length,
    interviewsWeek: upcoming.filter((i) => +new Date(i.scheduled_at) <= Date.now() + 7*864e5).length,
    offers: candidates.filter((c) => c.current_stage === "offer").length,
  };

  async function moveStage(c: Candidate, stage: string) {
    const { error } = await supabase.from("candidates").update({ current_stage: stage as any }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    setCandidates((cur) => cur.map((x) => x.id === c.id ? { ...x, current_stage: stage } : x));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruiting"
        description="Job postings, candidate pipeline, interviews, and offers."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setNewCandOpen(true)}>
              <UserPlus className="mr-1 h-4 w-4" /> Add candidate
            </Button>
            <Button size="sm" onClick={() => setNewJobOpen(true)}>
              <Briefcase className="mr-1 h-4 w-4" /> New job
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open positions", value: stats.openJobs, icon: Briefcase },
          { label: "In pipeline", value: stats.inPipeline, icon: Users },
          { label: "Interviews next 7d", value: stats.interviewsWeek, icon: Calendar },
          { label: "Active offers", value: stats.offers, icon: TrendingUp },
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
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search candidates…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All jobs</SelectItem>
                {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {STAGES.map((s) => {
              const list = filteredCandidates.filter((c) => c.current_stage === s.key);
              return (
                <div key={s.key} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{s.label}</span>
                    <Badge variant="secondary">{counts[s.key] ?? 0}</Badge>
                  </div>
                  <div className="mt-3 space-y-2 min-h-[120px]">
                    {list.length === 0 ? (
                      <div className="grid h-24 place-items-center text-[11px] text-slate-400">—</div>
                    ) : list.map((c) => (
                      <div key={c.id} className="rounded-md border border-border bg-card p-2 text-xs shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{c.first_name} {c.last_name}</span>
                          {c.rating && <span className="inline-flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" />{c.rating}</span>}
                        </div>
                        {c.email && <div className="mt-1 truncate text-slate-500">{c.email}</div>}
                        <Select value={c.current_stage} onValueChange={(v) => moveStage(c, v)}>
                          <SelectTrigger className="mt-2 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STAGES.map((st) => <SelectItem key={st.key} value={st.key}>{st.label}</SelectItem>)}
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="withdrawn">Withdrawn</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {jobs.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No jobs yet. Click <strong>New job</strong> to post your first role.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface text-xs uppercase tracking-wide text-slate-600">
                  <tr><th className="px-4 py-3 text-left">Title</th><th className="px-4 py-3 text-left">Department</th><th className="px-4 py-3 text-left">Location</th><th className="px-4 py-3 text-left">Salary</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Candidates</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobs.map((j) => {
                    const cs = candidates.filter((c) => c.job_posting_id === j.id).length;
                    return (
                      <tr key={j.id} className="hover:bg-surface">
                        <td className="px-4 py-3 font-semibold text-slate-900">{j.title}</td>
                        <td className="px-4 py-3 text-slate-600">{j.department || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{j.location || "Remote"}</td>
                        <td className="px-4 py-3 text-slate-600">{j.salary_min && j.salary_max ? `$${j.salary_min.toLocaleString()}–$${j.salary_max.toLocaleString()}` : "—"}</td>
                        <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONES[j.status]}`}>{j.status.replace("_"," ")}</span></td>
                        <td className="px-4 py-3 text-slate-700">{cs}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="interviews">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {upcoming.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No upcoming interviews scheduled.</div>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((iv) => {
                  const cand = candidates.find((c) => c.id === iv.candidate_id);
                  return (
                    <li key={iv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <div className="font-semibold text-slate-900">{cand ? `${cand.first_name} ${cand.last_name}` : "Candidate"}</div>
                        <div className="text-xs text-slate-500">Round {iv.round} · {iv.mode} · {new Date(iv.scheduled_at).toLocaleString()}</div>
                      </div>
                      <Badge variant="secondary">{iv.status}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <NewJobDialog open={newJobOpen} onClose={() => setNewJobOpen(false)} companyId={currentId} onCreated={load} />
      <NewCandidateDialog open={newCandOpen} onClose={() => setNewCandOpen(false)} companyId={currentId} jobs={jobs} onCreated={load} />
    </div>
  );
}

function NewJobDialog({ open, onClose, companyId, onCreated }: { open: boolean; onClose: () => void; companyId: string | null; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", department: "", location: "", employment_type: "full_time", salary_min: "", salary_max: "", description: "", requirements: "", status: "open" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!companyId || !form.title.trim()) { toast.error("Title is required"); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2,6);
    const { error } = await supabase.from("job_postings").insert({
      company_id: companyId, created_by: user?.id, title: form.title, department: form.department || null,
      location: form.location || null, employment_type: form.employment_type,
      salary_min: form.salary_min ? Number(form.salary_min) : null, salary_max: form.salary_max ? Number(form.salary_max) : null,
      description: form.description || null, requirements: form.requirements || null,
      status: form.status as any, public_slug: slug, opened_at: form.status === "open" ? new Date().toISOString() : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Job posted");
    setForm({ title: "", department: "", location: "", employment_type: "full_time", salary_min: "", salary_max: "", description: "", requirements: "", status: "open" });
    onClose(); onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New job posting</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Senior Software Engineer" /></div>
          <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Engineering" /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Remote / NYC" /></div>
          <div><Label>Type</Label>
            <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full-time</SelectItem><SelectItem value="part_time">Part-time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem><SelectItem value="intern">Internship</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem><SelectItem value="open">Open</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem><SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Salary min ($)</Label><Input type="number" value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} /></div>
          <div><Label>Salary max ($)</Label><Input type="number" value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} /></div>
          <div className="col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="col-span-2"><Label>Requirements</Label><Textarea rows={3} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewCandidateDialog({ open, onClose, companyId, jobs, onCreated }: { open: boolean; onClose: () => void; companyId: string | null; jobs: Job[]; onCreated: () => void }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", source: "Direct", job_posting_id: "" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!companyId || !form.first_name.trim() || !form.last_name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    const { error } = await supabase.from("candidates").insert({
      company_id: companyId,
      first_name: form.first_name, last_name: form.last_name,
      email: form.email || null, phone: form.phone || null, source: form.source,
      job_posting_id: form.job_posting_id || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Candidate added");
    setForm({ first_name: "", last_name: "", email: "", phone: "", source: "Direct", job_posting_id: "" });
    onClose(); onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New candidate</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First name *</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last name *</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Source</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Direct">Direct</SelectItem><SelectItem value="LinkedIn">LinkedIn</SelectItem>
                <SelectItem value="Referral">Referral</SelectItem><SelectItem value="Indeed">Indeed</SelectItem>
                <SelectItem value="Careers page">Careers page</SelectItem><SelectItem value="Recruiter">Recruiter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Job</Label>
            <Select value={form.job_posting_id} onValueChange={(v) => setForm({ ...form, job_posting_id: v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
