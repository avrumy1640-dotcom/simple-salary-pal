import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { Users, DollarSign, Clock, TrendingUp, TrendingDown, Briefcase } from "lucide-react";

export const Route = createFileRoute("/app/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Paylo" }] }),
  component: AnalyticsPage,
});

const PIE_COLORS = ["#3DFFFF", "#0EA5E9", "#22C55E", "#F59E0B", "#EF4444", "#A855F7", "#64748B"];

function AnalyticsPage() {
  const { currentId } = useCompany();
  const [employees, setEmployees] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [pto, setPto] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    if (!currentId) return;
    (async () => {
      const [e, r, t, p, c, j] = await Promise.all([
        supabase.from("employees").select("id, full_name, status, pay_type, pay_rate, job_title, start_date").eq("company_id", currentId),
        supabase.from("payroll_runs").select("*").eq("company_id", currentId).order("pay_date", { ascending: true }),
        supabase.from("time_entries").select("work_date, hours, overtime_hours, employee_id").eq("company_id", currentId).gte("work_date", new Date(Date.now() - 90*864e5).toISOString().slice(0,10)),
        supabase.from("pto_entries").select("status, hours, pto_type, start_date").eq("company_id", currentId).gte("start_date", new Date(Date.now() - 365*864e5).toISOString().slice(0,10)),
        supabase.from("candidates").select("current_stage, applied_at, source").eq("company_id", currentId),
        supabase.from("job_postings").select("status, department").eq("company_id", currentId),
      ]);
      setEmployees(e.data ?? []); setRuns(r.data ?? []); setEntries(t.data ?? []);
      setPto(p.data ?? []); setCandidates(c.data ?? []); setJobs(j.data ?? []);
    })();
  }, [currentId]);

  const active = employees.filter((e) => e.status === "active");
  const totalAnnualized = useMemo(() => {
    return active.reduce((sum, e) => {
      const rate = Number(e.pay_rate) || 0;
      return sum + (e.pay_type === "salary" ? rate : rate * 2080);
    }, 0);
  }, [active]);
  const avgComp = active.length ? totalAnnualized / active.length : 0;

  const payrollSeries = useMemo(() => runs.slice(-12).map((r) => ({
    label: new Date(r.pay_date || r.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    gross: Number(r.gross_total || 0), tax: Number(r.tax_total || 0), net: Number(r.net_total || 0),
  })), [runs]);

  const hoursByWeek = useMemo(() => {
    const buckets: Record<string, { reg: number; ot: number }> = {};
    for (const e of entries) {
      const wk = new Date(e.work_date); wk.setDate(wk.getDate() - wk.getDay());
      const key = wk.toISOString().slice(0,10);
      if (!buckets[key]) buckets[key] = { reg: 0, ot: 0 };
      buckets[key].reg += Number(e.hours || 0);
      buckets[key].ot += Number(e.overtime_hours || 0);
    }
    return Object.entries(buckets).sort(([a],[b]) => a < b ? -1 : 1).slice(-12).map(([k,v]) => ({
      label: new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Regular: +v.reg.toFixed(1), Overtime: +v.ot.toFixed(1),
    }));
  }, [entries]);

  const headcountByDept = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of active) {
      const k = (e.job_title || "Unassigned").split(",")[0].trim();
      m[k] = (m[k] || 0) + 1;
    }
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [active]);

  const ptoByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of pto) {
      const t = p.pto_type || "PTO";
      m[t] = (m[t] || 0) + Number(p.hours || 0);
    }
    return Object.entries(m).map(([name, value]) => ({ name, value: +Number(value).toFixed(1) }));
  }, [pto]);

  const candFunnel = useMemo(() => {
    const stages = ["applied","screening","interview","final","offer","hired"];
    return stages.map((s) => ({ stage: s, count: candidates.filter((c) => c.current_stage === s).length }));
  }, [candidates]);

  const sourceMix = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of candidates) { const s = c.source || "Direct"; m[s] = (m[s] || 0) + 1; }
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [candidates]);

  const totalPayrollMTD = useMemo(() => {
    const since = new Date(); since.setDate(1); since.setHours(0,0,0,0);
    return runs.filter((r) => r.pay_date && new Date(r.pay_date) >= since)
      .reduce((s, r) => s + Number(r.gross_total || 0), 0);
  }, [runs]);

  const totalHours90 = entries.reduce((s, e) => s + Number(e.hours || 0) + Number(e.overtime_hours || 0), 0);
  const otRatio = totalHours90 ? entries.reduce((s, e) => s + Number(e.overtime_hours || 0), 0) / totalHours90 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Workforce, payroll, time, and recruiting insights at a glance." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Active headcount" value={active.length} icon={Users} />
        <KPI label="Annualized payroll" value={`$${(totalAnnualized/1000).toFixed(0)}k`} icon={DollarSign} />
        <KPI label="Avg compensation" value={`$${(avgComp/1000).toFixed(0)}k`} icon={TrendingUp} />
        <KPI label="OT % (90d)" value={`${(otRatio*100).toFixed(1)}%`} icon={otRatio > 0.1 ? TrendingUp : TrendingDown} tone={otRatio > 0.1 ? "warning" : "success"} />
        <KPI label="Payroll MTD" value={`$${totalPayrollMTD.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} />
        <KPI label="Hours logged (90d)" value={totalHours90.toFixed(0)} icon={Clock} />
        <KPI label="Open positions" value={jobs.filter((j) => j.status === "open").length} icon={Briefcase} />
        <KPI label="Candidates in pipeline" value={candidates.filter((c) => !["hired","rejected","withdrawn"].includes(c.current_stage)).length} icon={Users} />
      </div>

      <Tabs defaultValue="payroll">
        <TabsList>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="workforce">Workforce</TabsTrigger>
          <TabsTrigger value="time">Time & PTO</TabsTrigger>
          <TabsTrigger value="recruiting">Recruiting</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll" className="space-y-4">
          <Card title="Gross vs Net Payroll (last 12 runs)">
            {payrollSeries.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={payrollSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="gross" stroke="#0EA5E9" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net" stroke="#22C55E" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tax" stroke="#EF4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="workforce" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Headcount by role">
              {headcountByDept.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={headcountByDept}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0EA5E9" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Pay type mix">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={[
                    { name: "Hourly", value: active.filter((e) => e.pay_type === "hourly").length },
                    { name: "Salary", value: active.filter((e) => e.pay_type === "salary").length },
                  ]} dataKey="value" nameKey="name" outerRadius={90} label>
                    {PIE_COLORS.slice(0,2).map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="time" className="space-y-4">
          <Card title="Hours by week (last 12 weeks)">
            {hoursByWeek.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hoursByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Regular" stackId="a" fill="#0EA5E9" />
                  <Bar dataKey="Overtime" stackId="a" fill="#F59E0B" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card title="PTO hours by type (12 mo)">
            {ptoByType.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={ptoByType} dataKey="value" nameKey="name" outerRadius={90} label>
                    {ptoByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="recruiting" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Candidate funnel">
              {candidates.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={candFunnel} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0EA5E9" radius={[0,6,6,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Source mix">
              {sourceMix.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={sourceMix} dataKey="value" nameKey="name" outerRadius={90} label>
                      {sourceMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, icon: Icon, tone }: { label: string; value: any; icon: any; tone?: "warning" | "success" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${tone === "warning" ? "text-amber-600" : tone === "success" ? "text-emerald-600" : ""}`} /> {label}
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="grid h-60 place-items-center text-sm text-slate-400">No data yet.</div>;
}
