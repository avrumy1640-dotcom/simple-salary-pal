import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FolderOpen, FileText, Download, Eye, CheckCircle2, PenSquare, ClipboardList, Clock } from "lucide-react";
import { submitEmployeeForm, listMyForms } from "@/lib/employee-self.functions";

export const Route = createFileRoute("/employee/documents")({
  head: () => ({ meta: [{ title: "My documents — Paylo" }] }),
  component: Page,
});

type EmpForm = {
  id: string;
  form_type: string;
  status: string;
  signed_at: string | null;
  signed_name: string | null;
  tax_year: number | null;
  created_at: string;
};

const FORM_LABELS: Record<string, { title: string; desc: string }> = {
  w4: { title: "Federal W-4", desc: "Adjust federal income tax withholding." },
  state_w4: { title: "State withholding", desc: "Update state income tax withholding." },
  i9: { title: "Form I-9", desc: "Employment eligibility verification." },
  direct_deposit: { title: "Direct deposit change", desc: "Request a change to your direct deposit." },
  address_change: { title: "Address change", desc: "Update your mailing address on file." },
};

interface Doc {
  id: string;
  title: string;
  category: string | null;
  created_at: string;
  storage_path: string | null;
  requires_signature: boolean | null;
  employee_id: string | null;
}

function Page() {
  const { employee, loading } = useMyEmployee();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [signedIds, setSignedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forms, setForms] = useState<EmpForm[]>([]);
  const fetchForms = useServerFn(listMyForms);
  const submitForm = useServerFn(submitEmployeeForm);
  const [formDialog, setFormDialog] = useState<null | keyof typeof FORM_LABELS>(null);
  const [formBusy, setFormBusy] = useState(false);

  async function loadForms() {
    try {
      const res = await fetchForms();
      setForms((res?.forms ?? []) as EmpForm[]);
    } catch { /* noop */ }
  }
  useEffect(() => { if (employee?.id) loadForms(); }, [employee?.id]);

  async function load() {
    if (!employee) return;
    const [{ data }, { data: sigs }] = await Promise.all([
      supabase
        .from("hr_documents")
        .select("id, title, category, created_at, storage_path, requires_signature, employee_id")
        .or(`employee_id.eq.${employee.id},employee_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("hr_document_signatures")
        .select("document_id")
        .eq("signed_by_user_id", employee.user_id ?? ""),
    ]);
    setDocs(((data ?? []) as unknown) as Doc[]);
    setSignedIds(new Set(((sigs ?? []) as any[]).map((s) => s.document_id)));
  }
  useEffect(() => { load(); }, [employee?.id]);
  useRealtimeRefresh(["hr_documents", "hr_document_signatures", "hr_forms"], () => { load(); loadForms(); }, { companyId: employee?.company_id ?? null });

  async function openDoc(d: Doc, action: "view" | "download") {
    if (!d.storage_path) { toast.error("No file attached"); return; }
    setBusyId(d.id);
    const { data, error } = await supabase.storage
      .from("hr-documents")
      .createSignedUrl(d.storage_path, 120, action === "download" ? { download: true } : undefined);
    setBusyId(null);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? "Could not open"); return; }
    if (action === "view") window.open(data.signedUrl, "_blank", "noopener");
    else {
      const a = document.createElement("a");
      a.href = data.signedUrl; a.click();
    }
  }

  async function acknowledge(d: Doc) {
    if (!employee?.user_id) return;
    setBusyId(d.id);
    const { error } = await supabase.from("hr_document_signatures").insert({
      document_id: d.id,
      company_id: employee.company_id,
      user_id: employee.user_id,
      signed_by_user_id: employee.user_id,
      signed_by_name: employee.full_name,
      signed_by_email: (employee as any).email ?? null,
      status: "signed",
      signature_user_agent: navigator.userAgent.slice(0, 200),
      consent_text: `I, ${employee.full_name}, acknowledge that I have read and agree to "${d.title}".`,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Acknowledged");
    setSignedIds((s) => new Set(s).add(d.id));
  }


  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  const toSign = docs.filter((d) => d.requires_signature && !signedIds.has(d.id));
  const rest = docs.filter((d) => !d.requires_signature || signedIds.has(d.id));

  return (
    <div className="space-y-8 unit-in">
      <div>
        <h1 className="font-display text-[32px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">My documents</h1>
        <p className="mt-2 text-base text-slate-600">Handbook, policies, and forms shared with you.</p>
      </div>

      {toSign.length > 0 && (
        <div className="rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/60 shadow-soft">
          <div className="flex items-center gap-2 border-b border-amber-200 px-5 py-3 text-sm font-bold text-amber-900">
            <PenSquare className="h-4 w-4" /> Awaiting your signature ({toSign.length})
          </div>
          <ul className="divide-y divide-amber-200/60">
            {toSign.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{d.title}</div>
                  <div className="text-xs text-slate-600">{d.category ?? "Document"} · shared {new Date(d.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.storage_path && (
                    <Button size="sm" variant="outline" disabled={busyId === d.id} onClick={() => openDoc(d, "view")}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> View
                    </Button>
                  )}
                  <Button size="sm" disabled={busyId === d.id} onClick={() => acknowledge(d)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> I've read & agree
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-semibold text-slate-700">
          <FolderOpen className="h-4 w-4" /> {rest.length} document{rest.length === 1 ? "" : "s"}
        </div>
        {rest.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No documents shared yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {rest.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
                <FileText className="hidden h-4 w-4 text-slate-400 sm:block" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{d.title}</span>
                    {signedIds.has(d.id) && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Signed
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{d.category ?? "Document"} · {new Date(d.created_at).toLocaleDateString()}</div>
                </div>
                {d.storage_path && (
                  <div className="flex gap-2 sm:ml-3">
                    <Button size="sm" variant="outline" disabled={busyId === d.id} onClick={() => openDoc(d, "view")}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> View
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === d.id} onClick={() => openDoc(d, "download")}>
                      <Download className="mr-1 h-3.5 w-3.5" /> Download
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tax & employment forms */}
      <div className="rounded-3xl border border-border bg-card shadow-soft">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4 text-sm font-bold text-slate-800">
          <ClipboardList className="h-4 w-4" /> Tax &amp; employment forms
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {(Object.keys(FORM_LABELS) as Array<keyof typeof FORM_LABELS>).map((key) => {
            const meta = FORM_LABELS[key];
            const latest = forms.find((f) => f.form_type === key);
            return (
              <div key={key} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{meta.title}</div>
                    <div className="text-xs text-slate-500">{meta.desc}</div>
                  </div>
                  {latest && (
                    <Badge
                      variant="outline"
                      className={
                        latest.status === "signed" || latest.status === "approved"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : latest.status === "rejected"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }
                    >
                      {latest.status === "pending" ? <Clock className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {latest.status}
                    </Badge>
                  )}
                </div>
                <Button size="sm" variant="outline" className="self-start" onClick={() => setFormDialog(key)}>
                  <PenSquare className="mr-1.5 h-3.5 w-3.5" />
                  {latest ? "Submit new" : "Fill out"}
                </Button>
              </div>
            );
          })}
        </div>

        {forms.length > 0 && (
          <div className="border-t border-border px-5 py-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Submission history</div>
            <ul className="divide-y divide-border text-sm">
              {forms.slice(0, 10).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-semibold text-slate-900">{FORM_LABELS[f.form_type]?.title ?? f.form_type}</span>
                    <span className="ml-2 text-xs text-slate-500">{new Date(f.created_at).toLocaleString()}</span>
                  </div>
                  <Badge variant="outline" className="capitalize">{f.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <FormDialog
        kind={formDialog}
        onClose={() => setFormDialog(null)}
        busy={formBusy}
        employeeName={employee.full_name}
        onSubmit={async (payload) => {
          setFormBusy(true);
          try {
            await submitForm({ data: payload as any });
            toast.success("Submitted to HR for review");
            setFormDialog(null);
            loadForms();
          } catch (e: any) {
            toast.error(e?.message ?? "Could not submit");
          } finally {
            setFormBusy(false);
          }
        }}
      />
    </div>
  );
}

function FormDialog({
  kind,
  onClose,
  onSubmit,
  busy,
  employeeName,
}: {
  kind: keyof typeof FORM_LABELS | null;
  onClose: () => void;
  onSubmit: (p: { form_type: string; data: Record<string, any>; signed_name: string; tax_year?: number }) => void;
  busy: boolean;
  employeeName: string;
}) {
  const [name, setName] = useState(employeeName);
  const [filingStatus, setFilingStatus] = useState("single");
  const [dependents, setDependents] = useState("0");
  const [extra, setExtra] = useState("0");
  const [notes, setNotes] = useState("");
  useEffect(() => { setName(employeeName); }, [employeeName, kind]);

  if (!kind) return null;
  const meta = FORM_LABELS[kind];
  const isW4 = kind === "w4" || kind === "state_w4";

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{meta.title}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">{meta.desc} Your submission will be reviewed by HR before it takes effect.</p>
        <div className="space-y-3">
          {isW4 && (
            <>
              <div>
                <Label>Filing status</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(["single", "married", "head_of_household"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilingStatus(s)}
                      className={`rounded-xl border-2 p-2.5 text-xs font-semibold capitalize ${filingStatus === s ? "border-primary bg-primary/5" : "border-border bg-card text-slate-600"}`}
                    >
                      {s.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Dependents</Label>
                  <Input className="h-11" inputMode="numeric" value={dependents} onChange={(e) => setDependents(e.target.value.replace(/\D/g, ""))} />
                </div>
                <div>
                  <Label>Extra withholding ($)</Label>
                  <Input className="h-11" inputMode="numeric" value={extra} onChange={(e) => setExtra(e.target.value.replace(/[^\d.]/g, ""))} />
                </div>
              </div>
            </>
          )}
          <div>
            <Label>Notes for HR (optional)</Label>
            <Input className="h-11" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything HR should know" />
          </div>
          <div>
            <Label>Your full legal name (signature)</Label>
            <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1.5 text-xs text-slate-500">
              By typing your name and submitting, you certify the information is accurate under penalty of perjury.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !name.trim()}
            onClick={() =>
              onSubmit({
                form_type: kind,
                signed_name: name.trim(),
                tax_year: isW4 ? new Date().getFullYear() : undefined,
                data: isW4
                  ? { filing_status: filingStatus, dependents: Number(dependents) || 0, extra_withholding: Number(extra) || 0, notes }
                  : { notes },
              })
            }
          >
            {busy ? "Submitting…" : "Submit for review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
