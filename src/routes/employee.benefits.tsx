import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { useServerFn } from "@tanstack/react-start";
import { electBenefit } from "@/lib/benefits.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { HeartHandshake, Plus } from "lucide-react";

export const Route = createFileRoute("/employee/benefits")({
  head: () => ({ meta: [{ title: "My benefits — Paylo" }] }),
  component: Page,
});

interface Enrollment {
  id: string; status: string; coverage_tier: string | null;
  employee_monthly_cost: number | null; effective_date: string | null;
  benefit_plans: { name: string; plan_type: string | null } | null;
}
interface Plan {
  id: string; name: string; plan_type: string;
  monthly_premium_employee: number; monthly_premium_employee_spouse: number;
  monthly_premium_employee_children: number; monthly_premium_family: number;
}

function Page() {
  const { employee, loading } = useMyEmployee();
  const [items, setItems] = useState<Enrollment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [windowOpen, setWindowOpen] = useState(false);
  const [dlg, setDlg] = useState<Plan | null>(null);
  const [tier, setTier] = useState<"employee" | "employee_spouse" | "employee_children" | "family">("employee");
  const [signedName, setSignedName] = useState("");
  const [busy, setBusy] = useState(false);
  const elect = useServerFn(electBenefit);

  async function load() {
    if (!employee) return;
    const [{ data: e }, { data: p }, { data: w }] = await Promise.all([
      supabase
        .from("benefit_enrollments")
        .select("id, status, coverage_tier, employee_monthly_cost, effective_date, benefit_plans(name, plan_type)")
        .eq("employee_id", employee.id),
      supabase
        .from("benefit_plans")
        .select("id, name, plan_type, monthly_premium_employee, monthly_premium_employee_spouse, monthly_premium_employee_children, monthly_premium_family")
        .eq("company_id", employee.company_id)
        .eq("is_active", true),
      supabase
        .from("open_enrollment_windows")
        .select("starts_at, ends_at, is_active")
        .eq("company_id", employee.company_id)
        .eq("is_active", true),
    ]);
    setItems((e ?? []) as unknown as Enrollment[]);
    setPlans((p ?? []) as Plan[]);
    const now = Date.now();
    const inWindow = (w ?? []).some((x: any) => new Date(x.starts_at).getTime() <= now && new Date(x.ends_at).getTime() >= now);
    const withinHire = employee.start_date && (Date.now() - new Date(employee.start_date).getTime()) <= 30 * 24 * 3600 * 1000;
    setWindowOpen(Boolean(inWindow || withinHire));
  }

  useEffect(() => { load(); }, [employee?.id]);

  async function submit() {
    if (!employee || !dlg || !signedName.trim()) return;
    setBusy(true);
    try {
      await elect({
        data: {
          company_id: employee.company_id,
          plan_id: dlg.id,
          employee_id: employee.id,
          coverage_tier: tier,
          effective_date: new Date().toISOString().slice(0, 10),
          signed_name: signedName.trim(),
          user_agent: navigator.userAgent.slice(0, 200),
        },
      });
      toast.success("Election submitted — pending HR review");
      setDlg(null); setSignedName("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Could not enroll");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  const enrolledPlanIds = new Set(items.filter(i => i.status === "active" || i.status === "pending").map(i => (i as any).benefit_plans?.name));

  const activeEnrollments = items.filter(i => i.status === "active" || i.status === "pending");
  const totalMonthly = activeEnrollments.reduce((s, i) => s + Number(i.employee_monthly_cost ?? 0), 0);
  const perPaycheck = totalMonthly / 2;

  const PLAN_TONE: Record<string, string> = {
    medical: "bg-rose-50 text-rose-700",
    dental: "bg-sky-50 text-sky-700",
    vision: "bg-violet-50 text-violet-700",
    life: "bg-amber-50 text-amber-700",
    disability: "bg-emerald-50 text-emerald-700",
  };

  return (
    <div className="space-y-8 unit-in">
      <div>
        <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">Benefits</h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">Here's what you're enrolled in and what it costs you each paycheck.</p>
      </div>

      {/* Open enrollment banner */}
      {windowOpen && (
        <div className="rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/60 p-5 sm:p-6 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">Open enrollment is active</div>
              <div className="mt-1 font-display text-lg font-bold text-slate-900">Review and update your benefits</div>
              <p className="mt-1 text-sm text-slate-700">Make your elections now — changes take effect on the next pay period.</p>
            </div>
            <Button className="h-12 sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold" onClick={() => document.getElementById("available-plans")?.scrollIntoView({ behavior: "smooth" })}>
              Update my benefits
            </Button>
          </div>
        </div>
      )}

      {/* Enrolled cards */}
      <div>
        <h2 className="font-display text-lg font-bold text-slate-900">Your enrollments</h2>
        {activeEnrollments.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-slate-500">
            You're not enrolled in any benefits yet.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {activeEnrollments.map((e) => {
              const type = e.benefit_plans?.plan_type ?? "medical";
              const tone = PLAN_TONE[type] ?? "bg-slate-100 text-slate-700";
              return (
                <div key={e.id} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
                  <div className="flex items-center justify-between">
                    <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>
                      <HeartHandshake className="h-5 w-5" />
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${e.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {e.status}
                    </span>
                  </div>
                  <div className="mt-3 font-display text-base font-bold text-slate-900">{e.benefit_plans?.name ?? "Plan"}</div>
                  <div className="text-xs capitalize text-slate-500">{type} · {e.coverage_tier ?? "employee"}</div>
                  {e.employee_monthly_cost != null && (
                    <div className="mt-4">
                      <div className="font-display text-2xl font-extrabold tabular text-primary">${Number(e.employee_monthly_cost).toFixed(2)}</div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-400">per month</div>
                    </div>
                  )}
                  {e.effective_date && <div className="mt-2 text-xs text-slate-500">Effective {e.effective_date}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Totals summary */}
      {activeEnrollments.length > 0 && (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-slate-500 font-semibold">Your total benefits deductions</div>
              <div className="mt-1 font-display text-4xl font-extrabold tabular text-slate-900">${totalMonthly.toFixed(2)}</div>
              <div className="text-sm text-slate-500">per month · about ${perPaycheck.toFixed(2)} per paycheck</div>
            </div>
          </div>
          <div className="mt-5 divide-y divide-border rounded-2xl border border-border bg-surface">
            {activeEnrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-700">{e.benefit_plans?.name ?? "Plan"} <span className="text-slate-400 capitalize">· {e.benefit_plans?.plan_type ?? "—"}</span></span>
                <span className="font-bold tabular text-slate-900">${Number(e.employee_monthly_cost ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}


      {windowOpen && (
        <div className="rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-slate-700">Available plans</div>
          {plans.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No active plans configured.</div>
          ) : (
            <ul className="divide-y">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {p.plan_type} · EE ${Number(p.monthly_premium_employee).toFixed(2)} · Family ${Number(p.monthly_premium_family).toFixed(2)}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={enrolledPlanIds.has(p.name)} onClick={() => { setDlg(p); setTier("employee"); }}>
                    <Plus className="h-3 w-3 mr-1" /> Elect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Elect {dlg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Coverage tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee only (${Number(dlg?.monthly_premium_employee ?? 0).toFixed(2)})</SelectItem>
                  <SelectItem value="employee_spouse">Employee + spouse (${Number(dlg?.monthly_premium_employee_spouse ?? 0).toFixed(2)})</SelectItem>
                  <SelectItem value="employee_children">Employee + children (${Number(dlg?.monthly_premium_employee_children ?? 0).toFixed(2)})</SelectItem>
                  <SelectItem value="family">Family (${Number(dlg?.monthly_premium_family ?? 0).toFixed(2)})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type your full legal name as signature</Label>
              <Input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder="Jane A. Doe" />
            </div>
            <p className="text-xs text-muted-foreground">
              By signing, you authorize the corresponding payroll deduction per pay period and agree this electronic action is your legal signature under ESIGN/UETA.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !signedName.trim()}>Submit election</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
