import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Download, FileText, Wallet } from "lucide-react";

export const Route = createFileRoute("/employee/paystubs")({
  head: () => ({ meta: [{ title: "My pay stubs — Paylo" }] }),
  component: Page,
});

function fmt(n: number) { return n.toLocaleString("en-US", { style: "currency", currency: "USD" }); }

interface PayItem {
  id: string;
  gross_pay: number; net_pay: number; federal_tax: number; state_tax: number;
  fica_tax: number; medicare_tax: number;
  regular_hours: number | null; overtime_hours: number | null;
  payroll_runs: { pay_date: string; period_start: string; period_end: string; status: string } | null;
}

function Page() {
  const { employee, loading } = useMyEmployee();
  const [items, setItems] = useState<PayItem[]>([]);
  useEffect(() => {
    if (!employee) return;
    (async () => {
      const { data } = await supabase
        .from("payroll_items")
        .select("id, gross_pay, net_pay, federal_tax, state_tax, fica_tax, medicare_tax, regular_hours, overtime_hours, payroll_runs(pay_date, period_start, period_end, status)")
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false })
        .limit(36);
      setItems((data ?? []) as unknown as PayItem[]);
    })();
  }, [employee?.id]);

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  function download(p: PayItem) {
    const pd = p.payroll_runs?.pay_date ?? "";
    const lines = [
      `Pay stub — ${employee!.full_name}`,
      `Pay date: ${pd}`,
      `Period: ${p.payroll_runs?.period_start ?? ""} → ${p.payroll_runs?.period_end ?? ""}`,
      "",
      `Regular hours: ${p.regular_hours ?? 0}`,
      `Overtime hours: ${p.overtime_hours ?? 0}`,
      `Gross pay: ${fmt(Number(p.gross_pay))}`,
      `Federal tax: ${fmt(Number(p.federal_tax))}`,
      `State tax: ${fmt(Number(p.state_tax))}`,
      `Social Security: ${fmt(Number(p.fica_tax))}`,
      `Medicare: ${fmt(Number(p.medicare_tax))}`,
      `Net pay: ${fmt(Number(p.net_pay))}`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `paystub-${pd}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My pay stubs</h1>
        <p className="text-sm text-muted-foreground">Download any pay stub from your history.</p>
      </div>
      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-3 text-sm font-medium">
          <Wallet className="h-4 w-4" /> {items.length} pay stub{items.length === 1 ? "" : "s"}
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No pay stubs yet.</div>
        ) : (
          <ul className="divide-y">
            {items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Pay date {p.payroll_runs?.pay_date ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.payroll_runs?.period_start ?? "—"} → {p.payroll_runs?.period_end ?? "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{fmt(Number(p.net_pay))}</div>
                  <div className="text-xs text-muted-foreground">Gross {fmt(Number(p.gross_pay))}</div>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => download(p)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
