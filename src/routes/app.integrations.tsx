import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plug, CheckCircle2, Search, ArrowUpRight, Loader2, KeyRound, Trash2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import {
  listProviderIntegrations,
  setProviderApiKey,
  deleteProviderApiKey,
  type ProviderId,
} from "@/lib/provider-integrations.functions";

export const Route = createFileRoute("/app/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Paylo" }] }),
  component: IntegrationsPage,
});

const categories = ["All", "Accounting", "Payroll", "Benefits", "Communication", "Productivity"] as const;
type Category = (typeof categories)[number];

type App = {
  id: ProviderId;
  name: string;
  category: Exclude<Category, "All">;
  desc: string;
  keyLabel: string;
  keyPlaceholder: string;
  helpUrl?: string;
  extraFields?: { key: string; label: string; placeholder: string }[];
};

const apps: App[] = [
  { id: "quickbooks", name: "QuickBooks Online", category: "Accounting", desc: "Sync payroll journals to your general ledger.", keyLabel: "OAuth access token", keyPlaceholder: "eyJhbGciOi…", helpUrl: "https://developer.intuit.com" },
  { id: "xero", name: "Xero", category: "Accounting", desc: "Push payroll entries directly into Xero.", keyLabel: "OAuth access token", keyPlaceholder: "eyJhbGciOi…", helpUrl: "https://developer.xero.com" },
  { id: "plaid", name: "Plaid", category: "Payroll", desc: "Verify bank accounts for direct deposit.", keyLabel: "Plaid secret", keyPlaceholder: "prod-sk-…", helpUrl: "https://dashboard.plaid.com/team/keys", extraFields: [{ key: "client_id", label: "Client ID", placeholder: "5f…" }] },
  { id: "modern_treasury", name: "Modern Treasury", category: "Payroll", desc: "ACH origination and reconciliation.", keyLabel: "API key", keyPlaceholder: "live_…", helpUrl: "https://app.moderntreasury.com/developers/api_keys", extraFields: [{ key: "organization_id", label: "Organization ID", placeholder: "org_…" }] },
  { id: "symmetry", name: "Symmetry", category: "Payroll", desc: "Federal, state, and local tax calculations.", keyLabel: "API key", keyPlaceholder: "sk_live_…", helpUrl: "https://symmetry.com/products/symmetry-tax-engine" },
  { id: "slack", name: "Slack", category: "Communication", desc: "Post payroll, PTO, and onboarding alerts.", keyLabel: "Bot token", keyPlaceholder: "xoxb-…", helpUrl: "https://api.slack.com/apps" },
  { id: "google_workspace", name: "Google Workspace", category: "Productivity", desc: "Provision accounts during onboarding.", keyLabel: "Service account JSON", keyPlaceholder: "{ \"type\": \"service_account\", … }" },
  { id: "guideline_401k", name: "Guideline 401(k)", category: "Benefits", desc: "Sync retirement contributions.", keyLabel: "API key", keyPlaceholder: "guideline_…" },
  { id: "gusto_benefits", name: "Gusto Benefits", category: "Benefits", desc: "Medical, dental, vision enrollment.", keyLabel: "API key", keyPlaceholder: "gusto_…" },
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

type IntegrationRow = {
  provider: string;
  status?: string;
  has_key?: boolean;
  last4?: string | null;
  key_updated_at?: string | null;
};

function ConnectDialog({
  app,
  companyId,
  existing,
  open,
  onOpenChange,
}: {
  app: App | null;
  companyId: string | null;
  existing: IntegrationRow | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const setKey = useServerFn(setProviderApiKey);
  const delKey = useServerFn(deleteProviderApiKey);

  useEffect(() => {
    if (open) {
      setApiKey("");
      setExtras({});
    }
  }, [open, app?.id]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!app || !companyId) throw new Error("Pick a company first.");
      return setKey({
        data: {
          companyId,
          provider: app.id,
          apiKey,
          extraConfig: Object.keys(extras).length ? extras : undefined,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`${app?.name} connected`, { description: `Key ending •••• ${r.last4} stored securely.` });
      qc.invalidateQueries({ queryKey: ["provider-integrations", companyId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Could not save key", { description: e?.message ?? "Try again." }),
  });

  const removeMut = useMutation({
    mutationFn: async () => {
      if (!app || !companyId) throw new Error("Pick a company first.");
      return delKey({ data: { companyId, provider: app.id } });
    },
    onSuccess: () => {
      toast.success(`${app?.name} disconnected`);
      qc.invalidateQueries({ queryKey: ["provider-integrations", companyId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Could not remove key", { description: e?.message ?? "Try again." }),
  });

  if (!app) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" /> Connect {app.name}
          </DialogTitle>
          <DialogDescription>
            Your key is encrypted with AES-256-GCM before it's stored and is never returned to the browser after saving.
            {app.helpUrl && (
              <>
                {" "}
                <a href={app.helpUrl} target="_blank" rel="noreferrer" className="underline">
                  Where do I find this?
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {existing?.has_key && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Current key on file: <span className="font-mono">•••• {existing.last4}</span>
            {existing.key_updated_at && (
              <span className="ml-1 text-emerald-700">
                (updated {new Date(existing.key_updated_at).toLocaleDateString()})
              </span>
            )}
            . Enter a new key below to rotate it.
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="api-key">{app.keyLabel}</Label>
            {app.keyPlaceholder.length > 40 ? (
              <Textarea
                id="api-key"
                rows={4}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={app.keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
            ) : (
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={app.keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </div>
          {app.extraFields?.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`extra-${f.key}`}>{f.label}</Label>
              <Input
                id={`extra-${f.key}`}
                value={extras[f.key] ?? ""}
                onChange={(e) => setExtras((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {existing?.has_key ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => removeMut.mutate()}
              disabled={removeMut.isPending}
            >
              {removeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Disconnect
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || apiKey.trim().length < 8}
              className="bg-primary text-slate-900 hover:bg-primary/90"
            >
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existing?.has_key ? "Rotate key" : "Save & connect"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationsPage() {
  const [active, setActive] = useState<Category>("All");
  const [q, setQ] = useState("");
  const [openApp, setOpenApp] = useState<App | null>(null);
  const { currentId } = useCompany();

  const listFn = useServerFn(listProviderIntegrations);
  const { data } = useQuery({
    queryKey: ["provider-integrations", currentId],
    queryFn: () => listFn({ data: { companyId: currentId! } }),
    enabled: !!currentId,
  });

  const byProvider = useMemo(() => {
    const m = new Map<string, IntegrationRow>();
    for (const r of data?.items ?? []) m.set(r.provider, r as IntegrationRow);
    return m;
  }, [data]);

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

  const connectedCount = apps.filter((a) => byProvider.get(a.id)?.has_key).length;
  const availableCount = apps.length - connectedCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Integrations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Connect Paylo to the tools your business already runs on. Keys are encrypted at rest.
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
        {filtered.map((a) => {
          const row = byProvider.get(a.id);
          const connected = !!row?.has_key;
          return (
            <div
              key={a.id}
              className="group rounded-xl border border-slate-200 bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface font-display text-sm font-bold text-slate-700">
                  {a.name.slice(0, 2)}
                </div>
                {connected ? (
                  <Badge className="bg-success/10 text-success hover:bg-success/10">Connected</Badge>
                ) : (
                  <Badge variant="secondary">Available</Badge>
                )}
              </div>
              <h3 className="mt-3 font-display text-sm font-bold text-slate-900">{a.name}</h3>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">{a.category}</p>
              <p className="mt-2 text-sm text-slate-600">{a.desc}</p>
              {connected && row?.last4 && (
                <p className="mt-1 font-mono text-xs text-slate-500">Key •••• {row.last4}</p>
              )}
              <Button
                variant={connected ? "outline" : "default"}
                size="sm"
                onClick={() => setOpenApp(a)}
                disabled={!currentId}
                className={
                  "mt-4 w-full " +
                  (connected ? "" : "bg-primary text-slate-900 hover:bg-primary/90")
                }
              >
                {connected ? "Manage" : "Connect"}
              </Button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-card p-10 text-center text-sm text-slate-500">
            No integrations match your search.
          </div>
        )}
      </div>

      <ConnectDialog
        app={openApp}
        companyId={currentId}
        existing={openApp ? byProvider.get(openApp.id) : undefined}
        open={!!openApp}
        onOpenChange={(v) => !v && setOpenApp(null)}
      />
    </div>
  );
}
