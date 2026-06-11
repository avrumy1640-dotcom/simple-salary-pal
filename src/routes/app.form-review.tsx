import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ClipboardCheck, CheckCircle2, XCircle, RefreshCw, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { listFormsForReview, approveForm, rejectForm } from "@/lib/form-review.functions";

export const Route = createFileRoute("/app/form-review")({
  head: () => ({ meta: [{ title: "Form Review — Paylo" }] }),
  component: FormReviewPage,
});

type Form = {
  id: string;
  form_type: string;
  status: string;
  data: Record<string, any> | null;
  signed_at: string | null;
  signed_name: string | null;
  tax_year: number | null;
  created_at: string;
  employee_id: string | null;
  employees: { id: string; full_name: string; email: string | null; job_title: string | null; department: string | null } | null;
};

const TYPE_LABELS: Record<string, string> = {
  w4: "Federal W-4",
  state_w4: "State withholding",
  i9: "Form I-9",
  direct_deposit: "Direct deposit",
  address_change: "Address change",
};

function FormReviewPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNotes, setApproveNotes] = useState("");

  const fetchForms = useServerFn(listFormsForReview);
  const callApprove = useServerFn(approveForm);
  const callReject = useServerFn(rejectForm);

  async function load() {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) { setLoading(false); return; }
    const { data: cu } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", uid)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cid = cu?.company_id as string | undefined;
    if (!cid) { setLoading(false); return; }
    setCompanyId(cid);
    try {
      const res = await fetchForms({ data: { company_id: cid, status: tab } });
      setForms((res?.forms ?? []) as Form[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load forms");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const counts = useMemo(() => ({
    total: forms.length,
  }), [forms]);

  async function onApprove() {
    if (!selected) return;
    setBusy(true);
    try {
      await callApprove({ data: { form_id: selected.id, notes: approveNotes || undefined } });
      toast.success("Approved and applied to employee record");
      setSelected(null);
      setApproveNotes("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!selected || !rejectReason.trim()) { toast.error("Reason required"); return; }
    setBusy(true);
    try {
      await callReject({ data: { form_id: selected.id, reason: rejectReason.trim() } });
      toast.success("Rejected");
      setSelected(null);
      setRejectOpen(false);
      setRejectReason("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reject");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Form Review"
        description="Approve or reject employee-submitted tax & employment forms"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold capitalize transition ${
              tab === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-slate-600 hover:bg-surface"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500 self-center">{counts.total} record{counts.total === 1 ? "" : "s"}</span>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : forms.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No forms here"
          description={tab === "pending" ? "All caught up — no employee submissions waiting." : "No records in this view."}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Form</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {forms.map((f) => (
                <tr key={f.id} className="hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{f.employees?.full_name ?? "—"}</div>
                    <div className="text-xs text-slate-500">{f.employees?.job_title ?? ""}{f.employees?.department ? ` · ${f.employees.department}` : ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      {TYPE_LABELS[f.form_type] ?? f.form_type}
                    </div>
                    {f.tax_year && <div className="text-xs text-slate-500">Tax year {f.tax_year}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{new Date(f.created_at).toLocaleDateString()}</div>
                    <div className="text-xs text-slate-500">by {f.signed_name ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        f.status === "approved" || f.status === "signed"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : f.status === "rejected"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }
                    >
                      {f.status === "pending" ? <Clock className="mr-1 h-3 w-3" /> : f.status === "rejected" ? <XCircle className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                      <span className="capitalize">{f.status}</span>
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => { setSelected(f); setApproveNotes(""); }}>
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {TYPE_LABELS[selected.form_type] ?? selected.form_type} — {selected.employees?.full_name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-border bg-surface p-3">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Submitted values</div>
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    {Object.entries(selected.data ?? {})
                      .filter(([k]) => !k.startsWith("_"))
                      .map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <dt className="text-xs text-slate-500 capitalize">{k.replace(/_/g, " ")}</dt>
                          <dd className="truncate font-semibold text-slate-900">{String(v ?? "—")}</dd>
                        </div>
                      ))}
                  </dl>
                  <div className="mt-3 text-xs text-slate-500">
                    Signed by <span className="font-semibold text-slate-700">{selected.signed_name}</span> on{" "}
                    {selected.signed_at ? new Date(selected.signed_at).toLocaleString() : "—"}
                  </div>
                </div>

                {(selected.data as any)?._rejection_reason && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                    <span className="font-bold">Previously rejected:</span> {(selected.data as any)._rejection_reason}
                  </div>
                )}

                {selected.status === "pending" && (
                  <div>
                    <Label>Notes to employee (optional)</Label>
                    <Textarea
                      value={approveNotes}
                      onChange={(e) => setApproveNotes(e.target.value)}
                      placeholder="E.g. effective next pay period."
                      rows={2}
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
                {selected.status === "pending" && (
                  <>
                    <Button variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setRejectOpen(true)}>
                      <XCircle className="mr-1.5 h-4 w-4" /> Reject
                    </Button>
                    <Button onClick={onApprove} disabled={busy}>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> {busy ? "Applying…" : "Approve & apply"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reason for rejection</DialogTitle></DialogHeader>
          <Textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain what needs to be corrected so the employee can resubmit."
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button onClick={onReject} disabled={busy || !rejectReason.trim()}>
              {busy ? "Sending…" : "Send rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
