import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { MessageSquare, Plus, CheckCircle2, XCircle, Clock as ClockIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/requests")({
  head: () => ({ meta: [{ title: "Requests — Paylo" }] }),
  component: EmployeeRequestsPage,
});

const TYPES = [
  ["question", "Question"],
  ["equipment", "Equipment / Supplies"],
  ["schedule_change", "Schedule change"],
  ["hr", "HR / Personal"],
  ["it_support", "IT support"],
  ["other", "Other"],
] as const;

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

interface Row {
  id: string;
  request_type: string;
  subject: string;
  details: string | null;
  priority: string;
  status: string;
  response: string | null;
  submitted_at: string;
}

function priorityColor(p: string) {
  if (p === "urgent") return "bg-rose-50 text-rose-700";
  if (p === "high") return "bg-amber-50 text-amber-700";
  if (p === "low") return "bg-slate-100 text-slate-600";
  return "bg-sky-50 text-sky-700";
}

function EmployeeRequestsPage() {
  const { employee } = useMyEmployee();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    request_type: "question",
    subject: "",
    details: "",
    priority: "normal",
  });

  async function load() {
    if (!employee) return;
    const { data } = await supabase
      .from("general_requests")
      .select("*")
      .eq("employee_id", employee.id)
      .order("submitted_at", { ascending: false });
    setRows((data ?? []) as any);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [employee?.id]);

  async function submit() {
    if (!employee) return;
    if (!form.subject.trim()) return toast.error("Please add a subject");
    setBusy(true);
    const { error } = await supabase.from("general_requests").insert({
      company_id: employee.company_id,
      employee_id: employee.id,
      request_type: form.request_type,
      subject: form.subject.trim(),
      details: form.details.trim() || null,
      priority: form.priority,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request submitted");
    setOpen(false);
    setForm({ request_type: "question", subject: "", details: "", priority: "normal" });
    load();
  }

  async function cancelRow(id: string) {
    if (!confirm("Cancel this request?")) return;
    const { error } = await supabase.from("general_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cancelled");
    load();
  }

  const statusBadge = (s: string) => {
    if (s === "open") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold"><ClockIcon className="h-3 w-3"/>Open</span>;
    if (s === "resolved") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold"><CheckCircle2 className="h-3 w-3"/>Resolved</span>;
    if (s === "declined") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold"><XCircle className="h-3 w-3"/>Declined</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold capitalize">{s}</span>;
  };

  return (
    <div className="space-y-6 unit-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">
            My Requests
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-500">
            Ask questions or request help from HR, IT, or your manager.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1"/>New request</Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
          <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 font-display text-lg font-bold text-slate-900">No requests yet</div>
          <div className="mt-1 text-sm text-slate-500">Submit a request and we'll get back to you.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-slate-900">{r.subject}</div>
                    {statusBadge(r.status)}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${priorityColor(r.priority)}`}>
                      {r.priority}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                      {r.request_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  {r.details && <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{r.details}</div>}
                  {r.response && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Response from your team</div>
                      {r.response}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-slate-500">
                  {new Date(r.submitted_at).toLocaleDateString()}
                </div>
              </div>
              {r.status === "open" && (
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => cancelRow(r.id)}>Cancel</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <select className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Quick summary" />
            </div>
            <div>
              <Label>Details</Label>
              <Textarea value={form.details} rows={4}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                placeholder="Add any context that helps us respond faster" />
            </div>
            <div>
              <Label>Priority</Label>
              <select className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm capitalize"
                value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
