import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, Trash2, Users, Send,
  Check, X, Copy, ClipboardPaste, Undo2, Search, MoreVertical,
} from "lucide-react";
import { publishWeek, decideSwap, cancelShift } from "@/lib/scheduling.functions";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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
interface Emp { id: string; full_name: string; job_title?: string | null; department?: string | null; }
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
function hoursOf(s: Shift) { return (+new Date(s.end_at) - +new Date(s.start_at)) / 3600000; }

// Department color palette — deterministic by name
const DEPT_PALETTE = [
  { bg: "bg-violet-50", bar: "bg-violet-500", text: "text-violet-700", ring: "ring-violet-200" },
  { bg: "bg-sky-50", bar: "bg-sky-500", text: "text-sky-700", ring: "ring-sky-200" },
  { bg: "bg-emerald-50", bar: "bg-emerald-500", text: "text-emerald-700", ring: "ring-emerald-200" },
  { bg: "bg-amber-50", bar: "bg-amber-500", text: "text-amber-700", ring: "ring-amber-200" },
  { bg: "bg-rose-50", bar: "bg-rose-500", text: "text-rose-700", ring: "ring-rose-200" },
  { bg: "bg-indigo-50", bar: "bg-indigo-500", text: "text-indigo-700", ring: "ring-indigo-200" },
  { bg: "bg-teal-50", bar: "bg-teal-500", text: "text-teal-700", ring: "ring-teal-200" },
  { bg: "bg-fuchsia-50", bar: "bg-fuchsia-500", text: "text-fuchsia-700", ring: "ring-fuchsia-200" },
];
function deptColor(name: string | null | undefined) {
  const key = (name || "Unassigned").trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DEPT_PALETTE[h % DEPT_PALETTE.length];
}

const OPEN_DEPT = "__open__";

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
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [clipboard, setClipboard] = useState<Shift | null>(null);

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
      supabase.from("employees").select("id, full_name, job_title, department").eq("company_id", currentId).eq("status","active").order("full_name"),
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

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) set.add((e.department || "General").trim() || "General");
    return Array.from(set).sort();
  }, [employees]);

  const filteredEmps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      const dept = (e.department || "General").trim() || "General";
      if (deptFilter !== "all" && dept !== deptFilter) return false;
      if (q && !e.full_name.toLowerCase().includes(q) && !dept.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, query, deptFilter]);

  const groupedEmps = useMemo(() => {
    const map = new Map<string, Emp[]>();
    for (const e of filteredEmps) {
      const dept = (e.department || "General").trim() || "General";
      const arr = map.get(dept) ?? [];
      arr.push(e);
      map.set(dept, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEmps]);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of shifts) {
      if (!s.employee_id || s.status === "cancelled") continue;
      map[s.employee_id] = (map[s.employee_id] ?? 0) + hoursOf(s);
    }
    return map;
  }, [shifts]);

  const weekHours = useMemo(() => shifts.filter(s => s.status !== "cancelled").reduce((a, s) => a + hoursOf(s), 0), [shifts]);
  const openShifts = useMemo(() => shifts.filter((s) => !s.employee_id && s.status !== "cancelled"), [shifts]);
  const draftShifts = useMemo(() => shifts.filter((s) => s.status === "draft"), [shifts]);
  const draftCount = draftShifts.length;
  const empName = (id: string | null) => employees.find(e => e.id === id)?.full_name ?? "—";
  const empDept = (id: string | null) => {
    if (!id) return "Unassigned";
    return employees.find(e => e.id === id)?.department || "General";
  };

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

  async function handleRevert() {
    if (draftCount === 0) return;
    if (!confirm(`Discard ${draftCount} unpublished change${draftCount === 1 ? "" : "s"}?`)) return;
    const ids = draftShifts.map((s) => s.id);
    const { error } = await supabase.from("shifts").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success("Draft changes reverted");
    load();
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

  function copyShift(s: Shift) {
    setClipboard(s);
    toast.success("Shift copied — click an empty cell to paste");
  }

  async function pasteShift(date: Date, empId: string | null) {
    if (!clipboard || !currentId) return;
    const src = clipboard;
    const srcStart = new Date(src.start_at);
    const srcEnd = new Date(src.end_at);
    const dateBase = new Date(date);
    dateBase.setHours(0, 0, 0, 0);
    const newStart = new Date(dateBase);
    newStart.setHours(srcStart.getHours(), srcStart.getMinutes(), 0, 0);
    const newEnd = new Date(dateBase);
    newEnd.setHours(srcEnd.getHours(), srcEnd.getMinutes(), 0, 0);
    if (newEnd <= newStart) newEnd.setDate(newEnd.getDate() + 1);

    const { error } = await supabase.from("shifts").insert({
      company_id: currentId,
      employee_id: empId,
      start_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
      role: src.role,
      location: src.location,
      work_location_id: src.work_location_id,
    });
    if (error) return toast.error(error.message);
    toast.success("Shift pasted");
    load();
  }

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      <PageHeader
        title="Scheduling"
        description="Build and manage weekly shift schedules."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
            {draftCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleRevert}>
                <Undo2 className="mr-1 h-4 w-4" /> Revert
              </Button>
            )}
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={publishing || draftCount === 0}
              className={draftCount > 0 ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}
            >
              <Send className="mr-1 h-4 w-4" />
              Publish Changes {draftCount > 0 && `(${draftCount})`}
            </Button>
            <Button size="sm" onClick={() => { setPreset(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Add Shift</Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employees or departments" className="pl-9" />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-display text-sm font-semibold text-slate-900">
            {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {clipboard && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardPaste className="h-4 w-4" />
            Pasting {fmtTime(clipboard.start_at)} – {fmtTime(clipboard.end_at)}{clipboard.role && ` · ${clipboard.role}`}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setClipboard(null)}>Clear</Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total hours", value: weekHours.toFixed(1), icon: CalendarDays },
          { label: "Shifts", value: shifts.length, icon: CalendarDays },
          { label: "Staff scheduled", value: new Set(shifts.map((s) => s.employee_id).filter(Boolean)).size, icon: Users },
          { label: "Open shifts", value: openShifts.length, icon: Users },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><s.icon className="h-3.5 w-3.5" /> {s.label}</div>
            <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Desktop grid */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-surface">
            <tr>
              <th className="w-56 border-r border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Employee</th>
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
            {/* Open Shifts row */}
            <tr className="border-t border-border align-top bg-amber-50/30">
              <td className="border-r border-border bg-amber-50/50 px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  <div className="font-semibold text-amber-900">Open Shifts</div>
                </div>
                <div className="text-[11px] text-amber-700">Unassigned ({openShifts.length})</div>
              </td>
              {days.map((d) => {
                const dk = dayKey(d);
                const cell = openShifts.filter((s) => dayKey(new Date(s.start_at)) === dk);
                return (
                  <Cell
                    key={dk}
                    shifts={cell}
                    onAdd={() => openFor(d, undefined)}
                    onPaste={clipboard ? () => pasteShift(d, null) : undefined}
                    onCopy={copyShift}
                    onDelete={(s) => deleteShift(s.id, s.status)}
                    dept="Unassigned"
                  />
                );
              })}
              <td className="px-3 py-2 text-right text-xs text-amber-800">{openShifts.reduce((a, s) => a + hoursOf(s), 0).toFixed(1)}h</td>
            </tr>

            {employees.length === 0 ? (
              <tr><td colSpan={9} className="p-10 text-center text-sm text-slate-500">Add active employees first to build a schedule.</td></tr>
            ) : groupedEmps.map(([dept, emps]) => {
              const color = deptColor(dept);
              return (
                <FragmentRows key={dept}>
                  <tr className="border-t border-border bg-surface/40">
                    <td colSpan={9} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${color.bar}`} />
                        <span className={`font-display text-sm font-bold ${color.text}`}>{dept}</span>
                        <span className="text-xs text-slate-500">· {emps.length} employee{emps.length === 1 ? "" : "s"}</span>
                      </div>
                    </td>
                  </tr>
                  {emps.map((emp) => (
                    <tr key={emp.id} className="border-t border-border align-top">
                      <td className="border-r border-border bg-surface/30 px-3 py-3">
                        <div className="font-semibold text-slate-900">{emp.full_name}</div>
                        {emp.job_title && <div className="text-[11px] text-slate-500">{emp.job_title}</div>}
                      </td>
                      {days.map((d) => {
                        const dk = dayKey(d);
                        const cellShifts = shifts.filter((s) => s.employee_id === emp.id && dayKey(new Date(s.start_at)) === dk);
                        return (
                          <Cell
                            key={dk}
                            shifts={cellShifts}
                            onAdd={() => openFor(d, emp.id)}
                            onPaste={clipboard ? () => pasteShift(d, emp.id) : undefined}
                            onCopy={copyShift}
                            onDelete={(s) => deleteShift(s.id, s.status)}
                            dept={dept}
                          />
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{(totals[emp.id] ?? 0).toFixed(1)}h</td>
                    </tr>
                  ))}
                </FragmentRows>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile vertical list */}
      <div className="sm:hidden space-y-4">
        {/* Week strip */}
        <div className="-mx-2 flex gap-2 overflow-x-auto px-2">
          {days.map((d) => {
            const dk = dayKey(d);
            const count = shifts.filter((s) => dayKey(new Date(s.start_at)) === dk && s.status !== "cancelled").length;
            const isToday = dk === dayKey(new Date());
            return (
              <div key={dk} className={`min-w-[60px] rounded-xl border px-3 py-2 text-center ${isToday ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
                <div className="font-display text-lg font-bold text-slate-900">{d.getDate()}</div>
                <div className="text-[10px] text-slate-500">{count} shift{count === 1 ? "" : "s"}</div>
              </div>
            );
          })}
        </div>

        {/* Open shifts */}
        {openShifts.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              Open Shifts ({openShifts.length})
            </div>
            <ul className="space-y-2">
              {openShifts.map((s) => (
                <MobileShiftItem key={s.id} shift={s} deptName="Unassigned"
                  onCopy={() => copyShift(s)} onDelete={() => deleteShift(s.id, s.status)} />
              ))}
            </ul>
          </div>
        )}

        {/* Grouped employees */}
        {groupedEmps.map(([dept, emps]) => {
          const color = deptColor(dept);
          return (
            <div key={dept}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${color.bar}`} />
                <span className={`font-display text-sm font-bold ${color.text}`}>{dept}</span>
                <span className="text-xs text-slate-500">· {emps.length}</span>
              </div>
              <div className="space-y-3">
                {emps.map((emp) => {
                  const empShifts = shifts.filter((s) => s.employee_id === emp.id);
                  return (
                    <div key={emp.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-900">{emp.full_name}</div>
                          <div className="text-[11px] text-slate-500">{(totals[emp.id] ?? 0).toFixed(1)}h this week</div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => openFor(new Date(), emp.id)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {empShifts.length === 0 ? (
                        <div className="mt-2 text-xs text-slate-400">No shifts this week</div>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {empShifts.map((s) => (
                            <MobileShiftItem key={s.id} shift={s} deptName={dept}
                              onCopy={() => copyShift(s)} onDelete={() => deleteShift(s.id, s.status)} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile FABs */}
      <div className="sm:hidden fixed bottom-4 right-4 flex flex-col gap-2 z-30">
        {clipboard && (
          <Button size="icon" variant="outline" className="h-12 w-12 rounded-full shadow-lg" onClick={() => setClipboard(null)}>
            <ClipboardPaste className="h-5 w-5" />
          </Button>
        )}
        {draftCount > 0 && (
          <Button size="icon" className="h-14 w-14 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700" onClick={handlePublish} disabled={publishing}>
            <Send className="h-6 w-6" />
          </Button>
        )}
        <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={() => { setPreset(null); setOpen(true); }}>
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      {/* Swap requests */}
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

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Cell({
  shifts, onAdd, onPaste, onCopy, onDelete, dept,
}: {
  shifts: Shift[];
  onAdd: () => void;
  onPaste?: () => void;
  onCopy: (s: Shift) => void;
  onDelete: (s: Shift) => void;
  dept: string;
}) {
  const color = deptColor(dept);
  return (
    <td className="border-r border-border p-1.5 last:border-r-0 align-top">
      <div className="space-y-1">
        {shifts.map((s) => (
          <div
            key={s.id}
            className={`group relative rounded-md border-l-2 px-2 py-1.5 text-[11px] ${
              s.status === "cancelled" ? "border-slate-300 bg-slate-50 line-through text-slate-400"
              : `${color.bar.replace("bg-", "border-")} ${color.bg}`
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="font-semibold text-slate-900">{fmtTime(s.start_at)} – {fmtTime(s.end_at)}</div>
              {s.status === "draft" && <Badge variant="outline" className="h-4 px-1 text-[9px]">draft</Badge>}
            </div>
            {s.role && <div className={color.text}>{s.role}</div>}
            {s.location && <div className="text-slate-500">{s.location}</div>}
            <div className="absolute right-0.5 top-0.5 hidden group-hover:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700"><MoreVertical className="h-3 w-3" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => onCopy(s)}><Copy className="mr-2 h-3.5 w-3.5" /> Copy</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-rose-600" onClick={() => onDelete(s)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
        {onPaste ? (
          <button onClick={onPaste} className="w-full rounded border border-dashed border-primary/40 bg-primary/5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10">
            Paste
          </button>
        ) : (
          <button onClick={onAdd} className="w-full rounded border border-dashed border-border py-1 text-[10px] text-slate-400 hover:bg-surface hover:text-slate-700">+ Add</button>
        )}
      </div>
    </td>
  );
}

function MobileShiftItem({
  shift, deptName, onCopy, onDelete,
}: {
  shift: Shift; deptName: string;
  onCopy: () => void; onDelete: () => void;
}) {
  const color = deptColor(deptName);
  return (
    <li className={`flex items-start justify-between gap-2 rounded-lg border-l-2 px-3 py-2 ${color.bar.replace("bg-", "border-")} ${color.bg}`}>
      <div className="min-w-0">
        <div className="font-semibold text-slate-900 text-sm">{fmtTime(shift.start_at)} – {fmtTime(shift.end_at)}</div>
        <div className="text-[11px] text-slate-600">
          {new Date(shift.start_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          {shift.role && ` · ${shift.role}`}
        </div>
        {shift.status === "draft" && <Badge variant="outline" className="mt-1 h-4 px-1 text-[9px]">draft</Badge>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded p-1 text-slate-400 hover:text-slate-700"><MoreVertical className="h-4 w-4" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={onCopy}><Copy className="mr-2 h-3.5 w-3.5" /> Copy</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-rose-600" onClick={onDelete}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
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
        <DialogHeader><DialogTitle>Add shift</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Employee</Label>
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Open shift (unassigned)" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}{e.department ? ` · ${e.department}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><Label>Start</Label><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          <div><Label>End</Label><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
          <div className="col-span-2"><Label>Shift type / Role</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Server, Cashier, Morning…" /></div>
          <div className="col-span-2"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Main store" /></div>
          {locations.length > 0 && (
            <div className="col-span-2"><Label>Geofenced worksite (optional)</Label>
              <Select value={form.work_location_id} onValueChange={(v) => setForm({ ...form, work_location_id: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
