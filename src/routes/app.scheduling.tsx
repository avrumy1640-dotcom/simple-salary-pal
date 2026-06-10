import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Trash2, Users, Send, Check, X } from "lucide-react";
import { publishWeek, decideSwap, cancelShift } from "@/lib/scheduling.functions";

export const Route = createFileRoute("/app/scheduling")({
  head: () => ({ meta: [{ title: "Scheduling — Paylo" }] }),
  component: SchedulingPage,
});

interface Shift {
  id: string; employee_id: string | null;
  start_at: string; end_at: string;
  role: string | null; location: string | null; notes: string | null;
  status: "draft" | "published" | "cancelled";
  work_location_id: string | null;
}
interface Emp { id: string; full_name: string; job_title?: string | null; }
interface WorkLocation { id: string; name: string; }
interface Swap {
  id: string; shift_id: string; request_type: "drop" | "swap"; reason: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  requested_by_employee_id: string; target_employee_id: string | null;
  created_at: string;
}

function startOfWeek(d: Date) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dayKey(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function hours(s: Shift) { return (+new Date(s.end_at) - +new Date(s.start_at)) / 3600000; }

function SchedulingPage() {
  const { currentId } = useCompany();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<{ date?: string; emp?: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const publish = useServerFn(publishWeek);
  const decide = useServerFn(decideSwap);
  const cancelShiftFn = useServerFn(cancelShift);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  async function load() {
    if (!currentId) return;
    const [s, e, l, sw] = await Promise.all([
      supabase.from("shifts").select("*").eq("company_id", currentId)
        .gte("start_at", weekStart.toISOString()).lt("start_at", weekEnd.toISOString())
        .order("start_at"),
      supabase.from("employees").select("id, full_name, job_title").eq("company_id", currentId).eq("status","active").order("full_name"),
      supabase.from("work_locations").select("id, name").eq("company_id", currentId).eq("is_active", true).order("name"),
      supabase.from("shift_swap_requests").select("*").eq("company_id", currentId).eq("status","pending").order("created_at", { ascending: false }),
    ]);
    setShifts((s.data ?? []) as Shift[]);
    setEmployees((e.data ?? []) as Emp[]);
    setLocations((l.data ?? []) as WorkLocation[]);
    setSwaps((sw.data ?? []) as Swap[]);
  }
  useEffect(() => { load(); }, [currentId, weekStart.getTime()]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of shifts) {
      if (!s.employee_id || s.status === "cancelled") continue;
      map[s.employee_id] = (map[s.employee_id] ?? 0) + hours(s);
    }
    return map;
  }, [shifts]);

  const weekHours = useMemo(() => shifts.filter(s => s.status !== "cancelled").reduce((a, s) => a + hours(s), 0), [shifts]);
  const unassigned = shifts.filter((s) => !s.employee_id && s.status !== "cancelled").length;
  const draftCount = shifts.filter((s) => s.status === "draft" && s.employee_id).length;
  const empName = (id: string | null) => employees.find(e => e.id === id)?.full_name ?? "—";

  async function deleteShift(id: string, status: string) {
    if (status === "published") {
      const r = await cancelShiftFn({ data: { shiftId: id } });
      if (!r) return;
      toast.success("Shift cancelled");
    } else {
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) { toast.error(error.message); return; }
    }
    load();
  }

  async function handlePublish() {
    if (!currentId) return;
    setPublishing(true);
    try {
      const r = await publish({ data: { companyId: currentId, weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() } });
      toast.success(`Published ${r.published} shift${r.published === 1 ? "" : "s"}`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setPublishing(false); }
  }

  async function handleDecideSwap(swapId: string, decision: "approved" | "denied") {
    try {
      await decide({ data: { swapId, decision } });
      toast.success(`Swap ${decision}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  function openFor(date: Date, empId?: string) {
    setPreset({ date: dayKey(date), emp: empId });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduling"
        description="Build and manage weekly shift schedules."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
            <Button variant="outline" size="sm" onClick={handlePublish} disabled={publishing || draftCount === 0}>
              <Send className="mr-1 h-4 w-4" /> Publish week {draftCount > 0 && `(${draftCount})`}
            </Button>
            <Button size="sm" onClick={() => { setPreset(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> New shift</Button>
          </>
        }
      />


      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total hours this week", value: weekHours.toFixed(1), icon: CalendarDays },
          { label: "Shifts", value: shifts.length, icon: CalendarDays },
          { label: "Staff scheduled", value: new Set(shifts.map((s) => s.employee_id).filter(Boolean)).size, icon: Users },
          { label: "Unassigned", value: unassigned, icon: Users },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><s.icon className="h-3.5 w-3.5" /> {s.label}</div>
            <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-display text-sm font-semibold text-slate-900">
            {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-surface">
            <tr>
              <th className="w-44 border-r border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Employee</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="border-r border-border px-3 py-2 text-left last:border-r-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
                  <div className="font-display text-base font-bold text-slate-900">{d.getDate()}</div>
                </th>
              ))}
              <th className="w-20 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr><td colSpan={9} className="p-10 text-center text-sm text-slate-500">Add active employees first to build a schedule.</td></tr>
            ) : employees.map((emp) => (
              <tr key={emp.id} className="border-t border-border align-top">
                <td className="border-r border-border bg-surface/50 px-3 py-3">
                  <div className="font-semibold text-slate-900">{emp.full_name}</div>
                  {emp.job_title && <div className="text-[11px] text-slate-500">{emp.job_title}</div>}
                </td>
                {days.map((d) => {
                  const dk = dayKey(d);
                  const cellShifts = shifts.filter((s) => s.employee_id === emp.id && dayKey(new Date(s.start_at)) === dk);
                  return (
                    <td key={dk} className="border-r border-border p-1.5 last:border-r-0 align-top">
                      <div className="space-y-1">
                        {cellShifts.map((s) => (
                          <div key={s.id} className={`group relative rounded-md border-l-2 px-2 py-1.5 text-[11px] ${
                            s.status === "cancelled" ? "border-slate-300 bg-slate-50 line-through text-slate-400"
                            : s.status === "published" ? "border-emerald-500 bg-emerald-50"
                            : "border-primary bg-primary/5"
                          }`}>
                            <div className="flex items-center justify-between gap-1">
                              <div className="font-semibold text-slate-900">{fmtTime(s.start_at)} – {fmtTime(s.end_at)}</div>
                              {s.status === "draft" && <Badge variant="outline" className="h-4 px-1 text-[9px]">draft</Badge>}
                            </div>
                            {s.role && <div className="text-slate-600">{s.role}</div>}
                            {s.location && <div className="text-slate-500">{s.location}</div>}
                            <button onClick={() => deleteShift(s.id, s.status)} className="absolute right-1 top-1 hidden text-slate-400 hover:text-rose-600 group-hover:block"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        ))}
                        <button onClick={() => openFor(d, emp.id)} className="w-full rounded border border-dashed border-border py-1 text-[10px] text-slate-400 hover:bg-surface hover:text-slate-700">+ Add</button>
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-semibold text-slate-900">{(totals[emp.id] ?? 0).toFixed(1)}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {swaps.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 font-display text-sm font-semibold text-slate-900">Pending swap requests ({swaps.length})</div>
          <ul className="divide-y divide-border text-sm">
            {swaps.map((sw) => {
              const shift = shifts.find((s) => s.id === sw.shift_id);
              return (
                <li key={sw.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {empName(sw.requested_by_employee_id)} → {sw.request_type === "drop" ? "drop shift" : `swap with ${empName(sw.target_employee_id)}`}
                    </div>
                    <div className="text-xs text-slate-500">
                      {shift ? `${new Date(shift.start_at).toLocaleString()} – ${fmtTime(shift.end_at)}` : "Shift removed"}
                      {sw.reason && ` · ${sw.reason}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleDecideSwap(sw.id, "denied")}><X className="mr-1 h-3 w-3" /> Deny</Button>
                    <Button size="sm" onClick={() => handleDecideSwap(sw.id, "approved")}><Check className="mr-1 h-3 w-3" /> Approve</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <NewShiftDialog
        open={open}
        onClose={() => { setOpen(false); setPreset(null); }}
        companyId={currentId}
        employees={employees}
        locations={locations}
        preset={preset}
        onCreated={load}
      />
    </div>
  );
}

function NewShiftDialog({ open, onClose, companyId, employees, locations, preset, onCreated }: {
  open: boolean; onClose: () => void; companyId: string | null;
  employees: Emp[]; locations: WorkLocation[]; preset: { date?: string; emp?: string } | null; onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({ employee_id: "", date: today, start: "09:00", end: "17:00", role: "", location: "", work_location_id: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, date: preset?.date ?? today, employee_id: preset?.emp ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset?.date, preset?.emp]);

  async function submit() {
    if (!companyId) return;
    const start = new Date(`${form.date}T${form.start}`);
    const end = new Date(`${form.date}T${form.end}`);
    if (end <= start) { toast.error("End must be after start"); return; }
    setBusy(true);
    const { error } = await supabase.from("shifts").insert({
      company_id: companyId,
      employee_id: form.employee_id || null,
      start_at: start.toISOString(), end_at: end.toISOString(),
      role: form.role || null, location: form.location || null,
      work_location_id: form.work_location_id || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Shift created");
    onClose(); onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New shift</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Employee</Label>
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><Label>Start</Label><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          <div><Label>End</Label><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
          <div><Label>Role</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Server, Cashier…" /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Main store" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
