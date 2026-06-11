import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { CalendarDays, ArrowLeftRight, X } from "lucide-react";
import { requestSwap, cancelSwap, declineSwapAsTarget } from "@/lib/scheduling.functions";

export const Route = createFileRoute("/employee/schedule")({
  head: () => ({ meta: [{ title: "My schedule — Paylo" }] }),
  component: EmployeeSchedulePage,
});

interface Shift {
  id: string; company_id: string; employee_id: string | null;
  start_at: string; end_at: string;
  role: string | null; location: string | null;
  status: "draft" | "published" | "cancelled";
}
interface Swap {
  id: string; shift_id: string; request_type: "drop" | "swap";
  status: "pending" | "approved" | "denied" | "cancelled";
  target_employee_id: string | null; requested_by_employee_id: string;
  reason: string | null;
  created_at: string; decision_notes: string | null;
}
interface Coworker { id: string; full_name: string; }
interface ShiftLite { id: string; start_at: string; end_at: string; role: string | null; location: string | null; }

function startOfWeek(d: Date) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x; }
function fmt(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function EmployeeSchedulePage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [myEmpId, setMyEmpId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<Shift | null>(null);
  const [incoming, setIncoming] = useState<Swap[]>([]);
  const [incomingShifts, setIncomingShifts] = useState<Record<string, ShiftLite>>({});
  const [incomingNames, setIncomingNames] = useState<Record<string, string>>({});

  const reqSwap = useServerFn(requestSwap);
  const cancel = useServerFn(cancelSwap);
  const declineIncoming = useServerFn(declineSwapAsTarget);

  async function load() {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    const { data: emp } = await supabase.from("employees")
      .select("id, company_id").eq("user_id", uid).maybeSingle();
    if (!emp) return;
    setMyEmpId(emp.id);
    setCompanyId(emp.company_id);

    const horizonStart = startOfWeek(new Date()).toISOString();
    const horizonEnd = new Date(Date.now() + 28 * 86400000).toISOString();

    const [s, sw, cw, inc] = await Promise.all([
      supabase.from("shifts").select("*")
        .eq("company_id", emp.company_id)
        .eq("employee_id", emp.id)
        .eq("status", "published")
        .gte("start_at", horizonStart).lt("start_at", horizonEnd)
        .order("start_at"),
      supabase.from("shift_swap_requests").select("*")
        .eq("requested_by_employee_id", emp.id)
        .order("created_at", { ascending: false }).limit(20),
      supabase.from("employees").select("id, full_name")
        .eq("company_id", emp.company_id).eq("status", "active").neq("id", emp.id)
        .order("full_name"),
      supabase.from("shift_swap_requests").select("*")
        .eq("target_employee_id", emp.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    setShifts((s.data ?? []) as Shift[]);
    setSwaps((sw.data ?? []) as Swap[]);
    setCoworkers((cw.data ?? []) as Coworker[]);
    const incList = (inc.data ?? []) as Swap[];
    setIncoming(incList);
    if (incList.length) {
      const sids = Array.from(new Set(incList.map((x) => x.shift_id)));
      const eids = Array.from(new Set(incList.map((x) => x.requested_by_employee_id)));
      const [sh, en] = await Promise.all([
        supabase.from("shifts").select("id,start_at,end_at,role,location").in("id", sids),
        supabase.from("employees").select("id,full_name").in("id", eids),
      ]);
      setIncomingShifts(Object.fromEntries((sh.data ?? []).map((x: any) => [x.id, x])));
      setIncomingNames(Object.fromEntries((en.data ?? []).map((x: any) => [x.id, x.full_name])));
    } else {
      setIncomingShifts({}); setIncomingNames({});
    }
  }
  useEffect(() => { load(); }, []);

  const pendingShiftIds = useMemo(() => new Set(swaps.filter(s => s.status === "pending").map(s => s.shift_id)), [swaps]);

  async function handleCancel(id: string) {
    try { await cancel({ data: { swapId: id } }); toast.success("Request cancelled"); load(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function handleDeclineIncoming(id: string) {
    try { await declineIncoming({ data: { swapId: id } }); toast.success("Proposal declined"); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-8 unit-in">
      <div>
        <h1 className="font-display text-[32px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">My schedule</h1>
        <p className="mt-2 text-base text-slate-600">Upcoming published shifts and swap requests.</p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 font-display text-sm font-semibold text-slate-900">
          Upcoming shifts ({shifts.length})
        </div>
        {shifts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No published shifts in the next 4 weeks.</div>
        ) : (
          <ul className="divide-y divide-border">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <div>
                    <div className="font-semibold text-slate-900">{fmt(s.start_at)} – {new Date(s.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                    <div className="text-xs text-slate-500">{[s.role, s.location].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                </div>
                {pendingShiftIds.has(s.id) ? (
                  <Badge variant="outline">Swap pending</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setSwapFor(s)}>
                    <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Request swap
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 font-display text-sm font-semibold text-slate-900">My swap requests</div>
        {swaps.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No swap requests yet.</div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {swaps.map((sw) => (
              <li key={sw.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-900 capitalize">
                    {sw.request_type === "drop" ? "Drop shift" : "Shift swap"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(sw.created_at).toLocaleDateString()} · {sw.reason || "No reason given"}
                    {sw.decision_notes && ` · Note: ${sw.decision_notes}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={sw.status === "approved" ? "default" : sw.status === "denied" ? "destructive" : "outline"}>
                    {sw.status}
                  </Badge>
                  {sw.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => handleCancel(sw.id)}><X className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SwapDialog
        shift={swapFor}
        coworkers={coworkers}
        onClose={() => setSwapFor(null)}
        onSubmit={async (payload) => {
          try {
            await reqSwap({ data: payload });
            toast.success("Swap request submitted");
            setSwapFor(null); load();
          } catch (e: any) { toast.error(e.message); }
        }}
      />
    </div>
  );
}

function SwapDialog({ shift, coworkers, onClose, onSubmit }: {
  shift: Shift | null;
  coworkers: Coworker[];
  onClose: () => void;
  onSubmit: (p: { shiftId: string; requestType: "drop" | "swap"; targetEmployeeId?: string | null; reason?: string }) => Promise<void>;
}) {
  const [type, setType] = useState<"drop" | "swap">("drop");
  const [target, setTarget] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (shift) { setType("drop"); setTarget(""); setReason(""); } }, [shift?.id]);
  if (!shift) return null;

  return (
    <Dialog open={!!shift} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request shift swap</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
            <div className="font-semibold text-slate-900">{fmt(shift.start_at)}</div>
            <div className="text-xs text-slate-500">{[shift.role, shift.location].filter(Boolean).join(" · ")}</div>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "drop" | "swap")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="drop">Drop — give up this shift</SelectItem>
                <SelectItem value="swap">Swap — hand off to a coworker</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "swap" && (
            <div>
              <Label>Coworker</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{coworkers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why are you requesting this?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || (type === "swap" && !target)} onClick={async () => {
            setBusy(true);
            await onSubmit({
              shiftId: shift.id,
              requestType: type,
              targetEmployeeId: type === "swap" ? target : null,
              reason: reason || undefined,
            });
            setBusy(false);
          }}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
