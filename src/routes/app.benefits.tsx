import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  HeartHandshake, Plus, Heart, Smile, Eye, PiggyBank, Shield, Bike,
  Activity, DollarSign, Users, TrendingUp, Calendar, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/app/benefits")({
  head: () => ({ meta: [{ title: "Benefits — Paylo" }] }),
  component: BenefitsPage,
});

type Plan = {
  id: string;
  name: string;
  plan_type: string;
  carrier: string | null;
  description: string | null;
  monthly_premium_employee: number;
  monthly_premium_employee_spouse: number;
  monthly_premium_employee_children: number;
  monthly_premium_family: number;
  employer_contribution_pct: number;
  employer_contribution_flat: number;
  deductible: number | null;
  out_of_pocket_max: number | null;
  network: string | null;
  is_active: boolean;
};
type Enrollment = {
  id: string;
  plan_id: string;
  employee_id: string;
  coverage_tier: string;
  status: string;
  effective_date: string;
  employee_monthly_cost: number;
  employer_monthly_cost: number;
  dependent_count: number;
  employees?: { full_name: string };
};
type Emp = { id: string; full_name: string };

const PLAN_ICONS: Record<string, any> = {
  medical: Heart,
  dental: Smile,
  vision: Eye,
  retirement_401k: PiggyBank,
  life: Shield,
  disability: Shield,
  hsa: Activity,
  fsa: Activity,
  commuter: Bike,
  wellness: Activity,
  other: HeartHandshake,
};
const PLAN_TYPE_LABELS: Record<string, string> = {
  medical: "Medical",
  dental: "Dental",
  vision: "Vision",
  retirement_401k: "401(k)",
  life: "Life",
  disability: "Disability",
  hsa: "HSA",
  fsa: "FSA",
  commuter: "Commuter",
  wellness: "Wellness",
  other: "Other",
};

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function BenefitsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [tab, setTab] = useState<"catalog" | "enrollments">("catalog");
  const [planOpen, setPlanOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  async function load() {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    const { data: cu } = await supabase.from("company_users").select("company_id").eq("user_id", uid).order("is_default", { ascending: false }).limit(1).maybeSingle();
    const cid = cu?.company_id as string | undefined;
    if (!cid) return;
    setCompanyId(cid);
    const [{ data: p }, { data: e }, { data: emp }] = await Promise.all([
      supabase.from("benefit_plans").select("*").eq("company_id", cid).order("plan_type"),
      supabase.from("benefit_enrollments").select("*, employees(full_name)").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("employees").select("id, full_name").eq("company_id", cid).eq("status", "active").order("full_name"),
    ]);
    setPlans((p as Plan[]) ?? []);
    setEnrollments((e as any) ?? []);
    setEmployees((emp as Emp[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const active = enrollments.filter((e) => e.status === "active");
    const monthlyEmployer = active.reduce((s, e) => s + Number(e.employer_monthly_cost), 0);
    const monthlyEmployee = active.reduce((s, e) => s + Number(e.employee_monthly_cost), 0);
    const enrolledIds = new Set(active.map((e) => e.employee_id));
    return {
      plans: plans.filter((p) => p.is_active).length,
      enrolled: enrolledIds.size,
      monthlyEmployer,
      monthlyEmployee,
      employees: employees.length,
    };
  }, [plans, enrollments, employees]);

  async function deletePlan(p: Plan) {
    if (!confirm(`Delete ${p.name}?`)) return;
    await supabase.from("benefit_plans").delete().eq("id", p.id);
    load();
  }
  async function toggleActive(p: Plan) {
    await supabase.from("benefit_plans").update({ is_active: !p.is_active }).eq("id", p.id);
    load();
  }
  async function terminateEnrollment(e: Enrollment) {
    await supabase.from("benefit_enrollments").update({ status: "terminated", end_date: new Date().toISOString().slice(0, 10) }).eq("id", e.id);
    load();
  }

  const plansByType = useMemo(() => {
    const map: Record<string, Plan[]> = {};
    plans.forEach((p) => { (map[p.plan_type] ||= []).push(p); });
    return map;
  }, [plans]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benefits"
        description="Health, retirement, and lifestyle benefits — manage plans, track enrollments, and forecast costs."
        actions={
          <>
            <Dialog open={planOpen} onOpenChange={(o) => { setPlanOpen(o); if (!o) setEditingPlan(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="mr-1 h-4 w-4" />New plan</Button>
              </DialogTrigger>
              <PlanDialog companyId={companyId} plan={editingPlan} onSaved={() => { setPlanOpen(false); setEditingPlan(null); load(); }} />
            </Dialog>
            <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gradient-brand text-primary-foreground"><Plus className="mr-1 h-4 w-4" />Enroll employee</Button>
              </DialogTrigger>
              <EnrollDialog companyId={companyId} plans={plans.filter((p) => p.is_active)} employees={employees} onSaved={() => { setEnrollOpen(false); load(); }} />
            </Dialog>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Active plans" value={stats.plans} icon={HeartHandshake} tone="default" />
        <Kpi label="Enrolled employees" value={`${stats.enrolled} / ${stats.employees}`} icon={Users} tone="default" />
        <Kpi label="Employer cost / mo" value={fmt(stats.monthlyEmployer)} icon={DollarSign} tone="warning" />
        <Kpi label="Employee cost / mo" value={fmt(stats.monthlyEmployee)} icon={TrendingUp} tone="success" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {(["catalog", "enrollments"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-1.5 text-xs font-semibold rounded-md capitalize",
              tab === t ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-100")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "catalog" && (
        plans.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title="No benefit plans yet"
            description="Add medical, dental, vision, 401(k), and lifestyle plans your team can enroll in."
            action={<Button onClick={() => setPlanOpen(true)} className="gradient-brand text-primary-foreground">Add your first plan</Button>}
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(plansByType).map(([type, list]) => {
              const Icon = PLAN_ICONS[type] ?? HeartHandshake;
              return (
                <section key={type}>
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h2 className="font-display text-sm font-bold uppercase tracking-wider text-slate-700">{PLAN_TYPE_LABELS[type] ?? type}</h2>
                    <span className="text-xs text-slate-400">{list.length} plan{list.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((p) => (
                      <article key={p.id} className={cn(
                        "rounded-xl border bg-card p-5 transition",
                        p.is_active ? "border-border" : "border-dashed border-slate-200 opacity-70"
                      )}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-display text-base font-bold text-slate-900">{p.name}</h3>
                            {p.carrier && <p className="text-xs text-slate-500">{p.carrier}{p.network ? ` • ${p.network}` : ""}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className={p.is_active ? "bg-success/10 text-success" : "bg-slate-100 text-slate-500"}>
                              {p.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                        {p.description && <p className="mt-2 text-xs text-slate-600 line-clamp-2">{p.description}</p>}
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <CostRow label="EE only" value={p.monthly_premium_employee} />
                          <CostRow label="EE + Spouse" value={p.monthly_premium_employee_spouse} />
                          <CostRow label="EE + Children" value={p.monthly_premium_employee_children} />
                          <CostRow label="Family" value={p.monthly_premium_family} />
                        </div>
                        {(p.deductible || p.out_of_pocket_max) && (
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                            {p.deductible !== null && <div>Deductible: <span className="font-semibold text-slate-700">{fmt(Number(p.deductible))}</span></div>}
                            {p.out_of_pocket_max !== null && <div>OOP max: <span className="font-semibold text-slate-700">{fmt(Number(p.out_of_pocket_max))}</span></div>}
                          </div>
                        )}
                        <div className="mt-3 text-xs text-slate-600">
                          Employer covers <span className="font-semibold text-primary">{Number(p.employer_contribution_pct)}%</span>
                          {Number(p.employer_contribution_flat) > 0 && <> + {fmt(Number(p.employer_contribution_flat))}/mo</>}
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingPlan(p); setPlanOpen(true); }}>Edit</Button>
                          <div className="flex items-center gap-3">
                            <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                            <Button size="sm" variant="ghost" onClick={() => deletePlan(p)}>
                              <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      )}

      {tab === "enrollments" && (
        enrollments.length === 0 ? (
          <EmptyState icon={Users} title="No enrollments yet" description="Enroll employees into benefit plans to track coverage and per-paycheck costs." />
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">EE cost</th>
                  <th className="px-4 py-3 text-right">ER cost</th>
                  <th className="px-4 py-3">Effective</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {enrollments.map((e) => {
                  const plan = plans.find((p) => p.id === e.plan_id);
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{e.employees?.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{plan?.name ?? "—"}<div className="text-xs text-slate-500">{PLAN_TYPE_LABELS[plan?.plan_type ?? ""]}</div></td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{e.coverage_tier.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(Number(e.employee_monthly_cost))}</td>
                      <td className="px-4 py-3 text-right font-mono text-primary">{fmt(Number(e.employer_monthly_cost))}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{format(new Date(e.effective_date), "MMM d, yyyy")}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={cn(
                          e.status === "active" && "bg-success/10 text-success",
                          e.status === "pending" && "bg-warning/15 text-warning",
                          e.status === "waived" && "bg-slate-100 text-slate-500",
                          e.status === "terminated" && "bg-destructive/10 text-destructive",
                        )}>{e.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.status === "active" && (
                          <Button size="sm" variant="ghost" onClick={() => terminateEnrollment(e)}>Terminate</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: any; icon: any; tone: "success" | "warning" | "default" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className={cn("h-4 w-4",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "default" && "text-slate-400")} />
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between rounded-md bg-surface px-2 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-semibold text-slate-900">{fmt(Number(value))}</span>
    </div>
  );
}

function PlanDialog({ companyId, plan, onSaved }: { companyId: string | null; plan: Plan | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    plan_type: plan?.plan_type ?? "medical",
    carrier: plan?.carrier ?? "",
    description: plan?.description ?? "",
    monthly_premium_employee: plan?.monthly_premium_employee ?? 0,
    monthly_premium_employee_spouse: plan?.monthly_premium_employee_spouse ?? 0,
    monthly_premium_employee_children: plan?.monthly_premium_employee_children ?? 0,
    monthly_premium_family: plan?.monthly_premium_family ?? 0,
    employer_contribution_pct: plan?.employer_contribution_pct ?? 80,
    deductible: plan?.deductible ?? 0,
    out_of_pocket_max: plan?.out_of_pocket_max ?? 0,
    network: plan?.network ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name,
        plan_type: plan.plan_type,
        carrier: plan.carrier ?? "",
        description: plan.description ?? "",
        monthly_premium_employee: plan.monthly_premium_employee,
        monthly_premium_employee_spouse: plan.monthly_premium_employee_spouse,
        monthly_premium_employee_children: plan.monthly_premium_employee_children,
        monthly_premium_family: plan.monthly_premium_family,
        employer_contribution_pct: plan.employer_contribution_pct,
        deductible: plan.deductible ?? 0,
        out_of_pocket_max: plan.out_of_pocket_max ?? 0,
        network: plan.network ?? "",
      });
    }
  }, [plan]);

  async function save() {
    if (!companyId || !form.name.trim()) { toast.error("Plan name required"); return; }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      plan_type: form.plan_type as any,
      carrier: form.carrier || null,
      description: form.description || null,
      monthly_premium_employee: form.monthly_premium_employee,
      monthly_premium_employee_spouse: form.monthly_premium_employee_spouse,
      monthly_premium_employee_children: form.monthly_premium_employee_children,
      monthly_premium_family: form.monthly_premium_family,
      employer_contribution_pct: form.employer_contribution_pct,
      deductible: form.deductible || null,
      out_of_pocket_max: form.out_of_pocket_max || null,
      network: form.network || null,
    };
    const { error } = plan
      ? await supabase.from("benefit_plans").update(payload).eq("id", plan.id)
      : await supabase.from("benefit_plans").insert(payload as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(plan ? "Plan updated" : "Plan created");
    onSaved();
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{plan ? "Edit plan" : "New benefit plan"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Plan name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Blue PPO Gold" />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={form.plan_type} onValueChange={(v) => setForm({ ...form, plan_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PLAN_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Carrier</Label>
          <Input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} placeholder="Blue Cross Blue Shield" />
        </div>
        <div>
          <Label>Network</Label>
          <Input value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} placeholder="PPO / HMO" />
        </div>
        <div>
          <Label>Employer contribution %</Label>
          <Input type="number" value={form.employer_contribution_pct} onChange={(e) => setForm({ ...form, employer_contribution_pct: Number(e.target.value) })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </div>
        <div className="sm:col-span-2 mt-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Monthly premiums</div>
        </div>
        {(["employee", "employee_spouse", "employee_children", "family"] as const).map((k) => (
          <div key={k}>
            <Label className="capitalize">{k.replace(/_/g, " + ")}</Label>
            <Input type="number" step="0.01"
              value={(form as any)[`monthly_premium_${k}`]}
              onChange={(e) => setForm({ ...form, [`monthly_premium_${k}`]: Number(e.target.value) } as any)} />
          </div>
        ))}
        <div>
          <Label>Deductible (annual)</Label>
          <Input type="number" value={form.deductible} onChange={(e) => setForm({ ...form, deductible: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Out-of-pocket max</Label>
          <Input type="number" value={form.out_of_pocket_max} onChange={(e) => setForm({ ...form, out_of_pocket_max: Number(e.target.value) })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="gradient-brand text-primary-foreground">
          {plan ? "Save changes" : "Create plan"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EnrollDialog({ companyId, plans, employees, onSaved }: { companyId: string | null; plans: Plan[]; employees: Emp[]; onSaved: () => void }) {
  const [employeeId, setEmployeeId] = useState("");
  const [planId, setPlanId] = useState("");
  const [tier, setTier] = useState("employee");
  const [effective, setEffective] = useState(new Date().toISOString().slice(0, 10));
  const [dependents, setDependents] = useState(0);
  const [saving, setSaving] = useState(false);

  const plan = plans.find((p) => p.id === planId);
  const premium = plan ? Number(
    tier === "employee" ? plan.monthly_premium_employee :
    tier === "employee_spouse" ? plan.monthly_premium_employee_spouse :
    tier === "employee_children" ? plan.monthly_premium_employee_children :
    plan.monthly_premium_family
  ) : 0;
  const empPctShare = plan ? (100 - Number(plan.employer_contribution_pct)) / 100 : 0;
  const erFlat = plan ? Number(plan.employer_contribution_flat) : 0;
  const employerCost = Math.max(0, premium * (Number(plan?.employer_contribution_pct ?? 0) / 100) + erFlat);
  const employeeCost = Math.max(0, premium - employerCost);

  async function save() {
    if (!companyId || !employeeId || !planId) { toast.error("Pick employee and plan"); return; }
    setSaving(true);
    const { error } = await supabase.from("benefit_enrollments").insert({
      company_id: companyId,
      plan_id: planId,
      employee_id: employeeId,
      coverage_tier: tier as any,
      effective_date: effective,
      status: "active",
      employee_monthly_cost: employeeCost,
      employer_monthly_cost: employerCost,
      dependent_count: dependents,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Employee enrolled");
    onSaved();
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Enroll employee in plan</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Employee</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Plan</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
            <SelectContent>
              {plans.map((p) => <SelectItem key={p.id} value={p.id}>{PLAN_TYPE_LABELS[p.plan_type]} — {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Coverage tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee only</SelectItem>
                <SelectItem value="employee_spouse">Employee + Spouse</SelectItem>
                <SelectItem value="employee_children">Employee + Children</SelectItem>
                <SelectItem value="family">Family</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Effective date</Label>
            <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </div>
          <div>
            <Label>Dependents</Label>
            <Input type="number" min={0} value={dependents} onChange={(e) => setDependents(Number(e.target.value))} />
          </div>
        </div>

        {plan && (
          <div className="rounded-lg border border-border bg-surface p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Total premium</span><span className="font-mono font-semibold">{fmt(premium)}/mo</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Employer pays</span><span className="font-mono font-semibold text-primary">{fmt(employerCost)}/mo</span></div>
            <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-slate-700 font-semibold">Employee pays</span><span className="font-mono font-bold text-slate-900">{fmt(employeeCost)}/mo</span></div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="gradient-brand text-primary-foreground">Enroll</Button>
      </DialogFooter>
    </DialogContent>
  );
}
