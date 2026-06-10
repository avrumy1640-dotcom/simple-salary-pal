import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/payroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PlayCircle, CalendarClock, Users, Wallet, TrendingUp, Search, Download,
  ChevronDown, ChevronRight, CheckCircle2, Clock, ArrowUpRight, FileText,
} from "lucide-react";
import { useCompany } from "@/hooks/useCompany";

export const Route = createFileRoute("/app/payroll/")({
  head: () => ({ meta: [{ title: "Payroll — Paylo" }] }),
  component: PayrollOverview,
});

interface Run {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  gross_total: number | null;
  tax_total: number | null;
  net_total: number;
  status: string;
  created_at: string;
}
interface Item {
  id: string;
  employee_name: string;
  regular_hours: number | null;
  overtime_hours: number | null;
  gross_pay: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  net_pay: number;
  run_id: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatChip({ label, value, tone }: { label: string; value: string | number; tone: "active" | "muted" | "accent" | "amber" }) {
  const tones = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    muted: "bg-slate-50 text-slate-600 ring-slate-200",
    accent: "bg-primary/10 text-primary ring-primary/30",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
  } as const;
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 ring-1 text-sm ${tones[tone]}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-xs font-medium opacity-80">{label}</span>
    </div>
  );
}

function PayrollOverview() {
  const { currentId } = useCompany();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [activeEmps, setActiveEmps] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsByRun, setItemsByRun] = useState<Record<string, Item[]>>({});

  useEffect(() => {
    if (!currentId) return;
    (async () => {
      setLoading(true);
      const [{ data: rs }, { count: empCount }] = await Promise.all([
        supabase.from("payroll_runs").select("*").eq("company_id", currentId).order("pay_date", { ascending: false }),
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("company_id", currentId).eq("status", "active"),
      ]);
      setRuns((rs as Run[]) ?? []);
      setActiveEmps(empCount ?? 0);
      setLoading(false);
    })();
  }, [currentId]);

  const years = useMemo(() => {
    const set = new Set(runs.map((r) => new Date(r.pay_date).getFullYear().toString()));
    return ["all", ...Array.from(set).sort().reverse()];
  }, [runs]);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (year !== "all" && new Date(r.pay_date).getFullYear().toString() !== year) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        fmtDate(r.pay_date).toLowerCase().includes(q) ||
        fmtDate(r.period_start).toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });
  }, [runs, query, year, status]);

  // YTD + next pay info
  const now = new Date();
  const ytdRuns = useMemo(
    () => runs.filter((r) => new Date(r.pay_date).getFullYear() === now.getFullYear()),
    [runs],
  );
  const ytdGross = ytdRuns.reduce((s, r) => s + (r.gross_total ?? 0), 0);
  const ytdNet = ytdRuns.reduce((s, r) => s + (r.net_total ?? 0), 0);
  const ytdTax = ytdRuns.reduce((s, r) => s + (r.tax_total ?? 0), 0);
  const lastRun = runs[0];
  const draftRuns = runs.filter((r) => r.status === "draft").length;

  // Next pay: estimate based on most recent pay_date + 14 days, or today + 5
  const nextPayDate = useMemo(() => {
    if (lastRun) {
      const d = new Date(lastRun.pay_date);
      d.setDate(d.getDate() + 14);
      if (d > now) return d;
    }
    const d = new Date(now);
    d.setDate(d.getDate() + 5);
    return d;
  }, [lastRun]);

  async function toggleExpand(r: Run) {
    if (expandedId === r.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(r.id);
    if (!itemsByRun[r.id] && currentId) {
      const { data } = await supabase
        .from("payroll_items").select("*").eq("company_id", currentId).eq("run_id", r.id).order("employee_name");
      setItemsByRun((prev) => ({ ...prev, [r.id]: (data as Item[]) ?? [] }));
    }
  }

  async function downloadRun(r: Run) {
    let items = itemsByRun[r.id];
    if (!items) {
      if (!currentId) return;
      const { data } = await supabase.from("payroll_items").select("*").eq("company_id", currentId).eq("run_id", r.id).order("employee_name");
      items = (data as Item[]) ?? [];
    }
    const rows = [
      ["Employee", "Reg hrs", "OT hrs", "Gross", "Federal", "SS", "Medicare", "State", "Net"],
      ...items.map((it) => [
        it.employee_name,
        String(it.regular_hours ?? 0),
        String(it.overtime_hours ?? 0),
        it.gross_pay.toFixed(2),
        it.federal_tax.toFixed(2),
        it.social_security.toFixed(2),
        it.medicare.toFixed(2),
        it.state_tax.toFixed(2),
        it.net_pay.toFixed(2),
      ]),
      [],
      ["TOTAL", "", "", (r.gross_total ?? 0).toFixed(2), "", "", "", "", r.net_total.toFixed(2)],
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payroll-${r.pay_date}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function statusPill(s: string) {
    const map: Record<string, string> = {
      approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      draft: "bg-amber-50 text-amber-700 ring-amber-200",
      pending: "bg-amber-50 text-amber-700 ring-amber-200",
      failed: "bg-red-50 text-red-700 ring-red-200",
    };
    const cls = map[s] ?? "bg-slate-50 text-slate-700 ring-slate-200";
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cls}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </span>
    );
  }

  return (
    <div className="space-y-8 unit-scope unit-in">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[34px] font-bold tracking-tight text-slate-900 leading-none">Payroll</h1>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              {runs.length} run{runs.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Review past payrolls, track YTD totals, and run the next one in minutes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/app/pay-history">
              <FileText className="h-4 w-4 mr-2" /> Full history
            </Link>
          </Button>
          <Button asChild size="lg" className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-sm">
            <Link to="/app/payroll/run">
              <PlayCircle className="h-5 w-5 mr-2" /> Run payroll
            </Link>
          </Button>
        </div>
      </header>

      {/* Stat chips */}
      <div className="flex flex-wrap items-center gap-2">
        <StatChip label="Active employees" value={activeEmps} tone="accent" />
        <StatChip label="Runs YTD" value={ytdRuns.length} tone="muted" />
        <StatChip label={`${now.getFullYear()} gross`} value={fmtUSD(ytdGross)} tone="active" />
        <StatChip label={`${now.getFullYear()} taxes`} value={fmtUSD(ytdTax)} tone="muted" />
        {draftRuns > 0 && <StatChip label="Drafts" value={draftRuns} tone="amber" />}
      </div>

      {/* Hero cards: Next payroll + Last payroll + YTD net */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        {/* Next payroll — big CTA */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-card">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
            <CalendarClock className="h-4 w-4" /> Next payroll
          </div>
          <div className="mt-4 text-[36px] font-bold leading-none tracking-tight">
            {nextPayDate.toLocaleDateString("en-US", { weekday: "long" })}
          </div>
          <div className="mt-1 text-lg text-slate-300">
            {nextPayDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm text-slate-300">
            <Users className="h-4 w-4" />
            <span>{activeEmps} active {activeEmps === 1 ? "person" : "people"} ready to pay</span>
          </div>
          <div className="mt-6">
            <Button asChild size="lg" className="rounded-xl bg-white text-slate-900 hover:bg-slate-100">
              <Link to="/app/payroll/run">
                <PlayCircle className="h-5 w-5 mr-2" /> Start payroll
              </Link>
            </Button>
          </div>
        </div>

        {/* Last payroll */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <CheckCircle2 className="h-4 w-4" /> Last payroll
          </div>
          {lastRun ? (
            <>
              <div className="mt-4 text-[28px] font-bold leading-none tabular-nums text-slate-900">
                {fmtUSD(lastRun.net_total)}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Paid {fmtDate(lastRun.pay_date)}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {fmtDateShort(lastRun.period_start)} – {fmtDateShort(lastRun.period_end)}
              </div>
              <div className="mt-5">{statusPill(lastRun.status)}</div>
            </>
          ) : (
            <div className="mt-6 text-sm text-slate-500">No payroll runs yet.</div>
          )}
        </div>

        {/* YTD net */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <TrendingUp className="h-4 w-4" /> {now.getFullYear()} net to team
          </div>
          <div className="mt-4 text-[28px] font-bold leading-none tabular-nums text-slate-900">
            {fmtUSD(ytdNet)}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Across {ytdRuns.length} run{ytdRuns.length === 1 ? "" : "s"}
          </div>
          <div className="mt-5 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Wallet className="h-3.5 w-3.5" /> Take-home delivered
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by date or status"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 border-slate-200 rounded-xl"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px] rounded-xl border-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-[140px] rounded-xl border-slate-200"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>{y === "all" ? "All years" : y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* History table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Payroll history</div>
            <div className="text-xs text-slate-500">{filtered.length} run{filtered.length === 1 ? "" : "s"} shown · click to expand</div>
          </div>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-900">No payroll runs found</p>
            <p className="text-sm text-slate-500 mt-1">Run your first payroll to get started.</p>
            <Button asChild className="mt-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
              <Link to="/app/payroll/run"><PlayCircle className="h-4 w-4 mr-2" /> Run payroll</Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="hidden md:grid grid-cols-[1.2fr_1.4fr_0.9fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 bg-slate-50/70">
              <div>Pay date</div><div>Period</div><div>Status</div>
              <div className="text-right">Gross</div><div className="text-right">Taxes</div><div className="text-right">Net</div><div />
            </div>
            {filtered.map((r) => {
              const isOpen = expandedId === r.id;
              const items = itemsByRun[r.id];
              return (
                <div key={r.id}>
                  <button
                    onClick={() => toggleExpand(r)}
                    className="group grid w-full grid-cols-2 md:grid-cols-[1.2fr_1.4fr_0.9fr_1fr_1fr_1fr_auto] gap-x-4 gap-y-1 px-5 py-4 text-left transition hover:bg-slate-50"
                  >
                    <div className="font-semibold text-slate-900">{fmtDate(r.pay_date)}</div>
                    <div className="text-sm text-slate-500">
                      {fmtDateShort(r.period_start)} – {fmtDateShort(r.period_end)}
                    </div>
                    <div>{statusPill(r.status)}</div>
                    <div className="text-right tabular-nums text-slate-700">{fmtUSD(r.gross_total ?? 0)}</div>
                    <div className="text-right tabular-nums text-slate-500">{fmtUSD(r.tax_total ?? 0)}</div>
                    <div className="text-right tabular-nums font-bold text-slate-900">{fmtUSD(r.net_total)}</div>
                    <div className="flex items-center gap-1 self-center justify-end">
                      <Button
                        size="icon" variant="ghost" title="Download CSV"
                        onClick={(e) => { e.stopPropagation(); downloadRun(r); }}
                        className="h-9 w-9 text-slate-500 hover:text-slate-900 rounded-lg"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-5">
                      {!items ? (
                        <div className="py-6 text-center text-sm text-slate-500">Loading employees…</div>
                      ) : items.length === 0 ? (
                        <div className="py-6 text-center text-sm text-slate-500">No employee records found for this run.</div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500">
                              <tr>
                                <th className="text-left px-4 py-2.5 font-semibold">Employee</th>
                                <th className="text-right px-4 py-2.5 font-semibold">Reg hrs</th>
                                <th className="text-right px-4 py-2.5 font-semibold">OT hrs</th>
                                <th className="text-right px-4 py-2.5 font-semibold">Gross</th>
                                <th className="text-right px-4 py-2.5 font-semibold">Taxes</th>
                                <th className="text-right px-4 py-2.5 font-semibold">Net</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {items.map((it) => {
                                const tax = it.federal_tax + it.social_security + it.medicare + it.state_tax;
                                return (
                                  <tr key={it.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2.5 font-medium text-slate-900">{it.employee_name}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{it.regular_hours ?? 0}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{it.overtime_hours ?? 0}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtUSD(it.gross_pay)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{fmtUSD(tax)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">{fmtUSD(it.net_pay)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="mt-4 flex justify-end">
                        <Button asChild variant="outline" size="sm" className="rounded-lg">
                          <Link to="/app/pay-history">
                            Open in pay history <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
