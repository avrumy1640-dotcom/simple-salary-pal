import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/app/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Paylo" }] }),
  component: IntegrationsPage,
});

const categories = ["All", "Accounting", "Payroll", "Benefits", "Communication", "Productivity"] as const;

const apps = [
  { name: "QuickBooks Online", category: "Accounting", desc: "Sync payroll journals to your general ledger.", status: "available" },
  { name: "Xero", category: "Accounting", desc: "Push payroll entries directly into Xero.", status: "available" },
  { name: "Plaid", category: "Payroll", desc: "Verify bank accounts for direct deposit.", status: "connected" },
  { name: "Modern Treasury", category: "Payroll", desc: "ACH origination and reconciliation.", status: "connected" },
  { name: "Symmetry", category: "Payroll", desc: "Federal, state, and local tax calculations.", status: "connected" },
  { name: "Slack", category: "Communication", desc: "Post payroll, PTO, and onboarding alerts.", status: "available" },
  { name: "Google Workspace", category: "Productivity", desc: "Provision accounts during onboarding.", status: "available" },
  { name: "Guideline 401(k)", category: "Benefits", desc: "Sync retirement contributions.", status: "available" },
  { name: "Gusto Benefits", category: "Benefits", desc: "Medical, dental, vision enrollment.", status: "available" },
];

function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connect Paylo to the tools your business already runs on."
      />

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Button key={c} variant={c === "All" ? "default" : "outline"} size="sm">{c}</Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((a) => (
          <div key={a.name} className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-card">
            <div className="flex items-start justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface font-display text-sm font-bold text-slate-700">
                {a.name.slice(0, 2)}
              </div>
              {a.status === "connected" ? (
                <Badge className="bg-success/10 text-success hover:bg-success/10">Connected</Badge>
              ) : (
                <Badge variant="secondary">Available</Badge>
              )}
            </div>
            <h3 className="mt-3 font-display text-sm font-bold text-slate-900">{a.name}</h3>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{a.category}</p>
            <p className="mt-2 text-sm text-slate-600">{a.desc}</p>
            <Button variant={a.status === "connected" ? "outline" : "default"} size="sm" className="mt-4 w-full">
              {a.status === "connected" ? "Manage" : "Connect"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
