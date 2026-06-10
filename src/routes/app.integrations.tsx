import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plug, CheckCircle2, Search, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/app/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Paylo" }] }),
  component: IntegrationsPage,
});

const categories = ["All", "Accounting", "Payroll", "Benefits", "Communication", "Productivity"] as const;
type Category = (typeof categories)[number];

type App = {
  name: string;
  category: Exclude<Category, "All">;
  desc: string;
  status: "connected" | "available";
};

const apps: App[] = [
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

function SummaryTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-2 text-3xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function IntegrationsPage() {
  const [active, setActive] = useState<Category>("All");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      const matchCat = active === "All" || a.category === active;
      const matchQ =
        !q ||
        a.name.toLowerCase().includes(q.toLowerCase()) ||
        a.desc.toLowerCase().includes(q.toLowerCase());
      return matchCat && matchQ;
    });
  }, [active, q]);

  const connectedCount = apps.filter((a) => a.status === "connected").length;
  const availableCount = apps.length - connectedCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Integrations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Connect Paylo to the tools your business already runs on.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1">
          Browse marketplace <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Total apps" value={apps.length} icon={Plug} />
        <SummaryTile label="Connected" value={connectedCount} icon={CheckCircle2} />
        <SummaryTile label="Available" value={availableCount} icon={Plug} />
        <SummaryTile label="Categories" value={categories.length - 1} icon={Plug} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search integrations…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={c === active ? "default" : "outline"}
                onClick={() => setActive(c)}
                className={c === active ? "bg-primary text-slate-900 hover:bg-primary/90" : ""}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <div
            key={a.name}
            className="group rounded-xl border border-slate-200 bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-sm"
          >
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
            <Button
              variant={a.status === "connected" ? "outline" : "default"}
              size="sm"
              className={
                "mt-4 w-full " +
                (a.status === "connected" ? "" : "bg-primary text-slate-900 hover:bg-primary/90")
              }
            >
              {a.status === "connected" ? "Manage" : "Connect"}
            </Button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-card p-10 text-center text-sm text-slate-500">
            No integrations match your search.
          </div>
        )}
      </div>
    </div>
  );
}
