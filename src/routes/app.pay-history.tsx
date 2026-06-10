import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/payroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  History, Search, Download, ChevronRight, Calendar, Users, DollarSign, TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/app/pay-history")({
  head: () => ({ meta: [{ title: "Pay history — Paylo" }] }),
  component: PayHistoryPage,
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
  gross_pay: number;
  federal_tax: number;
  social_security: number;
  medicare: number;
  state_tax: number;
  net_pay: number;
  regular_hours: number;
  overtime_hours: number;
  run_id: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PayHistoryPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");
  const [selected, setSelected] = useState<Run | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("payroll_runs")
        .select("*")
        .order("pay_date", { ascending: false });
      setRuns((data as Run[]) ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selected) { setItems([]); return; }
    (async () => {
      setItemsLoading(true);
      const { data } = await supabase
        .from("payroll_items")
        .select("*")
        .eq("run_id", selected.id)
        .order("employee_name");
      setItems((data as Item[]) ?? []);
      setItemsLoading(false);
    })();
  }, [selected]);

  const years = useMemo(() => {
    const set = new Set(runs.map((r) => new Date(r.pay_date).getFullYear().toString()));
    return ["all", ...Array.from(set).sort().reverse()];
  }, [runs]);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (year !== "all" && new Date(r.pay_date).getFullYear().toString() !== year) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        fmtDate(r.pay_date).toLowerCase().includes(q) ||
        fmtDate(r.period_start).toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });
  }, [runs, query, year]);

  const totals = useMemo(() => {
    const gross = filtered.reduce((s, r) => s + (r.gross_total ?? 0), 0);
    const tax = filtered.reduce((s, r) => s + (r.tax_total ?? 0), 0);
    const net = filtered.reduce((s, r) => s + (r.net_total ?? 0), 0);
    return { gross, tax, net, count: filtered.length };
  }, [filtered]);

  function exportCsv() {
    const rows = [
      ["Pay date", "Period start", "Period end", "Status", "Gross", "Taxes", "Net"],
      ...filtered.map((r) => [
        fmtDate(r.pay_date), fmtDate(r.period_start), fmtDate(r.period_end),
        r.status, (r.gross_total ?? 0).toFixed(2), (r.tax_total ?? 0).toFixed(2), r.net_total.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pay-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function downloadRun(r: Run) {
    const { data } = await supabase.from("payroll_items").select("*").eq("run_id", r.id).order("employee_name");
    const items = (data ?? []) as Item[];
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

  return (
    <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            Pay history
          </h1>
          <p className="text-slate-500 mt-1">All your past payroll runs, in one place.</p>
        </div>
        <Button onClick={exportCsv} disabled={!filtered.length} className="gap-2 bg-primary text-slate-900 hover:bg-primary/90 rounded-xl">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryTile icon={Calendar} label="Runs" value={String(totals.count)} />
        <SummaryTile icon={DollarSign} label="Gross paid" value={fmtUSD(totals.gross)} />
        <SummaryTile icon={TrendingUp} label="Taxes withheld" value={fmtUSD(totals.tax)} />
        <SummaryTile icon={Users} label="Net to employees" value={fmtUSD(totals.net)} highlight />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border p-4 rounded-2xl">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by date or status"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white border-border rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
                year === y
                  ? "bg-primary text-slate-900 shadow-sm"
                  : "bg-surface text-slate-500 hover:bg-surface/80"
              }`}
            >
              {y === "all" ? "All years" : y}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading history…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <History className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-900">No payroll runs yet</p>
            <p className="text-sm text-slate-500 mt-1">Once you run payroll, everything will show up here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            <div className="hidden md:grid grid-cols-[1.2fr_1.4fr_0.8fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-surface">
              <div>Pay date</div><div>Period</div><div>Status</div>
              <div className="text-right">Gross</div><div className="text-right">Taxes</div><div className="text-right">Net</div><div />
            </div>
            {filtered.map((r) => (
              <div
                key={r.id}
                className="group grid grid-cols-2 md:grid-cols-[1.2fr_1.4fr_0.8fr_1fr_1fr_1fr_auto] gap-x-4 gap-y-1 px-5 py-5 hover:bg-surface transition cursor-pointer"
                onClick={() => setSelected(r)}
              >
                <div className="text-left font-semibold text-slate-900">{fmtDate(r.pay_date)}</div>
                <div className="text-sm text-slate-500">
                  {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                </div>
                <div>
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                    r.status === "approved" || r.status === "completed"
                      ? "bg-primary/15 text-emerald-700"
                      : r.status === "draft"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-red-50 text-red-600"
                  }`}>{r.status}</span>
                </div>
                <div className="text-right tabular-nums text-slate-700">{fmtUSD(r.gross_total ?? 0)}</div>
                <div className="text-right tabular-nums text-slate-500">{fmtUSD(r.tax_total ?? 0)}</div>
                <div className="text-right tabular-nums font-bold text-slate-900">{fmtUSD(r.net_total)}</div>
                <div className="flex items-center gap-1 self-center">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Download CSV"
                    onClick={(e) => { e.stopPropagation(); downloadRun(r); }}
                    className="h-9 w-9 text-slate-500 hover:text-slate-900 hover:bg-surface rounded-xl"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-900 group-hover:translate-x-1 transition" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900">Payroll on {fmtDate(selected.pay_date)}</DialogTitle>
                <DialogDescription className="text-slate-500">
                  Pay period {fmtDate(selected.period_start)} – {fmtDate(selected.period_end)} · {items.length} employee{items.length === 1 ? "" : "s"}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-3 my-4">
                <MiniTile label="Gross" value={fmtUSD(selected.gross_total ?? 0)} />
                <MiniTile label="Taxes" value={fmtUSD(selected.tax_total ?? 0)} />
                <MiniTile label="Net" value={fmtUSD(selected.net_total)} highlight />
              </div>

              {itemsLoading ? (
                <div className="text-center py-8 text-slate-500">Loading employees…</div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2">Employee</th>
                        <th className="text-right px-3 py-2">Hours</th>
                        <th className="text-right px-3 py-2">Gross</th>
                        <th className="text-right px-3 py-2">Taxes</th>
                        <th className="text-right px-3 py-2">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => {
                        const tax = it.federal_tax + it.social_security + it.medicare + it.state_tax;
                        return (
                          <tr key={it.id} className="border-t border-border/40">
                            <td className="px-3 py-2 font-medium text-slate-900">{it.employee_name}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{(it.regular_hours ?? 0) + (it.overtime_hours ?? 0) || "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtUSD(it.gross_pay)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtUSD(tax)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{fmtUSD(it.net_pay)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`bg-card border border-border rounded-2xl p-5 ${highlight ? "ring-1 ring-primary/40" : ""}`}>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`text-3xl font-extrabold mt-2 tabular-nums ${highlight ? "text-primary" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function MiniTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-3 bg-card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${highlight ? "text-primary" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}
