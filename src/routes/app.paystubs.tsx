import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/payroll";
import { Button } from "@/components/ui/button";
import { Receipt, Download, Banknote, AlertTriangle } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { downloadPaystubPdf, downloadAchCsv } from "@/lib/paystub-export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/paystubs")({
  head: () => ({ meta: [{ title: "Pay stubs & ACH — Paylo" }] }),
  component: PayStubsPage,
});

interface Item {
  id: string;
  employee_id: string;
  employee_name: string;
  gross_pay: number;
  federal_tax: number;
  social_security: number;
  medicare: number;
  state_tax: number;
  net_pay: number;
  run_id: string;
  regular_hours?: number | null;
  overtime_hours?: number | null;
}
interface Run { id: string; period_start: string; period_end: string; pay_date: string; net_total: number; status: string }
interface Company { legal_name: string | null; ein: string | null; address_line1: string | null; address_line2: string | null }
interface Emp { id: string; full_name: string; address_line1: string | null; city: string | null; state: string | null; zip: string | null; bank_routing_last4: string | null; bank_account_last4: string | null; bank_account_type: string | null }

function PayStubsPage() {
  const { currentId } = useCompany();
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Map<string, Emp>>(new Map());
  const [company, setCompany] = useState<Company | null>(null);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!currentId) return;
    (async () => {
      const [{ data: r }, { data: c }, { data: emps }] = await Promise.all([
        supabase.from("payroll_runs").select("id, period_start, period_end, pay_date, net_total, status").eq("company_id", currentId).order("pay_date", { ascending: false }),
        supabase.from("companies").select("legal_name, ein, address_line1, address_line2").eq("id", currentId).maybeSingle(),
        supabase.from("employees").select("id, full_name, address_line1, city, state, zip, bank_routing_last4, bank_account_last4, bank_account_type").eq("company_id", currentId),
      ]);
      setRuns((r ?? []) as Run[]);
      setCompany((c ?? null) as Company | null);
      setEmployees(new Map((emps ?? []).map((e) => [e.id as string, e as Emp])));
      if (r && r.length) setActiveRun(r[0].id);
    })();
  }, [currentId]);

  useEffect(() => {
    if (!activeRun || !currentId) return;
    (async () => {
      const { data } = await supabase
        .from("payroll_items")
        .select("id, employee_id, employee_name, gross_pay, federal_tax, social_security, medicare, state_tax, net_pay, run_id, regular_hours, overtime_hours")
        .eq("company_id", currentId)
        .eq("run_id", activeRun);
      setItems((data ?? []) as Item[]);
    })();
  }, [activeRun, currentId]);

  const companyAddress =
    company ? [company.address_line1, company.address_line2].filter(Boolean).join(", ") || null : null;

  async function ytdFor(empId: string, payDateIso: string) {
    if (!currentId) return null;
    const year = payDateIso.slice(0, 4);
    const { data } = await supabase
      .from("payroll_items")
      .select("gross_pay, federal_tax, social_security, medicare, state_tax, net_pay, payroll_runs!inner(pay_date)")
      .eq("company_id", currentId)
      .eq("employee_id", empId);
    const ytd = { gross: 0, fed: 0, ss: 0, med: 0, state: 0, net: 0 };
    for (const row of (data ?? []) as any[]) {
      const pd = row.payroll_runs?.pay_date as string | undefined;
      if (!pd || !pd.startsWith(year) || pd > payDateIso) continue;
      ytd.gross += Number(row.gross_pay);
      ytd.fed += Number(row.federal_tax);
      ytd.ss += Number(row.social_security);
      ytd.med += Number(row.medicare);
      ytd.state += Number(row.state_tax);
      ytd.net += Number(row.net_pay);
    }
    return ytd;
  }

  async function downloadStub(it: Item) {
    const run = runs.find((r) => r.id === it.run_id);
    if (!run) return;
    setBusy(it.id);
    try {
      const emp = employees.get(it.employee_id);
      const empAddr = emp
        ? [emp.address_line1, [emp.city, emp.state, emp.zip].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
        : null;
      const ytd = await ytdFor(it.employee_id, run.pay_date);
      await downloadPaystubPdf({
        employee_name: it.employee_name,
        employee_address: empAddr,
        pay_date: run.pay_date,
        period_start: run.period_start,
        period_end: run.period_end,
        company_name: company?.legal_name || "Payroll",
        company_address: companyAddress,
        company_ein: company?.ein || null,
        regular_hours: it.regular_hours ?? null,
        overtime_hours: it.overtime_hours ?? null,
        gross_pay: Number(it.gross_pay),
        federal_tax: Number(it.federal_tax),
        social_security: Number(it.social_security),
        medicare: Number(it.medicare),
        state_tax: Number(it.state_tax),
        net_pay: Number(it.net_pay),
        ytd,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate paystub");
    } finally {
      setBusy(null);
    }
  }

  function downloadAchBatch() {
    if (!activeRun) return;
    const run = runs.find((r) => r.id === activeRun);
    if (!run) return;
    downloadAchCsv({
      company_name: company?.legal_name || "Payroll",
      pay_date: run.pay_date,
      lines: items.map((i) => {
        const emp = employees.get(i.employee_id);
        return {
          employee_name: i.employee_name,
          routing_last4: emp?.bank_routing_last4 ?? null,
          account_last4: emp?.bank_account_last4 ?? null,
          account_type: emp?.bank_account_type ?? "checking",
          net_pay: Number(i.net_pay),
        };
      }),
    });
    toast.success("ACH batch CSV downloaded");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Pay stubs & direct deposit</h1>
        <p className="text-sm text-muted-foreground">Download per-employee pay stubs (PDF) and export the ACH batch for your bank.</p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>Taxes and net pay shown are <strong>estimates for reference only</strong> and not certified by a CPA. Verify with your accountant before filing. Year-end W-2s are generated from the <Link to="/app/tax-year" className="font-semibold underline">Tax year forms</Link> page.</p>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium flex items-center gap-2"><Receipt className="h-4 w-4" /> Payroll runs</div>
        {runs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No payroll runs yet. Process payroll first to see pay stubs here.</div>
        ) : (
          <div className="divide-y">
            {runs.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveRun(r.id)}
                className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-muted/40 ${activeRun === r.id ? "bg-muted/60" : ""}`}
              >
                <div>
                  <div className="font-medium">Pay date {r.pay_date}</div>
                  <div className="text-xs text-muted-foreground">{r.period_start} → {r.period_end} · {r.status}</div>
                </div>
                <div className="font-semibold">{fmtUSD(r.net_total)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {activeRun && (
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="text-sm font-medium">Employee pay stubs</div>
            <Button size="sm" onClick={downloadAchBatch} disabled={!items.length} className="rounded-full gap-1.5 bg-primary text-background hover:bg-foreground/90">
              <Banknote className="h-3.5 w-3.5" /> Export ACH batch (CSV)
            </Button>
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No items for this run.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-3 py-3">Gross</th>
                    <th className="px-3 py-3">Taxes</th>
                    <th className="px-3 py-3">Net</th>
                    <th className="px-5 py-3 text-right">Stub</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-5 py-3 font-medium">{it.employee_name}</td>
                      <td className="px-3 py-3">{fmtUSD(it.gross_pay)}</td>
                      <td className="px-3 py-3">{fmtUSD(it.federal_tax + it.social_security + it.medicare + it.state_tax)}</td>
                      <td className="px-3 py-3 font-semibold">{fmtUSD(it.net_pay)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="outline" className="rounded-full gap-1" disabled={busy === it.id} onClick={() => downloadStub(it)}>
                          <Download className="h-3.5 w-3.5" /> {busy === it.id ? "…" : "PDF"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
