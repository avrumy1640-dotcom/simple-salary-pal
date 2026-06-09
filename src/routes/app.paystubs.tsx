import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/payroll";
import { Button } from "@/components/ui/button";
import { Receipt, Download, Banknote } from "lucide-react";

export const Route = createFileRoute("/app/paystubs")({
  head: () => ({ meta: [{ title: "Pay stubs & ACH — Paylo" }] }),
  component: PayStubsPage,
});

interface Item {
  id: string;
  employee_name: string;
  gross_pay: number;
  federal_tax: number;
  social_security: number;
  medicare: number;
  state_tax: number;
  net_pay: number;
  run_id: string;
}
interface Run { id: string; period_start: string; period_end: string; pay_date: string; net_total: number; status: string }

function PayStubsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase.from("payroll_runs").select("id, period_start, period_end, pay_date, net_total, status").order("pay_date", { ascending: false });
      setRuns((r ?? []) as Run[]);
      if (r && r.length) setActiveRun(r[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!activeRun) return;
    (async () => {
      const { data } = await supabase.from("payroll_items").select("*").eq("run_id", activeRun);
      setItems((data ?? []) as Item[]);
    })();
  }, [activeRun]);

  function downloadStub(it: Item) {
    const run = runs.find((r) => r.id === it.run_id);
    const total = it.federal_tax + it.social_security + it.medicare + it.state_tax;
    const lines = [
      `PAY STUB`,
      `Pay date: ${run?.pay_date ?? "-"}`,
      `Period:   ${run?.period_start ?? "-"} → ${run?.period_end ?? "-"}`,
      ``,
      `Employee: ${it.employee_name}`,
      ``,
      `EARNINGS`,
      `  Gross pay ............ ${fmtUSD(it.gross_pay)}`,
      ``,
      `TAXES WITHHELD`,
      `  Federal income tax ... ${fmtUSD(it.federal_tax)}`,
      `  Social Security ...... ${fmtUSD(it.social_security)}`,
      `  Medicare ............. ${fmtUSD(it.medicare)}`,
      `  State income tax ..... ${fmtUSD(it.state_tax)}`,
      `  ───────────────────────────────`,
      `  Total withheld ....... ${fmtUSD(total)}`,
      ``,
      `NET PAY .............. ${fmtUSD(it.net_pay)}`,
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `paystub-${it.employee_name.replace(/\s+/g, "_")}-${run?.pay_date ?? "stub"}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function downloadAchBatch() {
    if (!activeRun) return;
    const run = runs.find((r) => r.id === activeRun);
    const { data: emps } = await supabase.from("employees").select("id, full_name, bank_routing_last4, bank_account_last4");
    const empMap = new Map((emps ?? []).map((e) => [e.id as string, e]));
    const { data: rich } = await supabase.from("payroll_items").select("employee_id, employee_name, net_pay").eq("run_id", activeRun);

    const header = `ACH BATCH FILE (preview — not a NACHA-formatted file)`;
    const meta = `Pay date: ${run?.pay_date ?? "-"} | Items: ${(rich ?? []).length} | Total net: ${fmtUSD(run?.net_total ?? 0)}`;
    const body = (rich ?? []).map((i, idx) => {
      const emp = empMap.get(i.employee_id as string);
      return `${String(idx + 1).padStart(3, "0")}  ${(i.employee_name as string).padEnd(28)}  routing •${emp?.bank_routing_last4 ?? "----"}  acct •${emp?.bank_account_last4 ?? "----"}  ${fmtUSD(Number(i.net_pay))}`;
    }).join("\n");
    const out = [header, meta, "", body].join("\n");
    const blob = new Blob([out], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ach-batch-${run?.pay_date ?? "run"}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Pay stubs & direct deposit</h1>
        <p className="text-sm text-muted-foreground">Download per-employee pay stubs and export the ACH batch for your bank.</p>
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
            <Button size="sm" onClick={downloadAchBatch} className="rounded-full gap-1.5 bg-[#2563EB] text-background hover:bg-foreground/90">
              <Banknote className="h-3.5 w-3.5" /> Export ACH batch
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
                        <Button size="sm" variant="outline" className="rounded-full gap-1" onClick={() => downloadStub(it)}><Download className="h-3.5 w-3.5" /> Stub</Button>
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
