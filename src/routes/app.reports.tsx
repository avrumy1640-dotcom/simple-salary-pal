import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Download, FileText, Users, DollarSign, Calendar, Clock, FileBadge,
  TrendingUp, PieChart, Briefcase, HeartHandshake, ChevronRight,
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

  useEffect(() => {
    (async () => {
      const [{ data: r }, { count }] = await Promise.all([
        supabase.from("payroll_runs").select("*").order("created_at", { ascending: false }).limit(10),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
      ]);
      setRuns((r ?? []) as Run[]);
      setEmpCount(count ?? 0);
    })();
  }, []);

  async function exportRun(id: string) {
    const { data } = await supabase.from("payroll_items").select("*").eq("run_id", id);
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
    const { data } = await supabase.from("employees").select("*");
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
    <div className="space-y-6 animate-in fade-in duration-300">
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <PieChart className="h-7 w-7 text-primary" />
          Reports
        </h1>
        <p className="text-muted-foreground mt-1">Everything you need to understand your payroll at a glance.</p>
      </header>

      {/* Year-to-date overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile icon={DollarSign} label="Gross paid" value={fmtUSD(ytd.gross)} />
        <KpiTile icon={TrendingUp} label="Taxes withheld" value={fmtUSD(ytd.tax)} />
        <KpiTile icon={Users} label="Net to employees" value={fmtUSD(ytd.net)} highlight />
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

      {/* Recent runs quick export */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent payroll exports</h2>
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
                        Period {new Date(r.period_start).toLocaleDateString()} – {new Date(r.period_end).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-semibold tabular-nums">{fmtUSD(r.net_total)}</div>
                      <div className="text-xs text-muted-foreground">net</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => exportRun(r.id)} className="gap-2">
                      <Download className="h-4 w-4" /> CSV
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
    <div className={`surface-glass rounded-xl p-4 ${highlight ? "ring-1 ring-primary/30" : ""}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
