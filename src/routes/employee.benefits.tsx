import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { HeartHandshake } from "lucide-react";

export const Route = createFileRoute("/employee/benefits")({
  head: () => ({ meta: [{ title: "My benefits — Paylo" }] }),
  component: Page,
});

interface Enrollment {
  id: string; status: string; coverage_tier: string | null;
  employee_contribution: number | null; effective_date: string | null;
  benefit_plans: { name: string; plan_type: string | null } | null;
}

function Page() {
  const { employee, loading } = useMyEmployee();
  const [items, setItems] = useState<Enrollment[]>([]);

  useEffect(() => {
    if (!employee) return;
    (async () => {
      const { data } = await supabase
        .from("benefit_enrollments")
        .select("id, status, coverage_tier, employee_contribution, effective_date, benefit_plans(name, plan_type)")
        .eq("employee_id", employee.id);
      setItems((data ?? []) as unknown as Enrollment[]);
    })();
  }, [employee?.id]);

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My benefits</h1>
        <p className="text-sm text-muted-foreground">Your current enrollments. Contact HR to make changes.</p>
      </div>
      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-3 text-sm font-medium">
          <HeartHandshake className="h-4 w-4" /> {items.length} enrolled plan{items.length === 1 ? "" : "s"}
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
                  {e.employee_contribution != null && (
                    <div className="font-semibold">${Number(e.employee_contribution).toFixed(2)}/period</div>
                  )}
                  {e.effective_date && <div className="text-xs text-muted-foreground">Eff. {e.effective_date}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
