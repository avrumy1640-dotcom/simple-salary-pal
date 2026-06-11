import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, CheckCircle2, Clock, Search, Download } from "lucide-react";

export const Route = createFileRoute("/app/policies")({
  head: () => ({ meta: [{ title: "Policy acknowledgements — Paylo" }] }),
  component: PoliciesPage,
});

interface PolicyDoc {
  id: string;
  title: string;
  category: string | null;
  uploaded_at: string | null;
}
interface EmpRow {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  department: string | null;
  acknowledged_at: string | null;
}

function PoliciesPage() {
  const { currentId } = useCompany();
  const [docs, setDocs] = useState<PolicyDoc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "signed" | "pending">("all");

  async function loadDocs() {
    if (!currentId) return;
    const { data } = await supabase
      .from("hr_documents")
      .select("id, title, category, uploaded_at")
      .eq("company_id", currentId)
      .in("category", ["handbook", "policy"])
      .order("uploaded_at", { ascending: false });
    setDocs((data ?? []) as PolicyDoc[]);
    if (data && data.length > 0 && !selectedDocId) setSelectedDocId(data[0].id);
  }

  async function loadStatus() {
    if (!currentId || !selectedDocId) { setEmployees([]); return; }
    setLoading(true);
    const [{ data: emps }, { data: acks }] = await Promise.all([
      supabase.from("employees")
        .select("id, full_name, email, job_title, department")
        .eq("company_id", currentId)
        .eq("status", "active")
        .order("full_name"),
      supabase.from("handbook_acknowledgments")
        .select("employee_id, acknowledged_at")
        .eq("document_id", selectedDocId),
    ]);
    const ackMap = new Map((acks ?? []).map((a: any) => [a.employee_id, a.acknowledged_at]));
    setEmployees(
      (emps ?? []).map((e: any) => ({ ...e, acknowledged_at: ackMap.get(e.id) ?? null })),
    );
    setLoading(false);
  }

  useEffect(() => { loadDocs(); }, [currentId]);
  useEffect(() => { loadStatus(); }, [currentId, selectedDocId]);

  // Realtime: refresh as employees sign
  useEffect(() => {
    if (!currentId || !selectedDocId) return;
    const ch = supabase
      .channel(`policy-acks-${selectedDocId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "handbook_acknowledgments", filter: `document_id=eq.${selectedDocId}` },
        () => loadStatus())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentId, selectedDocId]);

  async function nudgeEmployee(emp: EmpRow) {
    if (!currentId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: empUser } = await supabase.from("employees").select("user_id").eq("id", emp.id).maybeSingle();
    if (!empUser?.user_id) { toast.error(`${emp.full_name} has no linked account yet.`); return; }
    const doc = docs.find((d) => d.id === selectedDocId);
    const { error } = await supabase.from("notifications").insert({
      company_id: currentId,
      user_id: empUser.user_id,
      kind: "request_answered",
      title: `Please acknowledge: ${doc?.title ?? "policy"}`,
      body: "Your employer has asked you to review and sign this policy.",
      link_path: "/employee/documents",
      entity_type: "hr_documents",
      entity_id: selectedDocId,
    });
    if (error) toast.error(error.message);
    else toast.success(`Reminder sent to ${emp.full_name}.`);
  }

  function exportCsv() {
    if (!employees.length) return;
    const doc = docs.find((d) => d.id === selectedDocId);
    const headers = ["Employee", "Email", "Job title", "Department", "Status", "Acknowledged at"];
    const rows = employees.map((e) => [
      e.full_name, e.email ?? "", e.job_title ?? "", e.department ?? "",
      e.acknowledged_at ? "Signed" : "Pending",
      e.acknowledged_at ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `policy-acks-${(doc?.title || "doc").replace(/\W+/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = employees.filter((e) => {
    if (filter === "signed" && !e.acknowledged_at) return false;
    if (filter === "pending" && e.acknowledged_at) return false;
    if (search && !`${e.full_name} ${e.email ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const signedCount = employees.filter((e) => e.acknowledged_at).length;
  const pendingCount = employees.length - signedCount;
  const pct = employees.length ? Math.round((signedCount / employees.length) * 100) : 0;

  return (
    <div className="space-y-6 unit-scope">
      <section className="unit-in flex flex-wrap items-end justify-between gap-3 border-b unit-hairline pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-[40px]">Policy acknowledgements</h1>
          <p className="mt-1 text-sm text-slate-500">Track who has signed each handbook or policy.</p>
        </div>
      </section>

      {docs.length === 0 ? (
        <div className="surface-glass rounded-2xl p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <div className="font-semibold text-slate-900">No policies uploaded yet</div>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a handbook or policy in <a href="/app/documents" className="text-primary underline">Documents</a> with category set to "handbook" or "policy".
          </p>
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-[1fr_2fr] gap-3">
            <div className="surface-glass rounded-2xl p-5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Policy document</Label>
              <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {docs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}{d.version ? ` · v${d.version}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDocId && (() => {
                const d = docs.find((x) => x.id === selectedDocId);
                return d?.effective_date ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    Effective {new Date(d.effective_date).toLocaleDateString()}
                  </p>
                ) : null;
              })()}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <KpiTile label="Signed" value={String(signedCount)} icon={CheckCircle2} tone="emerald" />
              <KpiTile label="Pending" value={String(pendingCount)} icon={Clock} tone="amber" />
              <KpiTile label="Compliance" value={`${pct}%`} icon={FileText} tone="primary" />
            </div>
          </div>

          <div className="surface-glass rounded-2xl">
            <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border/40">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-1 rounded-lg border p-0.5">
                {(["all", "pending", "signed"] as const).map((f) => (
                  <button key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-slate-900"}`}>
                    {f}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!employees.length} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No employees match this filter.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Employee</th>
                    <th className="px-4 py-2 text-left">Job title</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-t border-border/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{e.full_name}</div>
                        <div className="text-xs text-muted-foreground">{e.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{e.job_title ?? "—"}</td>
                      <td className="px-4 py-3">
                        {e.acknowledged_at ? (
                          <Badge variant="default" className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Signed {new Date(e.acknowledged_at).toLocaleDateString()}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700 border-amber-500/30">
                            <Clock className="h-3 w-3 mr-1" /> Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!e.acknowledged_at && (
                          <Button size="sm" variant="ghost" onClick={() => nudgeEmployee(e)}>
                            Send reminder
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: "emerald" | "amber" | "primary" }) {
  const toneClass = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-primary";
  return (
    <div className="rounded-xl border unit-hairline bg-white p-4 shadow-soft">
      <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] ${toneClass}`}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-2xl font-bold mt-2 tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
