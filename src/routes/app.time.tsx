import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon, Check, X, CalendarDays, Plus, Trash2,
} from "lucide-react";

export const Route = createFileRoute("/app/time")({
  head: () => ({ meta: [{ title: "Time & attendance — Paylo" }] }),
  component: TimePage,
});

interface Emp { id: string; full_name: string; pay_type: string }
interface Entry {
  id: string;
  employee_id: string;
  work_date: string;
  hours: number;
  overtime_hours: number;
}
interface Pto {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  hours: number;
  pto_type: string;
  status: string;
  notes: string | null;
  employees?: { full_name: string };
}

// ----- date helpers
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sun
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtIso(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDay(d: Date) { return d.toLocaleDateString("en-US", { weekday: "short" }); }
function fmtDayNum(d: Date) { return d.getDate(); }
function fmtRange(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = sameMonth
    ? end.toLocaleDateString("en-US", { day: "numeric", year: "numeric" })
    : end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s} – ${e}`;
}

// 2026 US federal holidays (simple stored list — easy to extend later)
const US_HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-19", name: "Martin Luther King Jr. Day" },
  { date: "2026-02-16", name: "Presidents' Day" },
  { date: "2026-05-25", name: "Memorial Day" },
  { date: "2026-06-19", name: "Juneteenth" },
  { date: "2026-07-03", name: "Independence Day (observed)" },
  { date: "2026-09-07", name: "Labor Day" },
  { date: "2026-10-12", name: "Columbus Day" },
  { date: "2026-11-11", name: "Veterans Day" },
  { date: "2026-11-26", name: "Thanksgiving" },
  { date: "2026-12-25", name: "Christmas Day" },
];

function TimePage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [grid, setGrid] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pto, setPto] = useState<Pto[]>([]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = addDays(weekStart, 6);

  async function load() {
    setLoading(true);
    const { data: e } = await supabase
      .from("employees")
      .select("id, full_name, pay_type")
      .eq("status", "active")
      .order("full_name");
    setEmps((e ?? []) as Emp[]);

    const { data: t } = await supabase
      .from("time_entries")
      .select("id, employee_id, work_date, hours, overtime_hours")
      .gte("work_date", fmtIso(weekStart))
      .lte("work_date", fmtIso(weekEnd));

    const next: Record<string, Record<string, number>> = {};
    (e ?? []).forEach((emp: any) => { next[emp.id] = {}; });
    (t ?? []).forEach((row: any) => {
      next[row.employee_id] ??= {};
      next[row.employee_id][row.work_date] = (Number(row.hours) || 0) + (Number(row.overtime_hours) || 0);
    });
    setGrid(next);

    const { data: p } = await supabase
      .from("pto_entries")
      .select("*, employees(full_name)")
      .order("created_at", { ascending: false })
      .limit(50);
    setPto((p ?? []) as unknown as Pto[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [weekStart]);

  function setCell(empId: string, dateIso: string, value: string) {
    const n = value === "" ? 0 : Number(value);
    setGrid((g) => ({ ...g, [empId]: { ...(g[empId] ?? {}), [dateIso]: isNaN(n) ? 0 : n } }));
  }

  async function saveWeek() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    // wipe & re-insert for this week to keep things simple
    await supabase
      .from("time_entries")
      .delete()
      .gte("work_date", fmtIso(weekStart))
      .lte("work_date", fmtIso(weekEnd));
    const rows: any[] = [];
    Object.entries(grid).forEach(([empId, days]) => {
      Object.entries(days).forEach(([date, hours]) => {
        if (!hours || hours <= 0) return;
        const regular = Math.min(40, hours);
        const ot = Math.max(0, hours - 40);
        rows.push({
          employee_id: empId,
          work_date: date,
          hours: regular,
          overtime_hours: ot,
          owner_id: user.id,
        });
      });
    });
    if (rows.length) {
      const { error } = await supabase.from("time_entries").insert(rows);
      if (error) { setSaving(false); toast.error(error.message); return; }
    }
    setSaving(false);
    toast.success("Timesheet saved");
  }

  function fillStandardWeek() {
    const next = { ...grid };
    emps.forEach((emp) => {
      next[emp.id] = next[emp.id] ? { ...next[emp.id] } : {};
      weekDays.forEach((d) => {
        const iso = fmtIso(d);
        const day = d.getDay();
        // Mon–Fri 8h, Sat/Sun 0
        next[emp.id][iso] = day === 0 || day === 6 ? 0 : 8;
      });
    });
    setGrid(next);
    toast.success("Filled Mon–Fri @ 8h each");
  }

  function clearWeek() {
    const next = { ...grid };
    emps.forEach((emp) => {
      next[emp.id] = {};
      weekDays.forEach((d) => { next[emp.id][fmtIso(d)] = 0; });
    });
    setGrid(next);
  }

  async function approvePto(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("pto_entries").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? "PTO approved" : "PTO declined");
    load();
  }

  // KPIs
  const totals = useMemo(() => {
    let total = 0, regular = 0, ot = 0;
    emps.forEach((emp) => {
      let weekHrs = 0;
      weekDays.forEach((d) => { weekHrs += grid[emp.id]?.[fmtIso(d)] ?? 0; });
      total += weekHrs;
      regular += Math.min(40, weekHrs);
      ot += Math.max(0, weekHrs - 40);
    });
    return { total, regular, ot };
  }, [grid, emps, weekDays]);

  const pendingPto = pto.filter((p) => p.status === "pending");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Clock className="h-7 w-7 text-primary" />
            Time & attendance
          </h1>
          <p className="text-muted-foreground mt-1">Weekly hours, PTO approvals, and your company holiday calendar.</p>
        </div>
      </header>

      <Tabs defaultValue="timesheet">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="timesheet" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Timesheet</TabsTrigger>
          <TabsTrigger value="pto" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> PTO
            {pendingPto.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{pendingPto.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="holidays" className="gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Holidays</TabsTrigger>
        </TabsList>

        {/* TIMESHEET TAB */}
        <TabsContent value="timesheet" className="space-y-4 mt-6">
          {/* Week navigator */}
          <div className="flex flex-wrap items-center gap-3 surface-glass p-4 rounded-xl">
            <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{fmtRange(weekStart, weekEnd)}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={fillStandardWeek} className="gap-1"><Plus className="h-3.5 w-3.5" /> Fill Mon–Fri 8h</Button>
              <Button variant="ghost" size="sm" onClick={clearWeek} className="gap-1 text-muted-foreground"><Trash2 className="h-3.5 w-3.5" /> Clear</Button>
              <Button size="sm" onClick={saveWeek} disabled={saving} className="gap-1">
                {saving ? "Saving…" : "Save timesheet"}
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <Kpi label="Total hours" value={totals.total.toFixed(1)} />
            <Kpi label="Regular" value={totals.regular.toFixed(1)} />
            <Kpi label="Overtime" value={totals.ot.toFixed(1)} highlight={totals.ot > 0} />
          </div>

          {/* Grid */}
          {loading ? (
            <div className="surface-glass rounded-xl p-12 text-center text-muted-foreground">Loading…</div>
          ) : emps.length === 0 ? (
            <div className="surface-glass rounded-xl p-12 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-medium">No active employees yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Add employees first, then log their hours here.</p>
            </div>
          ) : (
            <div className="surface-glass rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 sticky left-0 bg-muted/40 z-10 min-w-[180px]">Employee</th>
                    {weekDays.map((d) => {
                      const isToday = fmtIso(d) === fmtIso(new Date());
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const holiday = US_HOLIDAYS_2026.find((h) => h.date === fmtIso(d));
                      return (
                        <th key={fmtIso(d)} className={`text-center px-2 py-3 min-w-[90px] ${isToday ? "text-primary" : ""} ${isWeekend ? "bg-muted/20" : ""}`}>
                          <div className="font-bold">{fmtDay(d)}</div>
                          <div className={`text-base font-normal ${isToday ? "text-primary" : "text-foreground"}`}>{fmtDayNum(d)}</div>
                          {holiday && <div className="text-[9px] text-amber-600 normal-case font-medium mt-0.5 truncate" title={holiday.name}>{holiday.name}</div>}
                        </th>
                      );
                    })}
                    <th className="text-center px-3 py-3 bg-muted/60 min-w-[80px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {emps.map((emp) => {
                    const rowTotal = weekDays.reduce((s, d) => s + (grid[emp.id]?.[fmtIso(d)] ?? 0), 0);
                    const overOT = rowTotal > 40;
                    return (
                      <tr key={emp.id} className="border-t border-border/40">
                        <td className="px-4 py-2 sticky left-0 bg-card/95 backdrop-blur z-10">
                          <div className="font-medium truncate">{emp.full_name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{emp.pay_type}</div>
                        </td>
                        {weekDays.map((d) => {
                          const iso = fmtIso(d);
                          const val = grid[emp.id]?.[iso] ?? 0;
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return (
                            <td key={iso} className={`px-1 py-1 ${isWeekend ? "bg-muted/10" : ""}`}>
                              <Input
                                type="number"
                                min={0} max={24} step="0.25"
                                value={val || ""}
                                placeholder="0"
                                onChange={(e) => setCell(emp.id, iso, e.target.value)}
                                className="h-9 text-center px-1 tabular-nums"
                              />
                            </td>
                          );
                        })}
                        <td className={`px-3 py-2 text-center font-bold tabular-nums ${overOT ? "text-amber-600" : ""}`}>
                          {rowTotal.toFixed(1)}
                          {overOT && <div className="text-[10px] font-medium">+{(rowTotal - 40).toFixed(1)} OT</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* PTO TAB */}
        <TabsContent value="pto" className="space-y-4 mt-6">
          <div className="surface-glass rounded-xl p-5">
            <h2 className="font-semibold mb-1">Pending requests</h2>
            <p className="text-sm text-muted-foreground mb-4">Approve or decline time-off requests from your team.</p>
            {pendingPto.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Check className="h-10 w-10 mx-auto text-emerald-500/60 mb-2" />
                You're all caught up — no pending requests.
              </div>
            ) : (
              <div className="space-y-2">
                {pendingPto.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {p.employees?.full_name ?? "Employee"}
                        <Badge variant="outline" className="capitalize text-xs">{p.pto_type}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()} · {p.hours}h
                      </div>
                      {p.notes && <div className="text-xs text-muted-foreground italic mt-1">"{p.notes}"</div>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => approvePto(p.id, "rejected")} className="gap-1">
                        <X className="h-3.5 w-3.5" /> Decline
                      </Button>
                      <Button size="sm" onClick={() => approvePto(p.id, "approved")} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                        <Check className="h-3.5 w-3.5" /> Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface-glass rounded-xl p-5">
            <h2 className="font-semibold mb-3">Recent decisions</h2>
            {pto.filter((p) => p.status !== "pending").length === 0 ? (
              <div className="text-sm text-muted-foreground">No recent decisions.</div>
            ) : (
              <div className="divide-y divide-border/40">
                {pto.filter((p) => p.status !== "pending").slice(0, 10).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}>{p.status}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{p.employees?.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.pto_type} · {new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()} · {p.hours}h
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* HOLIDAYS TAB */}
        <TabsContent value="holidays" className="space-y-4 mt-6">
          <div className="surface-glass rounded-xl p-5">
            <h2 className="font-semibold mb-1">2026 holiday calendar</h2>
            <p className="text-sm text-muted-foreground mb-4">Federal US holidays — these days are highlighted on your timesheet automatically.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {US_HOLIDAYS_2026.map((h) => {
                const d = new Date(h.date + "T12:00:00");
                const past = d < new Date();
                return (
                  <div key={h.date} className={`rounded-xl border p-4 ${past ? "opacity-60" : "bg-background/50"}`}>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {d.toLocaleDateString("en-US", { weekday: "long" })}
                    </div>
                    <div className="text-lg font-bold">
                      {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    <div className="text-sm font-medium">{h.name}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`surface-glass rounded-xl p-4 ${highlight ? "ring-1 ring-amber-400/40" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${highlight ? "text-amber-600" : ""}`}>{value}<span className="text-base font-normal text-muted-foreground ml-1">hrs</span></div>
    </div>
  );
}
