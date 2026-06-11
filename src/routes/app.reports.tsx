import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { exportW2Summary, export1099Summary, exportGlForRun, exportAuditLog, exportPayrollRegister } from "@/lib/reports.functions";
import { getAttendanceReport } from "@/lib/attendance.functions";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import {
  Download, FileText, Users, DollarSign, Calendar, Clock, FileBadge,
  TrendingUp, TrendingDown, PieChart, Briefcase, HeartHandshake, ChevronRight, BookOpen, ShieldCheck,
  UserMinus, UserPlus, Activity,
} from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: "Reports — Paylo" }] }),
  component: ReportsPage,
});

interface Run {
  id: string; period_start: string; period_end: string; pay_date: string;
  gross_total: number; tax_total: number; net_total: number; status: string;
}

function ReportsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [empCount, setEmpCount] = useState(0);
  const { currentId } = useCompany();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const w2Fn = useServerFn(exportW2Summary);
  const f1099Fn = useServerFn(export1099Summary);
  const glFn = useServerFn(exportGlForRun);
  const auditFn = useServerFn(exportAuditLog);
  const regFn = useServerFn(exportPayrollRegister);
  const attFn = useServerFn(getAttendanceReport);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [workforce, setWorkforce] = useState({
    headcount: 0, hires90: 0, terms90: 0, hires12mo: 0, terms12mo: 0,
    avgTenureDays: 0, onLeave: 0, turnoverPct: 0,
  });
  const [trend, setTrend] = useState<{ month: string; hires: number; terms: number }[]>([]);

  function downloadCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  async function runExport(fn: () => Promise<{ filename: string; csv: string }>, label: string) {
    try { const r = await fn(); downloadCsv(r.filename, r.csv); toast.success(`${label} downloaded`); }
    catch (e: any) { toast.error(e.message || `${label} failed`); }
  }
  async function loadAttendance() {
    if (!currentId) return;
    setAttLoading(true);
    try {
      const weekStart = (() => {
        const d = new Date(); d.setDate(d.getDate() - d.getDay() - 21); d.setHours(0,0,0,0);
        return d.toISOString().slice(0, 10);
      })();
      const r = await attFn({ data: { companyId: currentId, weekStart, weeks: 4 } });
      setAttendance(r.rows);
    } catch (e: any) { toast.error(e.message); }
    finally { setAttLoading(false); }
  }
  useEffect(() => { loadAttendance(); }, [currentId]);

  function exportAttendance() {
    if (!attendance.length) { toast.error("No attendance data"); return; }
    const headers = ["Week of", "Employee", "Scheduled hours", "Scheduled shifts", "Actual hours", "Variance"];
    const rows = attendance.map((r: any) => [
      r.week_start, r.employee_name, r.scheduled_hours, r.scheduled_shifts, r.actual_hours, r.variance_hours,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadCsv(`attendance-${new Date().toISOString().slice(0,10)}.csv`, csv);
  }


  async function loadWorkforce() {
    if (!currentId) return;
    const today = new Date();
    const d90 = new Date(today); d90.setDate(d90.getDate() - 90);
    const d365 = new Date(today); d365.setDate(d365.getDate() - 365);
    const iso90 = d90.toISOString().slice(0,10);
    const iso365 = d365.toISOString().slice(0,10);

    const { data: emps } = await supabase.from("employees")
      .select("id, start_date, termination_date, lifecycle_status, hire_date")
      .eq("company_id", currentId);
    const rows = emps ?? [];

    const headcount = rows.filter((e: any) => e.lifecycle_status === "active" || e.lifecycle_status === "on_leave").length;
    const onLeave = rows.filter((e: any) => e.lifecycle_status === "on_leave").length;
    const hires90 = rows.filter((e: any) => (e.start_date || e.hire_date) && (e.start_date || e.hire_date) >= iso90).length;
    const terms90 = rows.filter((e: any) => e.termination_date && e.termination_date >= iso90).length;
    const hires12mo = rows.filter((e: any) => (e.start_date || e.hire_date) && (e.start_date || e.hire_date) >= iso365).length;
    const terms12mo = rows.filter((e: any) => e.termination_date && e.termination_date >= iso365).length;
    const avgHeadcount = Math.max(1, (headcount + terms12mo) / 2);
    const turnoverPct = (terms12mo / avgHeadcount) * 100;

    // Avg tenure (days) of active employees
    const tenures = rows
      .filter((e: any) => (e.lifecycle_status === "active" || e.lifecycle_status === "on_leave") && (e.start_date || e.hire_date))
      .map((e: any) => Math.max(0, (today.getTime() - new Date(e.start_date || e.hire_date).getTime()) / 86400000));
    const avgTenureDays = tenures.length ? tenures.reduce((a, b) => a + b, 0) / tenures.length : 0;

    // 6-month hires/terms trend
    const buckets: Record<string, { hires: number; terms: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const k = d.toISOString().slice(0, 7);
      buckets[k] = { hires: 0, terms: 0 };
    }
    for (const e of rows as any[]) {
      const hireKey = (e.start_date || e.hire_date)?.slice(0, 7);
      if (hireKey && buckets[hireKey]) buckets[hireKey].hires += 1;
      const termKey = e.termination_date?.slice(0, 7);
      if (termKey && buckets[termKey]) buckets[termKey].terms += 1;
    }
    setTrend(Object.entries(buckets).map(([month, v]) => ({ month, ...v })));
    setWorkforce({ headcount, hires90, terms90, hires12mo, terms12mo, avgTenureDays, onLeave, turnoverPct });
  }

  useEffect(() => {
    if (!currentId) return;
    (async () => {
      const [{ data: r }, { count }] = await Promise.all([
        supabase.from("payroll_runs").select("*").eq("company_id", currentId).order("created_at", { ascending: false }).limit(10),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", currentId).eq("status", "active"),
      ]);
      setRuns((r ?? []) as Run[]);
      setEmpCount(count ?? 0);
    })();
    loadWorkforce();

    // Realtime: refresh on employee + payroll run changes
    const ch = supabase
      .channel(`reports-${currentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees", filter: `company_id=eq.${currentId}` }, () => loadWorkforce())
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_runs", filter: `company_id=eq.${currentId}` }, async () => {
        const { data: r } = await supabase.from("payroll_runs").select("*").eq("company_id", currentId).order("created_at", { ascending: false }).limit(10);
        setRuns((r ?? []) as Run[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentId]);


  async function exportRun(id: string) {
    if (!currentId) return;
    const { data } = await supabase.from("payroll_items").select("*").eq("company_id", currentId).eq("run_id", id);
    if (!data || data.length === 0) return;
    const headers = ["Employee", "Regular hours", "Overtime hours", "Gross", "Federal tax", "Social security", "Medicare", "State tax", "Net pay"];
    const rows = data.map((d: any) => [
      d.employee_name, d.regular_hours, d.overtime_hours, d.gross_pay,
      d.federal_tax, d.social_security, d.medicare, d.state_tax, d.net_pay,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payroll-${id.slice(0, 8)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportEmployees() {
    if (!currentId) return;
    const { data } = await supabase.from("employees").select("*").eq("company_id", currentId);
    if (!data) return;
    const headers = ["Name", "Email", "Job title", "Pay type", "Pay rate", "Status", "Start date"];
    const rows = data.map((e: any) => [e.full_name, e.email ?? "", e.job_title ?? "", e.pay_type, e.pay_rate, e.status, e.start_date ?? ""]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const ytd = runs.reduce((s, r) => ({
    gross: s.gross + (r.gross_total ?? 0),
    tax: s.tax + (r.tax_total ?? 0),
    net: s.net + (r.net_total ?? 0),
  }), { gross: 0, tax: 0, net: 0 });

  const reportCards = [
    { title: "Payroll summary", desc: "Detailed run-by-run breakdown of every payroll.", icon: DollarSign, to: "/app/pay-history", color: "from-blue-500/15 to-cyan-500/15" },
    { title: "Employee roster", desc: "Full team list with contact, pay, and tax info.", icon: Users, action: exportEmployees, color: "from-emerald-500/15 to-teal-500/15" },
    { title: "Tax liability", desc: "Federal, state, FICA withholdings to date.", icon: FileBadge, to: "/app/taxes", color: "from-amber-500/15 to-orange-500/15" },
    { title: "Time & attendance", desc: "Hours worked, overtime, and PTO usage.", icon: Clock, to: "/app/time", color: "from-violet-500/15 to-purple-500/15" },
    { title: "Contractor 1099s", desc: "Year-end 1099-NEC preview for contractors.", icon: Briefcase, to: "/app/form-1099", color: "from-rose-500/15 to-pink-500/15" },
    { title: "Benefits & deductions", desc: "Pre-tax, post-tax, and benefit contributions.", icon: HeartHandshake, to: "/app/benefits", color: "from-sky-500/15 to-blue-500/15" },
  ];

  return (
    <div className="space-y-6 unit-scope">
      <section className="unit-in flex flex-wrap items-end justify-between gap-3 border-b unit-hairline pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-[40px]">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">Understand your business with clear data.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5"><Calendar className="h-4 w-4" />Schedule report</Button>
          <Button className="gap-1.5"><PieChart className="h-4 w-4" />Custom report</Button>
        </div>
      </section>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 unit-in">
        <KpiTile icon={DollarSign} label="Gross paid YTD" value={fmtUSD(ytd.gross)} />
        <KpiTile icon={TrendingUp} label="Taxes withheld" value={fmtUSD(ytd.tax)} />
        <KpiTile icon={Users} label="Net to team" value={fmtUSD(ytd.net)} highlight />
        <KpiTile icon={Users} label="Active employees" value={String(empCount)} />
      </div>

      {/* Report categories */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Standard reports</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportCards.map((c) => {
            const inner = (
              <>
                <div className={`absolute inset-0 bg-gradient-to-br ${c.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center">
                      <c.icon className="h-5 w-5 text-primary" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="font-semibold mb-1">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.desc}</p>
                </div>
              </>
            );
            const className = "group relative overflow-hidden surface-glass rounded-2xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-glow";
            return c.to ? (
              <Link key={c.title} to={c.to} className={className}>{inner}</Link>
            ) : (
              <button key={c.title} onClick={c.action} className={className}>{inner}</button>
            );
          })}
        </div>
      </div>

      {/* Year-end & ledger */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Year-end & ledger</h2>
        <div className="surface-glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-muted-foreground">Tax year</label>
            <input
              type="number"
              className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value) || year)}
            />
            <Button size="sm" variant="outline" disabled={!currentId} className="gap-2"
              onClick={() => currentId && runExport(() => w2Fn({ data: { company_id: currentId, year } }), "W-2 summary")}>
              <FileBadge className="h-4 w-4" /> W-2 summary
            </Button>
            <Button size="sm" variant="outline" disabled={!currentId} className="gap-2"
              onClick={() => currentId && runExport(() => f1099Fn({ data: { company_id: currentId, year } }), "1099 summary")}>
              <Briefcase className="h-4 w-4" /> 1099 summary
            </Button>
            <Button size="sm" variant="outline" disabled={!currentId} className="gap-2"
              onClick={() => currentId && runExport(() => regFn({ data: { company_id: currentId, year } }), "Payroll register")}>
              <DollarSign className="h-4 w-4" /> Payroll register
            </Button>
            <Button size="sm" variant="outline" disabled={!currentId} className="gap-2"
              onClick={() => currentId && runExport(() => auditFn({ data: { company_id: currentId, days: 365 } }), "Audit log")}>
              <ShieldCheck className="h-4 w-4" /> Audit log (1y)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">All exports are server-generated against paid runs. The audit log is append-only and reflects every change to employee, payroll, and HR records.</p>
        </div>
      </div>

      {/* Attendance — scheduled vs actual */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Attendance (last 4 weeks)</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={loadAttendance} disabled={attLoading}>Refresh</Button>
            <Button size="sm" variant="outline" onClick={exportAttendance} disabled={!attendance.length} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>
        <div className="surface-glass rounded-2xl overflow-hidden">
          {attLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : attendance.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              No scheduled or actual hours in the last 4 weeks.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Week of</th>
                  <th className="px-4 py-2 text-left">Employee</th>
                  <th className="px-4 py-2 text-right">Scheduled</th>
                  <th className="px-4 py-2 text-right">Actual</th>
                  <th className="px-4 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((r: any, i: number) => {
                  const v = Number(r.variance_hours);
                  return (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-4 py-2 tabular-nums">{r.week_start}</td>
                      <td className="px-4 py-2">{r.employee_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(r.scheduled_hours).toFixed(1)}h <span className="text-muted-foreground">· {r.scheduled_shifts}</span></td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(r.actual_hours).toFixed(1)}h</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${v < -0.5 ? "text-rose-600" : v > 0.5 ? "text-emerald-600" : "text-slate-600"}`}>
                        {v >= 0 ? "+" : ""}{v.toFixed(1)}h
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Workforce trends — Turnover & Headcount */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Workforce trends</h2>
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Activity className="h-3 w-3" /> Live
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <KpiTile icon={Users} label="Headcount" value={String(workforce.headcount)} />
          <KpiTile icon={UserPlus} label="New hires (90d)" value={String(workforce.hires90)} />
          <KpiTile icon={UserMinus} label="Departures (90d)" value={String(workforce.terms90)} />
          <KpiTile icon={workforce.turnoverPct > 20 ? TrendingDown : TrendingUp} label="Turnover (12mo)" value={`${workforce.turnoverPct.toFixed(1)}%`} highlight={workforce.turnoverPct > 20} />
        </div>
        <div className="surface-glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Hires vs departures · last 6 months</div>
              <div className="text-xs text-muted-foreground">
                Avg tenure: <span className="font-semibold text-slate-700">{(workforce.avgTenureDays / 365).toFixed(1)} yrs</span>
                {workforce.onLeave > 0 && <> · <span className="text-amber-600">{workforce.onLeave} on leave</span></>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2 items-end h-32">
            {trend.map((t) => {
              const max = Math.max(1, ...trend.flatMap((x) => [x.hires, x.terms]));
              const hiresH = (t.hires / max) * 100;
              const termsH = (t.terms / max) * 100;
              return (
                <div key={t.month} className="flex flex-col items-center gap-1">
                  <div className="flex items-end gap-1 h-24 w-full justify-center">
                    <div className="w-3 rounded-t bg-emerald-500/80 transition-all" style={{ height: `${hiresH}%`, minHeight: t.hires ? 4 : 0 }} title={`${t.hires} hires`} />
                    <div className="w-3 rounded-t bg-rose-500/80 transition-all" style={{ height: `${termsH}%`, minHeight: t.terms ? 4 : 0 }} title={`${t.terms} departures`} />
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(t.month + "-02").toLocaleDateString("en-US", { month: "short" })}
                  </div>
                  <div className="text-[10px] tabular-nums text-slate-500">+{t.hires} / -{t.terms}</div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500/80" /> Hires</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500/80" /> Departures</span>
          </div>
        </div>
      </div>

      {/* Recent runs quick export */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent payroll runs</h2>
        <div className="surface-glass rounded-2xl overflow-hidden">
          {runs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              No payroll runs yet. Once you run payroll, exports will show up here.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition">
                  <div className="flex items-center gap-4 min-w-0">
                    <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">{new Date(r.pay_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Period {new Date(r.period_start).toLocaleDateString()} – {new Date(r.period_end).toLocaleDateString()} · {r.status}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right hidden sm:block mr-2">
                      <div className="text-sm font-semibold tabular-nums">{fmtUSD(r.net_total)}</div>
                      <div className="text-xs text-muted-foreground">net</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => exportRun(r.id)} className="gap-2">
                      <Download className="h-4 w-4" /> Items
                    </Button>
                    <Button variant="ghost" size="sm"
                      onClick={() => runExport(() => glFn({ data: { run_id: r.id } }), "GL journal")}
                      className="gap-2">
                      <BookOpen className="h-4 w-4" /> GL
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function KpiTile({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border unit-hairline bg-white p-4 shadow-soft ${highlight ? "ring-1 ring-primary/30" : ""}`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`text-2xl font-bold mt-2 tabular-nums text-slate-900 unit-num ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
