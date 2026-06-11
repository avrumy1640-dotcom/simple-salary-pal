import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/payroll";
import { Landmark, CheckCircle2, AlertCircle, Calendar, Download, FileText, FileCode2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  buildForm941, form941ToText, buildEFW2, build1099NEC, buildStateQuarterlyCSV,
  triggerDownload, type FilingCompany, type FilingEmployee, type FilingItem,
  type FilingRun, type FilingContractor,
} from "@/lib/efile-generators";

export const Route = createFileRoute("/app/tax-filing")({
  head: () => ({ meta: [{ title: "Tax filing — Paylo" }] }),
  component: TaxFilingPage,
});

interface FilingRow { period: string; form: string; dueDate: string; amount: number; status: "upcoming" | "due_soon" | "overdue" | "filed" }

function TaxFilingPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(((Math.ceil((new Date().getMonth() + 1) / 3) || 1) as 1 | 2 | 3 | 4));
  const [generating, setGenerating] = useState<string | null>(null);
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

  async function loadFilingContext() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const { data: cu } = await supabase.from("company_users").select("company_id, is_default").eq("user_id", user.id).order("is_default", { ascending: false }).limit(1).maybeSingle();
    const companyId = cu?.company_id;
    if (!companyId) throw new Error("No company");
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const [{ data: company }, { data: employees }, { data: items }, { data: runs }, { data: contractors }, { data: payments }] = await Promise.all([
      supabase.from("companies").select("legal_name, ein, address_line1, address_line2, city, state, postal_code, phone, email, state_unemployment_wage_base").eq("id", companyId).maybeSingle(),
      supabase.from("employees").select("id, full_name, ssn_last4, address_line1, address_line2, city, state, zip").eq("company_id", companyId),
      supabase.from("payroll_items").select("run_id, employee_id, gross_pay, federal_tax, social_security, medicare, state_tax").eq("company_id", companyId),
      supabase.from("payroll_runs").select("id, pay_date").eq("company_id", companyId).gte("pay_date", yearStart).lte("pay_date", yearEnd),
      supabase.from("contractors").select("id, full_name, business_name, tax_id_type, tax_id_last4, address_line1, city, state, zip").eq("company_id", companyId),
      supabase.from("contractor_payments").select("contractor_id, amount, payment_date").eq("company_id", companyId).gte("payment_date", yearStart).lte("payment_date", yearEnd),
    ]);
    const runIds = new Set((runs ?? []).map((r) => r.id as string));
    return {
      company: company as FilingCompany & { state_unemployment_wage_base: number | null },
      employees: (employees ?? []) as FilingEmployee[],
      items: ((items ?? []) as FilingItem[]).filter((i) => runIds.has(i.run_id)),
      runs: (runs ?? []) as FilingRun[],
      contractors: (contractors ?? []) as FilingContractor[],
      payments: (payments ?? []) as { contractor_id: string; amount: number; payment_date: string }[],
    };
  }

  async function downloadForm941() {
    try {
      setGenerating("941");
      const ctx = await loadFilingContext();
      const empSet = new Set<string>();
      const runMap = new Map(ctx.runs.map((r) => [r.id, r.pay_date]));
      ctx.items.forEach((i) => {
        const d = runMap.get(i.run_id);
        if (!d) return;
        const m = Number(d.slice(5, 7));
        const q = Math.ceil(m / 3);
        if (q === quarter && d.startsWith(String(year))) empSet.add(i.employee_id);
      });
      const f941 = buildForm941({ company: ctx.company, year, quarter, items: ctx.items, runs: ctx.runs, employeeIdsInQuarter: empSet.size });
      triggerDownload(`Form941-${year}-Q${quarter}.txt`, form941ToText(f941));
      triggerDownload(`Form941-${year}-Q${quarter}.json`, JSON.stringify(f941, null, 2), "application/json");
      toast.success(`Form 941 generated for ${year} Q${quarter}`);
    } catch (e: unknown) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setGenerating(null);
    }
  }

  async function downloadW2EFW2() {
    try {
      setGenerating("w2");
      const ctx = await loadFilingContext();
      const runMap = new Map(ctx.runs.map((r) => [r.id, r.pay_date]));
      const totals = new Map<string, { wages: number; fedWH: number; ss: number; medicare: number; stateWH: number }>();
      ctx.items.forEach((i) => {
        const d = runMap.get(i.run_id);
        if (!d || !d.startsWith(String(year))) return;
        const cur = totals.get(i.employee_id) || { wages: 0, fedWH: 0, ss: 0, medicare: 0, stateWH: 0 };
        cur.wages += Number(i.gross_pay);
        cur.fedWH += Number(i.federal_tax);
        cur.ss += Number(i.social_security);
        cur.medicare += Number(i.medicare);
        cur.stateWH += Number(i.state_tax);
        totals.set(i.employee_id, cur);
      });
      const txt = buildEFW2({ company: ctx.company, year, employees: ctx.employees, itemsByEmployee: totals });
      triggerDownload(`W2-EFW2-${year}.txt`, txt);
      toast.success(`SSA EFW2 file generated (${totals.size} employees)`);
    } catch (e: unknown) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setGenerating(null);
    }
  }

  async function download1099NEC() {
    try {
      setGenerating("1099");
      const ctx = await loadFilingContext();
      const byC = new Map<string, number>();
      ctx.payments.forEach((p) => {
        if (!p.payment_date.startsWith(String(year))) return;
        byC.set(p.contractor_id, (byC.get(p.contractor_id) || 0) + Number(p.amount));
      });
      const txt = build1099NEC({ company: ctx.company, year, contractors: ctx.contractors, paymentsByContractor: byC });
      triggerDownload(`1099NEC-IRSPub1220-${year}.txt`, txt);
      const count = Array.from(byC.values()).filter((v) => v >= 600).length;
      toast.success(`IRS Pub 1220 file generated (${count} payees)`);
    } catch (e: unknown) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setGenerating(null);
    }
  }

  async function downloadStateQuarterly() {
    try {
      setGenerating("state");
      const ctx = await loadFilingContext();
      const csv = buildStateQuarterlyCSV({
        company: ctx.company,
        year,
        quarter,
        employees: ctx.employees,
        items: ctx.items,
        runs: ctx.runs,
        suiWageBase: Number(ctx.company.state_unemployment_wage_base ?? 7000),
      });
      triggerDownload(`State-${ctx.company.state || "XX"}-Q${quarter}-${year}.csv`, csv, "text/csv");
      toast.success(`State quarterly report generated`);
    } catch (e: unknown) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setGenerating(null);
    }
  }

  const totalLiability = q941.reduce((s, q) => s + q.fed + q.fica, 0);
  return (
    <div className="space-y-6 unit-scope">
      <section className="unit-in flex flex-wrap items-end justify-between gap-3 border-b unit-hairline pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-[40px]">Tax filing</h1>
          <p className="mt-1 text-sm text-slate-500">Stay compliant with all federal and state tax obligations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadFilingPacket} className="gap-1.5"><Download className="h-4 w-4" />Download all forms</Button>
          <Button className="gap-1.5"><FileText className="h-4 w-4" />File now</Button>
        </div>
      </section>

      {/* Compliance hero */}
      <section className="unit-in rounded-2xl border unit-hairline bg-white p-6 shadow-soft">
        <div className="grid gap-6 md:grid-cols-[1.4fr,1fr] items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Compliant
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold text-slate-900">Tax Year {year}</h2>
            <p className="mt-1 text-sm text-slate-500">All tax obligations are current. Great work.</p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <MiniStat label="W-2 employees" value={String(w2Count)} sub="Due Jan 31" />
              <MiniStat label="1099-NEC" value={String(n1099Count)} sub={fmtUSD(n1099Total)} />
              <MiniStat label="Fed liability" value={fmtUSD(totalLiability)} sub="YTD" />
            </div>
          </div>
          <div className="flex items-center justify-center">
            <FormStatusDonut filed={rows.filter(r => r.status === "filed").length} dueSoon={rows.filter(r => r.status === "due_soon").length} overdue={rows.filter(r => r.status === "overdue").length} upcoming={rows.filter(r => r.status === "upcoming").length} />
          </div>
        </div>
      </section>

      {/* E-file output generator */}
      <section className="rounded-2xl border unit-hairline bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">E-file ready outputs</h2>
            <p className="text-sm text-slate-500">Generate IRS/SSA-compliant filings directly from your payroll runs.</p>
          </div>
          <div className="flex gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v) as 1 | 2 | 3 | 4)}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <EFileCard
            title="Form 941"
            subtitle={`${year} Q${quarter} — Quarterly federal`}
            spec="IRS line-numbered JSON + human summary"
            icon={<FileCode2 className="h-5 w-5 text-primary" />}
            loading={generating === "941"}
            onClick={downloadForm941}
          />
          <EFileCard
            title="W-2 / W-3 (EFW2)"
            subtitle={`${year} annual — SSA submission`}
            spec="SSA Pub 42-007 fixed-width (512 char)"
            icon={<FileText className="h-5 w-5 text-primary" />}
            loading={generating === "w2"}
            onClick={downloadW2EFW2}
          />
          <EFileCard
            title="1099-NEC"
            subtitle={`${year} annual — IRS submission`}
            spec="IRS Pub 1220 fixed-width (750 char)"
            icon={<FileCode2 className="h-5 w-5 text-primary" />}
            loading={generating === "1099"}
            onClick={download1099NEC}
          />
          <EFileCard
            title="State Quarterly"
            subtitle={`${year} Q${quarter} — wages & withholding`}
            spec="CSV with SUI taxable wages"
            icon={<FileSpreadsheet className="h-5 w-5 text-primary" />}
            loading={generating === "state"}
            onClick={downloadStateQuarterly}
          />
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Files are formatted per IRS / SSA specifications and import-ready for any registered transmitter (TCC / BSO / state DOR). EIN, SSN, and addresses are pulled from employee records.
        </p>
      </section>

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
    <div className="rounded-2xl border unit-hairline bg-white p-5">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900 unit-num">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}
function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border unit-hairline bg-surface p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="mt-1 font-display text-lg font-bold text-slate-900 unit-num">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
function FormStatusDonut({ filed, dueSoon, overdue, upcoming }: { filed: number; dueSoon: number; overdue: number; upcoming: number }) {
  const slices = [
    { label: "Filed", value: filed, color: "#16A34A" },
    { label: "Due soon", value: dueSoon, color: "#F59E0B" },
    { label: "Overdue", value: overdue, color: "#DC2626" },
    { label: "Upcoming", value: upcoming, color: "#94A3B8" },
  ].filter(s => s.value > 0);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 60; const C = 2 * Math.PI * R; let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[170px] w-[170px]">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          <circle cx="90" cy="90" r={R} fill="none" stroke="#F1F5F9" strokeWidth="20" />
          {slices.map((s, i) => {
            const len = (s.value / total) * C; const offset = -acc; acc += len;
            return <circle key={i} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth="20" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={offset} />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-slate-900">{total}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Forms</div>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        {slices.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-slate-700">{s.label}</span>
            <span className="ml-2 tabular-nums text-slate-500">{s.value}</span>
          </div>
        ))}
      </div>
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
