import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useServerFn } from "@tanstack/react-start";
import { listPiiAccessLog } from "@/lib/pii-vault.functions";
import {
  ShieldCheck, Search, Download, Filter, Activity, AlertTriangle,
  CheckCircle2, Clock, User, Database, Eye, Lock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/app/audit")({
  head: () => ({ meta: [{ title: "Audit log — Paylo" }] }),
  component: AuditPage,
});

interface AuditEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  occurred_at: string;
  actor_id: string | null;
  before: any;
  after: any;
}

const SENSITIVE_ACTIONS = new Set([
  "delete", "reverse", "approve", "lock", "unlock", "role_change",
  "export", "tax_filing", "payroll_process",
]);

function AuditPage() {
  const { current, hasRole } = useCompany();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    const since = new Date(Date.now() - rangeDays * 86400000).toISOString();
    (async () => {
      const { data } = await supabase
        .from("audit_events")
        .select("*")
        .eq("company_id", current.company_id)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(1000);
      setEvents((data ?? []) as AuditEvent[]);
      setLoading(false);
    })();
  }, [current?.company_id, rangeDays]);

  const entityTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.entity_type))).sort(),
    [events],
  );
  const actions = useMemo(
    () => Array.from(new Set(events.map((e) => e.action))).sort(),
    [events],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      if (entityFilter !== "all" && e.entity_type !== entityFilter) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (!needle) return true;
      return (
        e.action.toLowerCase().includes(needle) ||
        e.entity_type.toLowerCase().includes(needle) ||
        (e.entity_id ?? "").toLowerCase().includes(needle) ||
        JSON.stringify(e.after ?? {}).toLowerCase().includes(needle) ||
        JSON.stringify(e.before ?? {}).toLowerCase().includes(needle)
      );
    });
  }, [events, q, entityFilter, actionFilter]);

  const stats = useMemo(() => {
    const sensitive = filtered.filter((e) => SENSITIVE_ACTIONS.has(e.action)).length;
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = filtered.filter((e) => e.occurred_at.startsWith(today)).length;
    const actors = new Set(filtered.map((e) => e.actor_id).filter(Boolean)).size;
    return { total: filtered.length, sensitive, todayCount, actors };
  }, [filtered]);

  function exportCsv() {
    const headers = ["Time", "Actor", "Action", "Entity type", "Entity ID"];
    const rows = filtered.map((e) => [
      e.occurred_at, e.actor_id ?? "", e.action, e.entity_type, e.entity_id ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!current) return <div className="p-6 text-sm text-muted-foreground">Loading company…</div>;
  if (!hasRole("owner", "admin", "payroll_admin", "hr_admin")) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You don't have permission to view the audit log.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
            <p className="text-sm text-muted-foreground">
              Immutable trail of every approval, lock, processing, reversal, and PII access — retained for compliance.
            </p>
          </div>
        </div>
        <Button onClick={exportCsv} className="gap-1.5 rounded-full">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </header>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events" className="gap-1.5"><Activity className="h-4 w-4" /> System events</TabsTrigger>
          <TabsTrigger value="pii" className="gap-1.5"><Lock className="h-4 w-4" /> PII access</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Activity} label="Events" value={stats.total} sub={`Last ${rangeDays} days`} />
            <Kpi icon={AlertTriangle} label="Sensitive actions" value={stats.sensitive} sub="Approvals, deletes, reversals" />
            <Kpi icon={Clock} label="Today" value={stats.todayCount} sub="Activity in the last 24h" />
            <Kpi icon={User} label="Distinct actors" value={stats.actors} sub="Unique users" />
          </div>

          <div className="surface-glass rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search action, entity, ID, or payload…"
                className="pl-9"
              />
            </div>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Entity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {entityTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid lg:grid-cols-[1fr_400px] gap-4">
            <div className="surface-glass rounded-2xl overflow-hidden">
              {loading ? (
                <div className="p-8 text-sm text-muted-foreground text-center">Loading audit events…</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  <Filter className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  No events match your filters.
                </div>
              ) : (
                <ul className="divide-y divide-border/50 max-h-[70vh] overflow-y-auto">
                  {filtered.map((e) => {
                    const sensitive = SENSITIVE_ACTIONS.has(e.action);
                    const active = selected?.id === e.id;
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => setSelected(e)}
                          className={`w-full text-left px-5 py-3 hover:bg-muted/40 transition ${active ? "bg-muted/40" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${sensitive ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                                {sensitive ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                {e.action}
                              </span>
                              <span className="text-sm font-medium truncate">{e.entity_type}</span>
                              {e.entity_id && (
                                <span className="text-xs text-muted-foreground font-mono truncate">
                                  #{e.entity_id.slice(0, 8)}
                                </span>
                              )}
                            </div>
                            <time className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(e.occurred_at).toLocaleString()}
                            </time>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <aside className="surface-glass rounded-2xl p-5 h-fit sticky top-4">
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Event detail</div>
                    <h3 className="text-lg font-semibold mt-1 capitalize">{selected.action} · {selected.entity_type}</h3>
                    <time className="text-xs text-muted-foreground">{new Date(selected.occurred_at).toLocaleString()}</time>
                  </div>
                  <DetailRow label="Entity ID" value={selected.entity_id ?? "—"} mono />
                  <DetailRow label="Actor" value={selected.actor_id ?? "system"} mono />
                  {selected.before && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Before</div>
                      <pre className="rounded-lg bg-muted/40 p-3 text-xs overflow-x-auto max-h-48">
                        {JSON.stringify(selected.before, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selected.after && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">After</div>
                      <pre className="rounded-lg bg-muted/40 p-3 text-xs overflow-x-auto max-h-48">
                        {JSON.stringify(selected.after, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Database className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Select an event to view full payload, actor, and change diff.</p>
                </div>
              )}
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="pii" className="mt-4">
          <PiiAccessTab companyId={current.company_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface PiiLogRow {
  id: string;
  actor_id: string | null;
  employee_id: string | null;
  kind: string;
  action: string;
  reason: string | null;
  success: boolean;
  occurred_at: string;
  context: any;
}

function PiiAccessTab({ companyId }: { companyId: string }) {
  const fetchLog = useServerFn(listPiiAccessLog);
  const [rows, setRows] = useState<PiiLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchLog({ data: { companyId, limit: 500 } })
      .then((r: any) => setRows(r.items ?? []))
      .finally(() => setLoading(false));
  }, [companyId]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) =>
      r.kind.toLowerCase().includes(n) ||
      r.action.toLowerCase().includes(n) ||
      (r.reason ?? "").toLowerCase().includes(n) ||
      (r.employee_id ?? "").includes(n),
    );
  }, [rows, q]);

  const reads = filtered.filter((r) => r.action === "read").length;
  const denied = filtered.filter((r) => r.action === "attempt_denied" || !r.success).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Lock} label="PII events" value={filtered.length} sub="All access" />
        <Kpi icon={Eye} label="Reveals" value={reads} sub="Decrypted reads" />
        <Kpi icon={AlertTriangle} label="Denied" value={denied} sub="Failed or blocked" />
        <Kpi icon={User} label="Distinct actors" value={new Set(filtered.map((r) => r.actor_id).filter(Boolean)).size} sub="Unique users" />
      </div>

      <div className="surface-glass rounded-2xl p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search kind, action, reason, employee…" className="pl-9" />
        </div>
      </div>

      <div className="surface-glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground text-center">Loading PII access log…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            No PII access recorded.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="text-left px-4 py-2">Time</th>
                  <th className="text-left px-4 py-2">Action</th>
                  <th className="text-left px-4 py-2">Kind</th>
                  <th className="text-left px-4 py-2">Employee</th>
                  <th className="text-left px-4 py-2">Actor</th>
                  <th className="text-left px-4 py-2">Reason</th>
                  <th className="text-left px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 whitespace-nowrap text-xs">{new Date(r.occurred_at).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        r.action === "read" ? "bg-primary/15 text-primary" :
                        r.action === "write" ? "bg-success/15 text-success" :
                        r.action === "delete" ? "bg-destructive/15 text-destructive" :
                        "bg-warning/15 text-warning"
                      }`}>{r.action}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.kind}</td>
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[120px]">{r.employee_id?.slice(0,8) ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[120px]">{r.actor_id?.slice(0,8) ?? "system"}</td>
                    <td className="px-4 py-2 text-xs max-w-[260px] truncate">{r.reason ?? "—"}</td>
                    <td className="px-4 py-2">
                      {r.success
                        ? <CheckCircle2 className="h-4 w-4 text-success" />
                        : <AlertTriangle className="h-4 w-4 text-destructive" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub: string }) {
  return (
    <div className="surface-glass rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
