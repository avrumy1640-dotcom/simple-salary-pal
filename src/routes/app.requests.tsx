import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { MessageSquare, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/requests")({
  head: () => ({ meta: [{ title: "Requests — Paylo" }] }),
  component: GeneralRequestsAdmin,
});

interface Row {
  id: string;
  employee_id: string;
  request_type: string;
  subject: string;
  details: string | null;
  priority: string;
  status: string;
  response: string | null;
  submitted_at: string;
  decided_at: string | null;
  employees?: { full_name: string; job_title: string | null } | null;
}

function priorityColor(p: string) {
  if (p === "urgent") return "bg-rose-50 text-rose-700";
  if (p === "high") return "bg-amber-50 text-amber-700";
  if (p === "low") return "bg-slate-100 text-slate-600";
  return "bg-sky-50 text-sky-700";
}

function GeneralRequestsAdmin() {
  const { currentId: companyId } = useCompany();
  const [tab, setTab] = useState<"open" | "history">("open");
  const [rows, setRows] = useState<Row[]>([]);
  const [respondFor, setRespondFor] = useState<{ row: Row; action: "resolve" | "decline" } | null>(null);
  const [responseText, setResponseText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    const { data } = await supabase
      .from("general_requests")
      .select("*, employees(full_name, job_title)")
      .eq("company_id", companyId)
      .order("submitted_at", { ascending: false });
    setRows((data ?? []) as any);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const list = rows.filter((r) => tab === "open" ? r.status === "open" : r.status !== "open");
  const openCount = rows.filter(r => r.status === "open").length;

  async function submitResponse() {
    if (!respondFor) return;
    const { row, action } = respondFor;
    if (action === "decline" && !responseText.trim()) {
      return toast.error("Please provide a reason");
    }
    setBusy(row.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("general_requests")
      .update({
        status: action === "resolve" ? "resolved" : "declined",
        response: responseText.trim() || null,
        decided_at: new Date().toISOString(),
        decided_by: user?.id ?? null,
      })
      .eq("id", row.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(action === "resolve" ? "Request resolved" : "Request declined");
    setRespondFor(null);
    setResponseText("");
    load();
  }

  return (
    <div className="space-y-6 unit-in">
      <div>
        <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">
          Requests
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">
          Handle general employee questions, equipment needs, and HR requests.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-soft">
        {([
          ["open", `Open${openCount ? ` (${openCount})` : ""}`],
          ["history", "History"],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              tab === t ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
          <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 font-display text-lg font-bold text-slate-900">
            No {tab === "open" ? "open" : "past"} requests
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-slate-900">{r.subject}</div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${priorityColor(r.priority)}`}>
                      {r.priority}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                      {r.request_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {r.employees?.full_name ?? "—"}
                    {r.employees?.job_title && <> • {r.employees.job_title}</>}
                  </div>
                  {r.details && <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{r.details}</div>}
                  {r.response && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Response</div>
                      {r.response}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-slate-500">
                  {new Date(r.submitted_at).toLocaleDateString()}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status === "open" && (
                  <>
                    <Button size="sm" disabled={busy === r.id}
                      onClick={() => { setRespondFor({ row: r, action: "resolve" }); setResponseText(""); }}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Resolve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === r.id}
                      onClick={() => { setRespondFor({ row: r, action: "decline" }); setResponseText(""); }}>
                      <XCircle className="h-4 w-4 mr-1" /> Decline
                    </Button>
                  </>
                )}
                {r.status === "resolved" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    <CheckCircle2 className="h-3 w-3" /> Resolved
                  </span>
                )}
                {r.status === "declined" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold">
                    <XCircle className="h-3 w-3" /> Declined
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!respondFor} onOpenChange={(o) => !o && setRespondFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{respondFor?.action === "resolve" ? "Resolve request" : "Decline request"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{respondFor?.action === "resolve" ? "Response (optional)" : "Reason"}</Label>
            <Textarea value={responseText} onChange={(e) => setResponseText(e.target.value)} rows={3}
              placeholder="Message shown to the employee" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondFor(null)}>Cancel</Button>
            <Button onClick={submitResponse} disabled={!!busy}>
              {respondFor?.action === "resolve" ? "Resolve" : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
