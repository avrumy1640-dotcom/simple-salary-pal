import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: "Reports — Paylo" }] }),
  component: ReportsPage,
});

interface Run {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  gross_total: number;
  tax_total: number;
  net_total: number;
  status: string;
}

function ReportsPage() {
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    supabase.from("payroll_runs").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      setRuns((data ?? []) as Run[]);
    });
  }, []);

  async function exportRun(id: string) {
    const { data } = await supabase.from("payroll_items").select("*").eq("run_id", id);
    if (!data || data.length === 0) return;
    const headers = ["Employee", "Regular hours", "Overtime hours", "Gross", "Federal tax", "Social security", "Medicare", "State tax", "Net pay"];
    const rows = data.map((d) => [
      d.employee_name, d.regular_hours, d.overtime_hours, d.gross_pay, d.federal_tax, d.social_security, d.medicare, d.state_tax, d.net_pay,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payroll-${id.slice(0, 8)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Past payroll runs and exports.</p>
      </div>

      <div className="rounded-2xl border bg-card">
        {runs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No payroll runs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Period</th>
                  <th className="px-3 py-3">Pay date</th>
                  <th className="px-3 py-3">Gross</th>
                  <th className="px-3 py-3">Taxes</th>
                  <th className="px-3 py-3">Net</th>
                  <th className="px-5 py-3 text-right">Export</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-5 py-3 font-medium">{r.period_start} → {r.period_end}</td>
                    <td className="px-3 py-3">{r.pay_date}</td>
                    <td className="px-3 py-3">{fmtUSD(r.gross_total)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{fmtUSD(r.tax_total)}</td>
                    <td className="px-3 py-3 font-medium">{fmtUSD(r.net_total)}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" className="gap-2" onClick={() => exportRun(r.id)}>
                        <Download className="h-4 w-4" /> CSV
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
