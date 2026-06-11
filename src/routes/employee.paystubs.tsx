import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText, Wallet } from "lucide-react";

export const Route = createFileRoute("/employee/paystubs")({
  head: () => ({ meta: [{ title: "Pay stubs — Paylo" }] }),
  component: Page,
});

function fmt(n: number) { return n.toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function fmtDate(s?: string | null) {
  return s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}
function fmtRange(a?: string | null, b?: string | null) {
  if (!a || !b) return "—";
  const A = new Date(a + "T00:00:00"); const B = new Date(b + "T00:00:00");
  const sameYear = A.getFullYear() === B.getFullYear();
  return `${A.toLocaleDateString("en-US", { month: "long", day: "numeric" })} — ${B.toLocaleDateString("en-US", sameYear ? { month: "long", day: "numeric", year: "numeric" } : { month: "long", day: "numeric", year: "numeric" })}`;
}

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
  const [companyName, setCompanyName] = useState("");
  const [preview, setPreview] = useState<PayItem | null>(null);

  useEffect(() => {
    if (!employee) return;
    (async () => {
      const [{ data }, { data: comp }] = await Promise.all([
        supabase.from("payroll_items")
          .select("id, gross_pay, net_pay, federal_tax, state_tax, fica_tax, medicare_tax, regular_hours, overtime_hours, payroll_runs(pay_date, period_start, period_end, status)")
          .eq("employee_id", employee.id)
          .order("created_at", { ascending: false })
          .limit(48),
        supabase.from("companies").select("legal_name, dba").eq("id", employee.company_id).maybeSingle(),
      ]);
      setItems((data ?? []) as unknown as PayItem[]);
      setCompanyName((comp?.dba || comp?.legal_name) ?? "");
    })();
  }, [employee?.id]);

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  const year = new Date().getFullYear();
  const ytd = items
    .filter((p) => p.payroll_runs?.pay_date && new Date(p.payroll_runs.pay_date).getFullYear() === year)
    .reduce((s, p) => ({
      gross: s.gross + Number(p.gross_pay),
      net: s.net + Number(p.net_pay),
      fed: s.fed + Number(p.federal_tax),
      st: s.st + Number(p.state_tax),
      fica: s.fica + Number(p.fica_tax),
      med: s.med + Number(p.medicare_tax),
    }), { gross: 0, net: 0, fed: 0, st: 0, fica: 0, med: 0 });

  function downloadTxt(p: PayItem) {
    const pd = p.payroll_runs?.pay_date ?? "";
    const lines = [
      `${companyName || "Pay stub"}`,
      `Pay stub for ${employee!.full_name}`,
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

  function printPdf(p: PayItem) {
    const pd = p.payroll_runs?.pay_date ?? "";
    const empAddr = [employee!.address_line1, [employee!.city, employee!.state, employee!.zip].filter(Boolean).join(" ")].filter(Boolean).join("<br/>");
    const rows = (label: string, v: string) => `<tr><td style="padding:6px 0;color:#475569">${label}</td><td style="text-align:right;font-weight:600">${v}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Pay stub ${pd}</title>
      <style>
        @page { size: letter; margin: 0.6in; }
        body { font-family: -apple-system, Segoe UI, Inter, Arial, sans-serif; color:#0f172a; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .muted { color:#64748b; font-size:12px; }
        .grid { display:flex; gap:24px; margin-top: 16px; }
        .card { flex:1; border:1px solid #e2e8f0; border-radius:12px; padding:16px; }
        .net { background:#ecfdf5; border-color:#a7f3d0; }
        table { width:100%; font-size:13px; border-collapse:collapse; }
        .label { font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#475569; font-weight:700; margin-bottom:6px; }
        .big { font-size:32px; font-weight:800; }
      </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h1>${companyName || "Pay stub"}</h1>
          <div class="muted">Pay stub</div>
        </div>
        <div style="text-align:right" class="muted">
          <div>Pay date</div>
          <div style="color:#0f172a;font-weight:700">${fmtDate(pd)}</div>
        </div>
      </div>
      <div class="grid">
        <div class="card">
          <div class="label">Employee</div>
          <div style="font-weight:700">${employee!.full_name}</div>
          <div class="muted" style="margin-top:4px">${empAddr || ""}</div>
        </div>
        <div class="card">
          <div class="label">Pay period</div>
          <div style="font-weight:700">${fmtRange(p.payroll_runs?.period_start, p.payroll_runs?.period_end)}</div>
          <div class="muted" style="margin-top:4px">Status: ${p.payroll_runs?.status ?? "—"}</div>
        </div>
      </div>
      <div class="grid">
        <div class="card">
          <div class="label" style="color:#065f46">Earnings</div>
          <table>
            ${rows("Regular hours", String(Number(p.regular_hours ?? 0)) + "h")}
            ${rows("Overtime hours", String(Number(p.overtime_hours ?? 0)) + "h")}
            ${rows("Gross pay", fmt(Number(p.gross_pay)))}
          </table>
        </div>
        <div class="card">
          <div class="label" style="color:#9f1239">Taxes & deductions</div>
          <table>
            ${rows("Federal tax", fmt(Number(p.federal_tax)))}
            ${rows("State tax", fmt(Number(p.state_tax)))}
            ${rows("Social Security", fmt(Number(p.fica_tax)))}
            ${rows("Medicare", fmt(Number(p.medicare_tax)))}
          </table>
        </div>
      </div>
      <div class="card net" style="margin-top:16px;display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <div class="label" style="color:#065f46">Net pay</div>
          <div class="big">${fmt(Number(p.net_pay))}</div>
        </div>
        <div style="text-align:right" class="muted">
          <div>YTD net</div>
          <div style="color:#0f172a;font-weight:700">${fmt(ytd.net)}</div>
        </div>
      </div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),100);};</script>
      </body></html>`;
    const w = window.open("", "_blank", "noopener");
    if (!w) return;
    w.document.write(html); w.document.close();
  }


  return (
    <div className="space-y-8 unit-in">
      <div>
        <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">Pay Stubs</h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">All your paychecks, ready to view or download.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-slate-500">YTD Net</div>
          <div className="mt-1.5 font-display text-xl sm:text-2xl font-bold text-slate-900">{fmt(ytd.net)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="text-xs uppercase tracking-wider text-slate-500">YTD Gross</div>
          <div className="mt-1.5 font-display text-xl sm:text-2xl font-bold text-slate-900">{fmt(ytd.gross)}</div>
        </div>
        <div className="col-span-2 rounded-2xl border border-border bg-card p-4 shadow-soft sm:col-span-1">
          <div className="text-xs uppercase tracking-wider text-slate-500">Stubs available</div>
          <div className="mt-1.5 font-display text-xl sm:text-2xl font-bold text-slate-900">{items.length}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-soft">
        <div className="flex items-center gap-2 border-b border-border px-6 py-4 font-display text-base font-bold text-slate-900">
          <Wallet className="h-4 w-4" /> Pay history
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No pay stubs yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((p) => (
              <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-4 sm:flex sm:flex-wrap">
                <FileText className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-900">{fmtRange(p.payroll_runs?.period_start, p.payroll_runs?.period_end)}</div>
                  <div className="text-xs text-slate-500">Pay date {fmtDate(p.payroll_runs?.pay_date)}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-extrabold text-primary tabular">{fmt(Number(p.net_pay))}</div>
                  <div className="text-[11px] text-slate-500">Net</div>
                </div>
                <div className="col-span-2 mt-1 flex gap-2 sm:col-span-1 sm:mt-0 sm:ml-3">
                  <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setPreview(p)}>View</Button>
                  <Button size="sm" variant="outline" className="flex-1 sm:flex-none gap-1" onClick={() => printPdf(p)}>
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>

              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pay stub preview modal */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pay stub</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="grid h-10 w-10 place-items-center rounded-xl gradient-brand text-sm font-bold text-primary-foreground">P</div>
                    <div className="mt-2 font-display text-base font-bold text-slate-900">{companyName || "Your company"}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>Pay date</div>
                    <div className="font-semibold text-slate-900">{fmtDate(preview.payroll_runs?.pay_date)}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">Employee</div>
                    <div className="font-semibold text-slate-900">{employee.full_name}</div>
                    {employee.address_line1 && <div className="text-slate-600">{employee.address_line1}</div>}
                    {(employee.city || employee.zip) && <div className="text-slate-600">{[employee.city, employee.zip].filter(Boolean).join(", ")}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-slate-500">Pay period</div>
                    <div className="font-semibold text-slate-900">{fmtRange(preview.payroll_runs?.period_start, preview.payroll_runs?.period_end)}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Earnings</div>
                  <Row label="Regular hours" v={`${Number(preview.regular_hours ?? 0)}h`} />
                  <Row label="Overtime hours" v={`${Number(preview.overtime_hours ?? 0)}h`} />
                  <Row label="Gross pay" v={fmt(Number(preview.gross_pay))} bold />
                  <hr className="my-2 border-border" />
                  <Row label="YTD gross" v={fmt(ytd.gross)} muted />
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-xs uppercase tracking-wider text-rose-700 font-semibold">Deductions</div>
                  <Row label="Federal tax" v={fmt(Number(preview.federal_tax))} />
                  <Row label="State tax" v={fmt(Number(preview.state_tax))} />
                  <Row label="Social Security" v={fmt(Number(preview.fica_tax))} />
                  <Row label="Medicare" v={fmt(Number(preview.medicare_tax))} />
                  <hr className="my-2 border-border" />
                  <Row label="YTD tax" v={fmt(ytd.fed + ytd.st + ytd.fica + ytd.med)} muted />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-emerald-800 font-semibold">Net pay</div>
                    <div className="font-display text-4xl font-extrabold tabular text-slate-900">{fmt(Number(preview.net_pay))}</div>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div>YTD net</div>
                    <div className="font-bold text-slate-900">{fmt(ytd.net)}</div>
                  </div>
                </div>
              </div>

              <Button className="w-full h-12" onClick={() => download(preview)}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, v, bold, muted }: { label: string; v: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="mt-2 flex justify-between text-sm">
      <span className={muted ? "text-slate-400" : "text-slate-600"}>{label}</span>
      <span className={`tabular ${muted ? "text-slate-500" : "text-slate-900"} ${bold ? "font-bold" : "font-semibold"}`}>{v}</span>
    </div>
  );
}
