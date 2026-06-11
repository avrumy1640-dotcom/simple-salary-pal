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
    </div>
  );
}
