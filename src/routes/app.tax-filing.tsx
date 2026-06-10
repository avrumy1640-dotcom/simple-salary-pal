import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/payroll";
import { Landmark, CheckCircle2, AlertCircle, Calendar, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/tax-filing")({
  head: () => ({ meta: [{ title: "Tax filing — Paylo" }] }),
  component: TaxFilingPage,
});

interface FilingRow { period: string; form: string; dueDate: string; amount: number; status: "upcoming" | "due_soon" | "overdue" | "filed" }

function TaxFilingPage() {
  const year = new Date().getFullYear();
  const [rows, setRows] = useState<FilingRow[]>([]);
  const [w2Count, setW2Count] = useState(0);
  const [n1099Count, setN1099Count] = useState(0);
  const [n1099Total, setN1099Total] = useState(0);
  const [q941, setQ941] = useState<{ q: number; gross: number; fed: number; fica: number }[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: items }, { data: runs }, { data: pays }, { data: emps }] = await Promise.all([
        supabase.from("payroll_items").select("gross_pay, federal_tax, social_security, medicare, run_id, employee_id"),
        supabase.from("payroll_runs").select("id, pay_date"),
        supabase.from("contractor_payments").select("amount, payment_date, contractor_id"),
        supabase.from("employees").select("id"),
      ]);
      setW2Count((emps ?? []).length);

      const runMap = new Map((runs ?? []).map((r) => [r.id as string, r.pay_date as string]));
      const byQtr = new Map<number, { gross: number; fed: number; fica: number }>();
      (items ?? []).forEach((i) => {
        const d = runMap.get((i as { run_id: string }).run_id);
        if (!d || !d.startsWith(String(year))) return;
        const m = Number(d.slice(5, 7));
        const q = Math.ceil(m / 3);
        const c = byQtr.get(q) ?? { gross: 0, fed: 0, fica: 0 };
        c.gross += Number(i.gross_pay);
        c.fed += Number(i.federal_tax);
        c.fica += Number(i.social_security) + Number(i.medicare);
        byQtr.set(q, c);
      });
      setQ941([1, 2, 3, 4].map((q) => ({ q, ...(byQtr.get(q) ?? { gross: 0, fed: 0, fica: 0 }) })));

      // 1099 contractors meeting threshold
      const byContractor = new Map<string, number>();
      (pays ?? []).filter((p) => (p.payment_date as string).startsWith(String(year))).forEach((p) => {
        const id = p.contractor_id as string;
        byContractor.set(id, (byContractor.get(id) ?? 0) + Number(p.amount));
      });
      const filing1099 = Array.from(byContractor.values()).filter((v) => v >= 600);
      setN1099Count(filing1099.length);
      setN1099Total(filing1099.reduce((s, v) => s + v, 0));

      // Build calendar of deadlines for current year
      const today = new Date();
      const deadlines: FilingRow[] = [
        { period: `${year} Q1`, form: "Form 941", dueDate: `${year}-04-30`, amount: (byQtr.get(1)?.fed ?? 0) + (byQtr.get(1)?.fica ?? 0), status: "filed" },
        { period: `${year} Q2`, form: "Form 941", dueDate: `${year}-07-31`, amount: (byQtr.get(2)?.fed ?? 0) + (byQtr.get(2)?.fica ?? 0), status: "filed" },
        { period: `${year} Q3`, form: "Form 941", dueDate: `${year}-10-31`, amount: (byQtr.get(3)?.fed ?? 0) + (byQtr.get(3)?.fica ?? 0), status: "filed" },
        { period: `${year} Q4`, form: "Form 941", dueDate: `${year + 1}-01-31`, amount: (byQtr.get(4)?.fed ?? 0) + (byQtr.get(4)?.fica ?? 0), status: "filed" },
        { period: `${year}`, form: "Form 940 (FUTA)", dueDate: `${year + 1}-01-31`, amount: 0, status: "filed" },
        { period: `${year}`, form: "W-2 / W-3 to SSA", dueDate: `${year + 1}-01-31`, amount: 0, status: "filed" },
        { period: `${year}`, form: "1099-NEC to IRS", dueDate: `${year + 1}-01-31`, amount: n1099Total, status: "filed" },
      ].map((r) => {
        const due = new Date(r.dueDate);
        const diff = (due.getTime() - today.getTime()) / 86400000;
        const status: FilingRow["status"] = diff < 0 ? "overdue" : diff < 14 ? "due_soon" : "upcoming";
        return { ...r, status };
      });
      setRows(deadlines);
    })();
  }, [year, n1099Total]);

  function downloadFilingPacket() {
    const lines = [
      `TAX FILING PACKET — ${year}`,
      `Generated: ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `=== QUARTERLY 941 SUMMARY ===`,
      ...q941.map((q) => `Q${q.q}: Wages ${fmtUSD(q.gross)} | Fed w/h ${fmtUSD(q.fed)} | FICA ${fmtUSD(q.fica)}`),
      ``,
      `=== YEAR-END FORMS NEEDED ===`,
      `W-2 employees: ${w2Count} (file W-2 + W-3 to SSA by Jan 31)`,
      `1099-NEC contractors (>= $600): ${n1099Count} (total ${fmtUSD(n1099Total)}, file by Jan 31)`,
      `Form 940 FUTA: annual filing by Jan 31`,
      ``,
      `Filed via Paylo e-file (preview).`,
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tax-filing-packet-${year}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tax filing</h1>
          <p className="text-sm text-muted-foreground">Federal payroll filings, deadlines, and year-end forms — all in one place.</p>
        </div>
        <Button onClick={downloadFilingPacket} className="rounded-full bg-primary text-background hover:bg-foreground/90 gap-1.5">
          <Download className="h-4 w-4" /> Download filing packet
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="W-2 employees" value={String(w2Count)} sub="File W-2 + W-3 by Jan 31" />
        <Stat label="1099-NEC contractors" value={String(n1099Count)} sub={`${fmtUSD(n1099Total)} reportable`} />
        <Stat label={`${year} fed w/h + FICA`} value={fmtUSD(q941.reduce((s, q) => s + q.fed + q.fica, 0))} sub="Across all 4 quarters" />
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" /> Filing calendar</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Period</th>
                <th className="px-3 py-3">Form</th>
                <th className="px-3 py-3">Due</th>
                <th className="px-3 py-3">Liability</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-5 py-3 font-medium">{r.period}</td>
                  <td className="px-3 py-3">{r.form}</td>
                  <td className="px-3 py-3">{r.dueDate}</td>
                  <td className="px-3 py-3">{fmtUSD(r.amount)}</td>
                  <td className="px-5 py-3 text-right">
                    <StatusBadge s={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
function StatusBadge({ s }: { s: FilingRow["status"] }) {
  const map = {
    upcoming: { c: "bg-secondary text-foreground", t: "Upcoming", i: <Calendar className="h-3 w-3" /> },
    due_soon: { c: "bg-warning text-warning-foreground", t: "Due soon", i: <AlertCircle className="h-3 w-3" /> },
    overdue: { c: "bg-destructive text-destructive-foreground", t: "Overdue", i: <AlertCircle className="h-3 w-3" /> },
    filed: { c: "bg-primary text-background", t: "Ready", i: <CheckCircle2 className="h-3 w-3" /> },
  }[s];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${map.c}`}>{map.i}{map.t}</span>;
}
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium">{icon} {title}</div>
      <ul className="mt-3 space-y-2 text-sm">{children}</ul>
    </div>
  );
}
function Bullet({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{children}</span></li>;
}
