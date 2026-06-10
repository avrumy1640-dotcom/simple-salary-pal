import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck, AlertTriangle, FileBadge, CheckCircle2, Plus, RefreshCw,
  Search, Filter, ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/app/compliance")({
  head: () => ({ meta: [{ title: "Compliance Center — Paylo" }] }),
  component: CompliancePage,
});

type Alert = {
  id: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "dismissed";
  title: string;
  description: string | null;
  due_date: string | null;
  employee_id: string | null;
  created_at: string;
};

type Employee = { id: string; first_name: string; last_name: string; ssn_last4: string | null; status: string; hire_date: string | null };

const ALERT_TYPE_LABELS: Record<string, string> = {
  i9_missing: "Form I-9 missing",
  w4_missing: "Form W-4 missing",
  handbook_unsigned: "Handbook not acknowledged",
  document_expiring: "Document expiring",
  certification_expiring: "Certification expiring",
  tax_filing_due: "Tax filing due",
  license_expiring: "License expiring",
  training_overdue: "Training overdue",
  other: "Other",
};

function CompliancePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tab, setTab] = useState<"overview" | "alerts" | "checklist">("overview");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function load() {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    const { data: cu } = await supabase.from("company_users").select("company_id")
      .eq("user_id", uid).order("is_default", { ascending: false }).limit(1).maybeSingle();
    const cid = cu?.company_id as string | undefined;
    if (!cid) return;
    setCompanyId(cid);

    const [{ data: a }, { data: e }] = await Promise.all([
      supabase.from("compliance_alerts").select("*").eq("company_id", cid).order("severity", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("employees").select("id,first_name,last_name,ssn_last4,status,hire_date").eq("company_id", cid),
    ]);
    setAlerts((a as Alert[]) ?? []);
    setEmployees((e as Employee[]) ?? []);
  }

  useEffect(() => { load(); }, []);

  async function runScan() {
    if (!companyId) return;
    setScanning(true);
    const active = employees.filter((e) => e.status === "active");
    const newAlerts: Array<Omit<Alert, "id" | "created_at"> & { company_id: string }> = [];

    // Existing alerts to avoid duplicates
    const existing = new Set(
      alerts
        .filter((a) => a.status === "open" || a.status === "in_progress")
        .map((a) => `${a.alert_type}:${a.employee_id ?? "-"}`)
    );

    for (const emp of active) {
      const name = `${emp.first_name} ${emp.last_name}`;
      const key = (t: string) => `${t}:${emp.id}`;
      if (!emp.ssn_last4 && !existing.has(key("i9_missing"))) {
        newAlerts.push({
          company_id: companyId,
          alert_type: "i9_missing",
          severity: "high",
          status: "open",
          title: `I-9 verification missing — ${name}`,
          description: "Employment eligibility verification is incomplete.",
          due_date: null,
          employee_id: emp.id,
        });
      }
      if (!emp.ssn_last4 && !existing.has(key("w4_missing"))) {
        newAlerts.push({
          company_id: companyId,
          alert_type: "w4_missing",
          severity: "medium",
          status: "open",
          title: `W-4 withholding form missing — ${name}`,
          description: "Federal tax withholding form not on file.",
          due_date: null,
          employee_id: emp.id,
        });
      }
    }

    if (newAlerts.length === 0) {
      toast.success("Scan complete — no new issues found");
    } else {
      const { error } = await supabase.from("compliance_alerts").insert(newAlerts as any);
      if (error) toast.error(error.message);
      else toast.success(`${newAlerts.length} new alert(s) detected`);
    }
    await load();
    setScanning(false);
  }

  async function setStatus(a: Alert, status: Alert["status"]) {
    const update: any = { status };
    if (status === "resolved") {
      update.resolved_at = new Date().toISOString();
      const { data: sess } = await supabase.auth.getSession();
      update.resolved_by = sess.session?.user.id;
    }
    await supabase.from("compliance_alerts").update(update).eq("id", a.id);
    load();
  }

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [alerts, statusFilter, severityFilter, search]);

  const openAlerts = alerts.filter((a) => a.status === "open" || a.status === "in_progress");
  const critical = openAlerts.filter((a) => a.severity === "critical").length;
  const high = openAlerts.filter((a) => a.severity === "high").length;
  const active = employees.filter((e) => e.status === "active");
  const verified = active.filter((e) => e.ssn_last4).length;
  const score = active.length === 0 ? 100 : Math.round((verified / active.length) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Center"
        description="Real-time monitoring of I-9, W-4, certifications, document expirations, and audit-ready records."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={runScan} disabled={scanning}>
              <RefreshCw className={cn("mr-1 h-4 w-4", scanning && "animate-spin")} />
              {scanning ? "Scanning…" : "Run scan"}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gradient-brand text-primary-foreground">
                  <Plus className="mr-1 h-4 w-4" /> New alert
                </Button>
              </DialogTrigger>
              <NewAlertDialog companyId={companyId} employees={employees} onSaved={() => { setOpen(false); load(); }} />
            </Dialog>
            <Button size="sm" variant="outline">Export audit pack</Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard label="Compliance score" value={`${score}%`} icon={ShieldCheck} tone={score >= 95 ? "success" : score >= 80 ? "warning" : "destructive"} />
        <KpiCard label="Open alerts" value={openAlerts.length} icon={AlertTriangle} tone={openAlerts.length > 0 ? "warning" : "default"} />
        <KpiCard label="Critical / high" value={`${critical} / ${high}`} icon={AlertTriangle} tone={critical > 0 ? "destructive" : "default"} />
        <KpiCard label="Verified employees" value={`${verified} / ${active.length}`} icon={CheckCircle2} tone="success" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {(["overview", "alerts", "checklist"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-1.5 text-xs font-semibold rounded-md capitalize",
              tab === t ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-100")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <SeverityBreakdown alerts={openAlerts} />
          <RecentActivity alerts={alerts.slice(0, 6)} />
        </div>
      )}

      {tab === "alerts" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input className="pl-8 w-64" placeholder="Search alerts…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><Filter className="mr-1 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredAlerts.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No alerts match your filters" description="Run a compliance scan to detect missing forms, expiring documents, and overdue training." />
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Alert</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAlerts.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{a.title}</div>
                        {a.description && <div className="text-xs text-slate-500">{a.description}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}</td>
                      <td className="px-4 py-3"><SeverityBadge sev={a.severity} /></td>
                      <td className="px-4 py-3"><StatusBadge s={a.status} /></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{format(new Date(a.created_at), "MMM d, yyyy")}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {a.status !== "resolved" && (
                            <Button size="sm" variant="ghost" onClick={() => setStatus(a, "resolved")}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-success" /> Resolve
                            </Button>
                          )}
                          {a.status === "open" && (
                            <Button size="sm" variant="ghost" onClick={() => setStatus(a, "in_progress")}>Start</Button>
                          )}
                          {a.status !== "dismissed" && a.status !== "resolved" && (
                            <Button size="sm" variant="ghost" onClick={() => setStatus(a, "dismissed")}>Dismiss</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "checklist" && (
        <ChecklistView active={active.length} verified={verified} alerts={openAlerts} />
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: any; icon: any; tone: "success" | "warning" | "destructive" | "default" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className={cn("h-4 w-4",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive",
          tone === "default" && "text-slate-400")} />
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function SeverityBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    critical: "bg-destructive/15 text-destructive",
    high: "bg-warning/15 text-warning",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-slate-100 text-slate-600",
  };
  return <Badge variant="secondary" className={cn(map[sev], "capitalize hover:" + map[sev])}>{sev}</Badge>;
}
function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    open: "bg-destructive/10 text-destructive",
    in_progress: "bg-info/10 text-info",
    resolved: "bg-success/10 text-success",
    dismissed: "bg-slate-100 text-slate-500",
  };
  return <Badge variant="secondary" className={cn(map[s], "capitalize")}>{s.replace("_", " ")}</Badge>;
}

function SeverityBreakdown({ alerts }: { alerts: Alert[] }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
  alerts.forEach((a) => { counts[a.severity] = (counts[a.severity] ?? 0) + 1; });
  const total = alerts.length || 1;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-display text-base font-bold text-slate-900">Open alerts by severity</h3>
      <div className="mt-4 space-y-3">
        {(["critical", "high", "medium", "low"] as const).map((s) => (
          <div key={s}>
            <div className="flex justify-between text-xs">
              <span className="capitalize text-slate-600">{s}</span>
              <span className="font-semibold text-slate-900">{counts[s] ?? 0}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={cn("h-full",
                s === "critical" && "bg-destructive",
                s === "high" && "bg-warning",
                s === "medium" && "bg-amber-400",
                s === "low" && "bg-slate-400",
              )} style={{ width: `${((counts[s] ?? 0) / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentActivity({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-display text-base font-bold text-slate-900">Recent activity</h3>
      <div className="mt-4 space-y-3">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : alerts.map((a) => (
          <div key={a.id} className="flex items-start gap-3 text-sm">
            <SeverityBadge sev={a.severity} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-800">{a.title}</div>
              <div className="text-xs text-slate-500">{format(new Date(a.created_at), "MMM d • h:mm a")}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistView({ active, verified, alerts }: { active: number; verified: number; alerts: Alert[] }) {
  const i9Missing = alerts.filter((a) => a.alert_type === "i9_missing").length;
  const w4Missing = alerts.filter((a) => a.alert_type === "w4_missing").length;
  const items = [
    { id: "i9", label: "Form I-9 verification", desc: "Employment eligibility for every active employee", count: i9Missing, total: active },
    { id: "w4", label: "Form W-4 collection", desc: "Federal withholding certificates on file", count: w4Missing, total: active },
    { id: "handbook", label: "Handbook acknowledgments", desc: "Employee policy sign-off captured", count: 0, total: active },
    { id: "filings", label: "Quarterly tax filings", desc: "Form 941 / state filings up to date", count: 0, total: 0 },
    { id: "training", label: "Anti-harassment training", desc: "Required where state law applies", count: 0, total: active },
    { id: "minwage", label: "State minimum wage posters", desc: "Required worksite postings", count: 0, total: 0 },
  ];
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h2 className="font-display text-base font-bold text-slate-900">Compliance checklist</h2>
      </div>
      <div className="divide-y divide-border">
        {items.map((it) => {
          const ok = it.count === 0;
          return (
            <div key={it.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={cn("grid h-9 w-9 place-items-center rounded-lg",
                  ok ? "bg-success/10 text-success" : "bg-warning/15 text-warning")}>
                  {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{it.label}</div>
                  <div className="text-xs text-slate-500">{it.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {ok ? (
                  <Badge variant="secondary" className="bg-success/10 text-success hover:bg-success/10">Up to date</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-warning/15 text-warning hover:bg-warning/15">
                    {it.count} pending
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewAlertDialog({ companyId, employees, onSaved }: { companyId: string | null; employees: Employee[]; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("other");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [employeeId, setEmployeeId] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!companyId || !title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("compliance_alerts").insert({
      company_id: companyId,
      title: title.trim(),
      description: description.trim() || null,
      alert_type: type as any,
      severity,
      status: "open",
      employee_id: employeeId === "none" ? null : employeeId,
      due_date: dueDate || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Alert created");
    onSaved();
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>New compliance alert</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Workers comp policy renewal" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ALERT_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v: any) => setSeverity(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Employee (optional)</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="gradient-brand text-primary-foreground">Create alert</Button>
      </DialogFooter>
    </DialogContent>
  );
}
