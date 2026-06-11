import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeftRight, CheckCircle2, XCircle } from "lucide-react";
import { decideSwap } from "@/lib/scheduling.functions";

export const Route = createFileRoute("/app/shift-swaps")({
  head: () => ({ meta: [{ title: "Shift Swaps — Paylo" }] }),
  component: ShiftSwapsPage,
});

interface SwapRow {
  id: string; company_id: string; shift_id: string; request_type: "drop" | "swap";
  status: "pending" | "approved" | "denied" | "cancelled";
  requested_by_employee_id: string; target_employee_id: string | null;
  reason: string | null; decision_notes: string | null; created_at: string; decided_at: string | null;
}
interface ShiftRow { id: string; start_at: string; end_at: string; role: string | null; location: string | null; }
interface EmpRow { id: string; full_name: string; }

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ShiftSwapsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [rows, setRows] = useState<SwapRow[]>([]);
  const [shifts, setShifts] = useState<Record<string, ShiftRow>>({});
  const [emps, setEmps] = useState<Record<string, string>>({});
  const [declineFor, setDeclineFor] = useState<SwapRow | null>(null);
  const [notes, setNotes] = useState("");
  const decide = useServerFn(decideSwap);

  async function load() {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id; if (!uid) return;
    const { data: cu } = await supabase.from("company_users").select("company_id").eq("user_id", uid).eq("is_default", true).maybeSingle();
    const cid = cu?.company_id; if (!cid) return;
    setCompanyId(cid);
    const { data: swaps } = await supabase.from("shift_swap_requests").select("*")
      .eq("company_id", cid).order("created_at", { ascending: false }).limit(200);
    const list = (swaps ?? []) as SwapRow[]; setRows(list);
    const shiftIds = Array.from(new Set(list.map((r) => r.shift_id)));
    const empIds = Array.from(new Set(list.flatMap((r) => [r.requested_by_employee_id, r.target_employee_id]).filter(Boolean) as string[]));
    if (shiftIds.length) {
      const { data: sh } = await supabase.from("shifts").select("id,start_at,end_at,role,location").in("id", shiftIds);
      setShifts(Object.fromEntries((sh ?? []).map((s: any) => [s.id, s])));
    }
    if (empIds.length) {
      const { data: e } = await supabase.from("employees").select("id,full_name").in("id", empIds);
      setEmps(Object.fromEntries((e ?? []).map((x: any) => [x.id, x.full_name])));
    }
  }
  useEffect(() => { load(); }, []);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const history = useMemo(() => rows.filter((r) => r.status !== "pending"), [rows]);

  async function handleApprove(id: string) {
    try { await decide({ data: { swapId: id, decision: "approved" } }); toast.success("Swap approved"); load(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function handleDecline() {
    if (!declineFor) return;
    try {
      await decide({ data: { swapId: declineFor.id, decision: "denied", notes: notes || undefined } });
      toast.success("Swap denied"); setDeclineFor(null); setNotes(""); load();
    } catch (e: any) { toast.error(e.message); }
  }

  function Row({ r }: { r: SwapRow }) {
    const sh = shifts[r.shift_id];
    const req = emps[r.requested_by_employee_id] || "Employee";
    const tgt = r.target_employee_id ? emps[r.target_employee_id] : null;
    return (
      <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ArrowLeftRight className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="font-semibold text-slate-900">
              {req} <span className="text-slate-500">→</span>{" "}
              {r.request_type === "drop" ? <span className="text-slate-700">drop shift</span> : <>swap with <span className="text-slate-900">{tgt || "—"}</span></>}
            </div>
            <div className="text-xs text-slate-500">
              {sh ? `${fmtDt(sh.start_at)} – ${new Date(sh.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Shift"}
              {sh?.role || sh?.location ? ` · ${[sh?.role, sh?.location].filter(Boolean).join(" · ")}` : ""}
            </div>
            {r.reason && <div className="mt-1 text-xs text-slate-600">Reason: {r.reason}</div>}
            {r.decision_notes && <div className="mt-1 text-xs text-slate-500">Note: {r.decision_notes}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={r.status === "approved" ? "default" : r.status === "denied" ? "destructive" : r.status === "cancelled" ? "secondary" : "outline"}>
            {r.status}
          </Badge>
          {r.status === "pending" && (
            <>
              <Button size="sm" onClick={() => handleApprove(r.id)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve</Button>
              <Button size="sm" variant="outline" onClick={() => { setDeclineFor(r); setNotes(""); }}><XCircle className="mr-1 h-3.5 w-3.5" />Decline</Button>
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-6 unit-in">
      <div>
        <h1 className="font-display text-[32px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">Shift Swaps</h1>
        <p className="mt-2 text-base text-slate-600">Review and approve shift drops and swaps between employees.</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            {pending.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No pending swap requests.</div>
            ) : (
              <ul className="divide-y divide-border">{pending.map((r) => <Row key={r.id} r={r} />)}</ul>
            )}
          </div>
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            {history.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No decided requests yet.</div>
            ) : (
              <ul className="divide-y divide-border">{history.map((r) => <Row key={r.id} r={r} />)}</ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!declineFor} onOpenChange={(v) => !v && setDeclineFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decline swap request</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Let the employee know why…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDecline}>Decline request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
