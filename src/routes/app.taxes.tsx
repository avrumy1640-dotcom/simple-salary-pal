import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/payroll";
import { FileBadge, ArrowRight, Calendar, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";

export const Route = createFileRoute("/app/taxes")({
  head: () => ({ meta: [{ title: "Taxes & forms — Paylo" }] }),
  component: TaxesPage,
});

interface EmpTotal { employee_id: string; employee_name: string; gross: number; federal: number; ss: number; medicare: number; state: number; net: number }

function TaxesPage() {
  const { currentId } = useCompany();
  const year = new Date().getFullYear();
  const [totals, setTotals] = useState<EmpTotal[]>([]);
  const [qtrTotals, setQtrTotals] = useState<{ q: number; gross: number; fed: number; fica: number }[]>([]);

  useEffect(() => {
    if (!currentId) return;
    (async () => {
      const { data: items } = await supabase.from("payroll_items").select("employee_id, employee_name, gross_pay, federal_tax, social_security, medicare, state_tax, net_pay, run_id").eq("company_id", currentId);
      const { data: runs } = await supabase.from("payroll_runs").select("id, pay_date").eq("company_id", currentId);
      const runMap = new Map((runs ?? []).map((r) => [r.id as string, r.pay_date as string]));
      const byEmp = new Map<string, EmpTotal>();
      const byQtr = new Map<number, { gross: number; fed: number; fica: number }>();
      (items ?? []).forEach((i) => {
        const payDate = runMap.get((i as { run_id: string }).run_id);
        if (!payDate || !payDate.startsWith(String(year))) return;
        const id = i.employee_id as string;
        const cur = byEmp.get(id) ?? { employee_id: id, employee_name: i.employee_name as string, gross: 0, federal: 0, ss: 0, medicare: 0, state: 0, net: 0 };
        cur.gross += Number(i.gross_pay);
        cur.federal += Number(i.federal_tax);
        cur.ss += Number(i.social_security);
        cur.medicare += Number(i.medicare);
        cur.state += Number(i.state_tax);
        cur.net += Number(i.net_pay);
        byEmp.set(id, cur);
        const month = Number(payDate.slice(5, 7));
        const q = Math.ceil(month / 3);
        const qc = byQtr.get(q) ?? { gross: 0, fed: 0, fica: 0 };
        qc.gross += Number(i.gross_pay);
        qc.fed += Number(i.federal_tax);
        qc.fica += Number(i.social_security) + Number(i.medicare);
        byQtr.set(q, qc);
      });
      setTotals(Array.from(byEmp.values()));
      setQtrTotals([1, 2, 3, 4].map((q) => ({ q, ...(byQtr.get(q) ?? { gross: 0, fed: 0, fica: 0 }) })));
    })();
  }, [year, currentId]);

  // W-2 generation has moved to the dedicated Tax Year forms flow
  // (/app/tax-year), which produces real substitute statements with proper
  // Box 12 / state-line aggregation and an SSA EFW2 export.


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Taxes & forms</h1>
        <p className="text-sm text-muted-foreground">Year-to-date tax summary and year-end forms for your team.</p>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" /> {year} quarterly totals</div>
        <div className="grid gap-3 p-5 grid-cols-2 lg:grid-cols-4">
          {qtrTotals.map((q) => (
            <div key={q.q} className="rounded-xl border bg-background p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Q{q.q}</div>
              <div className="mt-2 text-xl font-bold">{fmtUSD(q.gross)}</div>
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <div>Federal w/h: {fmtUSD(q.fed)}</div>
                <div>FICA: {fmtUSD(q.fica)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t bg-accent/30 px-5 py-3 text-xs text-foreground/80">
          <Info className="h-3.5 w-3.5 mt-0.5 text-foreground flex-shrink-0" />
          <span>Use these totals when filing your quarterly <span className="font-medium">Form 941</span> (Employer's Quarterly Federal Tax Return).</span>
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="text-sm font-medium flex items-center gap-2"><FileBadge className="h-4 w-4" /> {year} W-2 previews</div>
          <Button asChild size="sm" variant="outline" className="rounded-full gap-1">
            <Link to="/app/tax-year">Generate official W-2s <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </div>
        {totals.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No payroll runs in {year} yet. Once you run payroll, W-2 previews will appear here.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-3 py-3">Gross wages</th>
                  <th className="px-3 py-3">Federal</th>
                  <th className="px-3 py-3">FICA</th>
                  <th className="px-3 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.employee_id} className="border-t">
                    <td className="px-5 py-3 font-medium">{t.employee_name}</td>
                    <td className="px-3 py-3">{fmtUSD(t.gross)}</td>
                    <td className="px-3 py-3">{fmtUSD(t.federal)}</td>
                    <td className="px-3 py-3">{fmtUSD(t.ss + t.medicare)}</td>
                    <td className="px-3 py-3">{fmtUSD(t.state)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t bg-accent/20 px-5 py-3 text-xs text-foreground/70">
              These are running totals — generate the official substitute W-2 PDFs and the SSA EFW2 export from the <Link to="/app/tax-year" className="font-semibold underline">Tax year forms</Link> page.
            </div>
          </div>
        )}
      </div>


      <div className="grid gap-3 md:grid-cols-3">
        <FormCard title="Form 941" desc="Quarterly federal tax return. File 4× per year." due="Apr 30 · Jul 31 · Oct 31 · Jan 31" />
        <FormCard title="W-2" desc="Annual wage statement for each W-2 employee." due="January 31 each year" />
        <FormCard title="W-4" desc="Each employee's withholding choices. Keep on file." due="At hire & on update" />
      </div>
    </div>
  );
}

function FormCard({ title, desc, due }: { title: string; desc: string; due: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-foreground">{title}</div>
      <p className="mt-3 text-sm">{desc}</p>
      <p className="mt-2 text-xs text-muted-foreground">Due: {due}</p>
    </div>
  );
}
