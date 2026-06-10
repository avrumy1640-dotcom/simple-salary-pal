import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { UserPlus, Search, Briefcase, Users, Calendar, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/recruiting")({
  head: () => ({ meta: [{ title: "Recruiting — Paylo" }] }),
  component: RecruitingPage,
});

const stages = [
  { key: "applied", label: "Applied", count: 0 },
  { key: "screening", label: "Screening", count: 0 },
  { key: "interview", label: "Interview", count: 0 },
  { key: "final", label: "Final", count: 0 },
  { key: "offer", label: "Offer", count: 0 },
  { key: "hired", label: "Hired", count: 0 },
];

function RecruitingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruiting"
        description="Job postings, candidate pipeline, and interview scheduling."
        actions={
          <>
            <Button variant="outline" size="sm">Careers page</Button>
            <Button size="sm" className="gradient-brand text-primary-foreground"><UserPlus className="mr-1 h-4 w-4" />New job</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open positions", value: 0, icon: Briefcase },
          { label: "In pipeline", value: 0, icon: Users },
          { label: "Interviews this week", value: 0, icon: Calendar },
          { label: "Offers sent", value: 0, icon: TrendingUp },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="font-display text-base font-bold text-slate-900">Pipeline</h2>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Search candidates…" className="pl-8" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
          {stages.map((s) => (
            <div key={s.key} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{s.label}</span>
                <Badge variant="secondary">{s.count}</Badge>
              </div>
              <div className="mt-3 grid h-32 place-items-center text-[11px] text-slate-400">No candidates</div>
            </div>
          ))}
        </div>
      </div>

      <EmptyState
        icon={Briefcase}
        title="Post your first job"
        description="Create a job posting and we'll generate a public careers page link you can share."
        action={<Button size="sm" className="gradient-brand text-primary-foreground">Create job posting</Button>}
      />
    </div>
  );
}
