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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My benefits</h1>
        <p className="text-sm text-muted-foreground">
          {windowOpen ? "Open enrollment is active — you can elect coverage." : "Open enrollment is closed. Contact HR for qualifying-life-event changes."}
        </p>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-3 text-sm font-medium">
          <HeartHandshake className="h-4 w-4" /> {items.length} enrollment{items.length === 1 ? "" : "s"}
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">You're not enrolled in any benefits yet.</div>
        ) : (
          <ul className="divide-y">
            {items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{e.benefit_plans?.name ?? "Plan"}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {e.benefit_plans?.plan_type ?? "—"} · {e.coverage_tier ?? "—"} · {e.status}
                  </div>
                </div>
                <div className="text-right text-sm">
                  {e.employee_monthly_cost != null && (
                    <div className="font-semibold">${Number(e.employee_monthly_cost).toFixed(2)}/mo</div>
                  )}
                  {e.effective_date && <div className="text-xs text-muted-foreground">Eff. {e.effective_date}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {windowOpen && (
        <div className="rounded-2xl border bg-card">
          <div className="border-b px-5 py-3 text-sm font-medium">Available plans</div>
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
