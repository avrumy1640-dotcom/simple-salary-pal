import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Target, Plus, Star, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/performance")({
  head: () => ({ meta: [{ title: "Performance — Paylo" }] }),
  component: PerformancePage,
});

function PerformancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance"
        description="Review cycles, goals, and feedback across your workforce."
        actions={
          <>
            <Button variant="outline" size="sm">Templates</Button>
            <Button size="sm" className="gradient-brand text-primary-foreground"><Plus className="mr-1 h-4 w-4" />Start review cycle</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Active cycles", value: 0, icon: Target },
          { label: "Goals in progress", value: 0, icon: TrendingUp },
          { label: "Avg rating", value: "—", icon: Star },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      <EmptyState
        icon={Target}
        title="No active review cycles"
        description="Launch a quarterly or annual review cycle to collect manager, peer, and self assessments."
        action={<Button size="sm" className="gradient-brand text-primary-foreground">Create review cycle</Button>}
      />
    </div>
  );
}
