import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/payroll";
import { Button } from "@/components/ui/button";
import {
  FileBadge, Download, AlertTriangle, CheckCircle2, ShieldCheck,
  Search, ArrowUpRight, Info,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/app/form-1099")({
  head: () => ({ meta: [{ title: "1099-NEC preview & validation — Paylo" }] }),
  component: Form1099Page,
});

interface Contractor {
  id: string;
  full_name: string;
  business_name: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tax_id_type: string | null;
  tax_id_last4: string | null;
  status: string;
}
interface Payment { contractor_id: string; amount: number; payment_date: string }
interface Company {
  legal_name: string | null;
  ein: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

type Issue = { level: "error" | "warning"; field: string; message: string };

interface Row {
  contractor: Contractor;
  ytd: number;
  reportable: boolean;
  issues: Issue[];
  ready: boolean;
}

function validate(c: Contractor, ytd: number, reportable: boolean): Issue[] {
  const issues: Issue[] = [];
  if (!c.full_name?.trim()) issues.push({ level: "error", field: "Name", message: "Recipient legal name is required." });
  if (!c.tax_id_last4 || c.tax_id_last4.length < 4)
    issues.push({ level: reportable ? "error" : "warning", field: "TIN", message: "TIN (SSN/EIN) on file from a signed W-9 is required to file 1099-NEC." });
  if (!c.address_line1) issues.push({ level: reportable ? "error" : "warning", field: "Address", message: "Street address is required on the 1099-NEC." });
  if (!c.city || !c.state || !c.zip) issues.push({ level: reportable ? "error" : "warning", field: "Address", message: "City, state, and ZIP are required." });
  if (c.state && c.state.length !== 2) issues.push({ level: "warning", field: "State", message: "Use the 2-letter state code (e.g. CA)." });
  if (c.zip && !/^\d{5}(-?\d{4})?$/.test(c.zip)) issues.push({ level: "warning", field: "ZIP", message: "ZIP should be 5 digits or ZIP+4." });
  if (ytd < 0) issues.push({ level: "error", field: "Amount", message: "Total paid cannot be negative." });
  return issues;
}

function Form1099Page() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "reportable" | "issues" | "ready">("reportable");

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }, { data: comp }] = await Promise.all([
        supabase.from("contractors").select("id, full_name, business_name, email, address_line1, city, state, zip, tax_id_type, tax_id_last4, status"),
        supabase.from("contractor_payments").select("contractor_id, amount, payment_date"),
        supabase.from("company_settings").select("legal_name, ein, address_line1, city, state, zip").maybeSingle(),
      ]);
      setContractors((c ?? []) as Contractor[]);
      setPayments((p ?? []) as Payment[]);
      setCompany((comp ?? null) as Company | null);
    })();
  }, []);

  const rows: Row[] = useMemo(() => {
    const totals = new Map<string, number>();
    payments
      .filter((p) => p.payment_date?.startsWith(String(year)))
      .forEach((p) => totals.set(p.contractor_id, (totals.get(p.contractor_id) ?? 0) + Number(p.amount)));

    return contractors.map((c) => {
      const ytd = Number((totals.get(c.id) ?? 0).toFixed(2));
      const reportable = ytd >= 600;
      const issues = validate(c, ytd, reportable);
      const ready = reportable && issues.filter((i) => i.level === "error").length === 0;
      return { contractor: c, ytd, reportable, issues, ready };
    }).sort((a, b) => b.ytd - a.ytd);
  }, [contractors, payments, year]);

  const filtered = rows.filter((r) => {
    if (q && !`${r.contractor.full_name} ${r.contractor.business_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "reportable") return r.reportable;
    if (filter === "issues") return r.issues.length > 0 && r.reportable;
    if (filter === "ready") return r.ready;
    return true;
  });

  const companyIssues = useMemo(() => {
    const i: Issue[] = [];
    if (!company?.legal_name) i.push({ level: "error", field: "Payer", message: "Company legal name missing in Company settings." });
    if (!company?.ein) i.push({ level: "error", field: "Payer EIN", message: "Company EIN missing in Company settings." });
    if (!company?.address_line1 || !company?.city || !company?.state || !company?.zip)
      i.push({ level: "error", field: "Payer address", message: "Company address must be complete." });
    return i;
  }, [company]);

  const summary = useMemo(() => {
    const reportable = rows.filter((r) => r.reportable);
    return {
      total: rows.length,
      reportable: reportable.length,
      reportableSum: reportable.reduce((s, r) => s + r.ytd, 0),
      ready: rows.filter((r) => r.ready).length,
      blocked: reportable.length - rows.filter((r) => r.ready).length,
    };
  }, [rows]);

  function downloadCsv() {
    const header = [
      "Recipient name","Business name","TIN type","TIN last 4","Address","City","State","ZIP",
      `Box 1 Nonemployee compensation (${year})`,"Reportable (>= $600)","Validation",
    ];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const c = r.contractor;
      const validation = r.issues.length === 0 ? "OK" : r.issues.map((i) => `${i.level.toUpperCase()}: ${i.field} — ${i.message}`).join(" | ");
      const cells = [
        c.full_name, c.business_name ?? "", c.tax_id_type ?? "", c.tax_id_last4 ?? "",
        c.address_line1 ?? "", c.city ?? "", c.state ?? "", c.zip ?? "",
        r.ytd.toFixed(2), r.reportable ? "Yes" : "No", validation,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    triggerDownload(lines.join("\n"), `1099-NEC-${year}.csv`, "text/csv");
  }

  function downloadPacket() {
    if (companyIssues.length > 0) { toast.error("Fix company info in Company settings first."); return; }
    if (summary.ready === 0) { toast.error("No contractors are ready to file."); return; }
    const ready = rows.filter((r) => r.ready);
    const lines = [
      `FORM 1099-NEC FILING PACKET — TAX YEAR ${year}`,
      `Generated: ${new Date().toISOString().slice(0, 10)}`,
      `Payer: ${company?.legal_name}  EIN: ${company?.ein}`,
      `Address: ${[company?.address_line1, company?.city, company?.state, company?.zip].filter(Boolean).join(", ")}`,
      ``,
      `Total recipients filing: ${ready.length}`,
      `Total Box 1 nonemployee compensation: ${fmtUSD(ready.reduce((s, r) => s + r.ytd, 0))}`,
      ``,
      `===== RECIPIENTS =====`,
      ...ready.flatMap((r) => [
        ``,
        `— ${r.contractor.full_name}${r.contractor.business_name ? ` (${r.contractor.business_name})` : ""}`,
        `  TIN: ${r.contractor.tax_id_type} ending ${r.contractor.tax_id_last4}`,
        `  Address: ${[r.contractor.address_line1, r.contractor.city, r.contractor.state, r.contractor.zip].filter(Boolean).join(", ")}`,
        `  Box 1 Nonemployee compensation: ${fmtUSD(r.ytd)}`,
        `  Box 4 Federal income tax withheld: ${fmtUSD(0)}`,
      ]),
      ``,
      `This packet previews data we will transmit on your behalf when e-file is enabled.`,
    ].join("\n");
    triggerDownload(lines, `1099-NEC-packet-${year}.txt`, "text/plain");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <FileBadge className="h-3.5 w-3.5" /> Year-end · 1099-NEC
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">1099-NEC preview &amp; validation</h1>
          <p className="text-sm text-muted-foreground">Verify every contractor's data and totals before generating the filing packet.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-full border bg-card px-3 py-1.5 text-sm"
          >
            {[0, 1, 2].map((n) => {
              const y = new Date().getFullYear() - n;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
          <Button variant="outline" className="rounded-full gap-1.5" onClick={downloadCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={downloadPacket} className="rounded-full bg-[#2563EB] text-background hover:bg-foreground/90 gap-1.5">
            <Download className="h-4 w-4" /> Generate filing packet
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Contractors" value={String(summary.total)} sub="On file" />
        <Stat label="Reportable" value={String(summary.reportable)} sub="Paid $600+" />
        <Stat label={`Total Box 1 (${year})`} value={fmtUSD(summary.reportableSum)} sub="Nonemployee comp" />
        <Stat
          label="Ready to file"
          value={`${summary.ready}/${summary.reportable}`}
          sub={summary.blocked > 0 ? `${summary.blocked} blocked` : "All clear"}
          tone={summary.blocked > 0 ? "warn" : "good"}
        />
      </div>

      {companyIssues.length > 0 && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium">Payer info incomplete</div>
              <p className="mt-0.5 text-xs text-muted-foreground">The IRS requires payer name, EIN, and address on every 1099-NEC.</p>
              <ul className="mt-2 space-y-1 text-xs">
                {companyIssues.map((i, idx) => (
                  <li key={idx}>• {i.field}: {i.message}</li>
                ))}
              </ul>
              <Link to="/app/settings" className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">
                Open Company settings <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contractors…" className="pl-9 rounded-full" />
        </div>
        {(["reportable", "issues", "ready", "all"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              filter === k ? "bg-[#2563EB] text-background border-foreground" : "bg-card hover:bg-accent"
            }`}
          >
            {k === "all" ? "All contractors" : k === "issues" ? "Needs attention" : k === "ready" ? "Ready" : "Reportable ($600+)"}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No contractors on file yet." : "No contractors match this filter."}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => <RecipientRow key={r.contractor.id} row={r} />)}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-foreground/70 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="text-foreground font-medium text-sm">How we validate</p>
            <p className="mt-1">
              Each contractor is checked against the 1099-NEC requirements: legal name, complete US address,
              TIN type and last 4 (collected from a signed W-9), and total Box 1 nonemployee compensation for the tax year.
              Only contractors paid $600 or more in {year} are required to receive a 1099-NEC.
              Filing deadline: <span className="text-foreground font-medium">January 31, {year + 1}</span> to both the IRS and the recipient.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecipientRow({ row }: { row: Row }) {
  const { contractor: c, ytd, reportable, issues, ready } = row;
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return (
    <li className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-base font-semibold">{c.full_name}</div>
            {c.business_name && <span className="text-sm text-muted-foreground">· {c.business_name}</span>}
            {ready && (
              <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            )}
            {reportable && !ready && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                <AlertTriangle className="h-3 w-3" /> Needs fix
              </span>
            )}
            {!reportable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Info className="h-3 w-3" /> Under $600
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {c.tax_id_type ?? "SSN"} ••• {c.tax_id_last4 ?? "----"} ·{" "}
            {[c.address_line1, c.city, c.state, c.zip].filter(Boolean).join(", ") || "No address on file"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Box 1</div>
          <div className="text-xl font-semibold tabular-nums">{fmtUSD(ytd)}</div>
        </div>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="mt-3 space-y-1.5">
          {errors.map((i, idx) => (
            <li key={`e${idx}`} className="flex items-start gap-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5" />
              <span><span className="font-medium">{i.field}:</span> {i.message}</span>
            </li>
          ))}
          {warnings.map((i, idx) => (
            <li key={`w${idx}`} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span><span className="font-medium text-foreground">{i.field}:</span> {i.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <Link
          to="/app/contractors"
          className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent"
        >
          Edit contractor <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </li>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className={`mt-1 text-xs ${tone === "warn" ? "text-destructive" : tone === "good" ? "text-foreground" : "text-muted-foreground"}`}>{sub}</div>
    </div>
  );
}

function triggerDownload(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}
