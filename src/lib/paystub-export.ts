/**
 * Client-side paystub PDF + ACH batch export.
 *
 * Uses pdf-lib (already in deps) so we don't need a server round-trip — the
 * data is already loaded into the admin page when these are invoked.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PaystubData = {
  employee_name: string;
  employee_address?: string | null;
  pay_date: string;
  period_start: string;
  period_end: string;
  company_name: string;
  company_address?: string | null;
  company_ein?: string | null;
  regular_hours?: number | null;
  overtime_hours?: number | null;
  gross_pay: number;
  federal_tax: number;
  social_security: number;
  medicare: number;
  state_tax: number;
  other_deductions?: number;
  net_pay: number;
  ytd?: { gross: number; fed: number; ss: number; med: number; state: number; net: number } | null;
};

const usd = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function buildPaystubPdf(p: PaystubData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const draw = (text: string, x: number, y: number, opts: { size?: number; b?: boolean; color?: [number, number, number] } = {}) => {
    const c = opts.color ?? [0, 0, 0];
    page.drawText(String(text ?? ""), {
      x, y, size: opts.size ?? 10,
      font: opts.b ? bold : font,
      color: rgb(c[0], c[1], c[2]),
    });
  };

  // Header band
  page.drawRectangle({ x: 0, y: 740, width: 612, height: 52, color: rgb(0.06, 0.09, 0.16) });
  draw(p.company_name, 36, 762, { size: 18, b: true, color: [1, 1, 1] });
  draw("Earnings statement", 36, 748, { size: 9, color: [0.75, 0.82, 0.94] });
  draw("PAY DATE", 460, 762, { size: 8, color: [0.75, 0.82, 0.94] });
  draw(p.pay_date, 460, 748, { size: 11, b: true, color: [1, 1, 1] });

  // Employer / employee blocks
  let y = 710;
  draw("EMPLOYER", 36, y, { size: 8, b: true, color: [0.4, 0.45, 0.55] });
  draw("EMPLOYEE", 320, y, { size: 8, b: true, color: [0.4, 0.45, 0.55] });
  y -= 14;
  draw(p.company_name, 36, y, { b: true });
  draw(p.employee_name, 320, y, { b: true });
  y -= 12;
  if (p.company_address) draw(p.company_address, 36, y, { size: 9 });
  if (p.employee_address) draw(p.employee_address, 320, y, { size: 9 });
  y -= 12;
  if (p.company_ein) draw(`EIN: ${p.company_ein}`, 36, y, { size: 9 });

  // Period band
  y -= 24;
  page.drawRectangle({ x: 36, y: y - 4, width: 540, height: 22, color: rgb(0.94, 0.96, 1) });
  draw(`Pay period:  ${p.period_start}  →  ${p.period_end}`, 44, y + 4, { size: 10, b: true });

  // Earnings & Taxes columns
  y -= 30;
  draw("EARNINGS", 36, y, { size: 9, b: true, color: [0.4, 0.45, 0.55] });
  draw("CURRENT", 220, y, { size: 9, b: true, color: [0.4, 0.45, 0.55] });
  draw("WITHHOLDING", 320, y, { size: 9, b: true, color: [0.4, 0.45, 0.55] });
  draw("CURRENT", 540, y, { size: 9, b: true, color: [0.4, 0.45, 0.55] });
  y -= 4;
  page.drawLine({ start: { x: 36, y }, end: { x: 576, y }, thickness: 0.5, color: rgb(0.8, 0.84, 0.9) });

  const leftRows: Array<[string, string]> = [];
  if ((p.regular_hours ?? 0) > 0) leftRows.push([`Regular  (${p.regular_hours} hrs)`, usd(p.gross_pay - (p.overtime_hours || 0) * 0)]);
  else leftRows.push(["Gross wages", usd(p.gross_pay)]);
  if ((p.overtime_hours ?? 0) > 0) leftRows.push([`Overtime  (${p.overtime_hours} hrs)`, ""]);

  const rightRows: Array<[string, string]> = [
    ["Federal income tax", usd(p.federal_tax)],
    ["Social Security", usd(p.social_security)],
    ["Medicare", usd(p.medicare)],
    ["State income tax", usd(p.state_tax)],
  ];
  if ((p.other_deductions ?? 0) > 0) rightRows.push(["Other deductions", usd(p.other_deductions || 0)]);

  let ly = y - 16, ry = y - 16;
  for (const [k, v] of leftRows) { draw(k, 36, ly, { size: 10 }); draw(v, 220, ly, { size: 10, b: true }); ly -= 16; }
  for (const [k, v] of rightRows) { draw(k, 320, ry, { size: 10 }); draw(v, 540, ry, { size: 10, b: true }); ry -= 16; }

  const colBottom = Math.min(ly, ry) - 8;
  page.drawLine({ start: { x: 36, y: colBottom }, end: { x: 576, y: colBottom }, thickness: 0.5, color: rgb(0.8, 0.84, 0.9) });

  // Totals
  let ty = colBottom - 22;
  draw("Gross pay", 36, ty, { b: true });
  draw(usd(p.gross_pay), 220, ty, { b: true });
  const totalTax = p.federal_tax + p.social_security + p.medicare + p.state_tax + (p.other_deductions || 0);
  draw("Total deductions", 320, ty, { b: true });
  draw(usd(totalTax), 540, ty, { b: true });

  // Net pay highlight
  ty -= 30;
  page.drawRectangle({ x: 36, y: ty - 12, width: 540, height: 40, color: rgb(0.93, 0.99, 0.95) });
  page.drawRectangle({ x: 36, y: ty - 12, width: 4, height: 40, color: rgb(0.05, 0.55, 0.35) });
  draw("NET PAY", 52, ty + 16, { size: 9, b: true, color: [0.05, 0.4, 0.25] });
  draw(usd(p.net_pay), 52, ty - 2, { size: 22, b: true, color: [0.05, 0.4, 0.25] });

  // YTD
  if (p.ytd) {
    ty -= 60;
    draw("YEAR-TO-DATE", 36, ty, { size: 9, b: true, color: [0.4, 0.45, 0.55] });
    ty -= 16;
    const cols: Array<[string, number]> = [
      ["Gross", p.ytd.gross],
      ["Federal", p.ytd.fed],
      ["Soc. Sec.", p.ytd.ss],
      ["Medicare", p.ytd.med],
      ["State", p.ytd.state],
      ["Net", p.ytd.net],
    ];
    let cx = 36;
    for (const [k, v] of cols) {
      draw(k, cx, ty, { size: 9, color: [0.4, 0.45, 0.55] });
      draw(usd(v), cx, ty - 12, { size: 10, b: true });
      cx += 92;
    }
  }

  draw(`Generated ${new Date().toISOString().slice(0, 10)} — record of net pay; consult your payroll administrator with any questions.`, 36, 40, { size: 7, color: [0.45, 0.5, 0.6] });

  return doc.save();
}

export async function downloadPaystubPdf(p: PaystubData) {
  const bytes = await buildPaystubPdf(p);
  // pdf-lib returns a Uint8Array; wrap in a fresh ArrayBuffer slice so the
  // Blob constructor sees a plain BlobPart (avoids TS BlobPart variance on
  // SharedArrayBuffer-backed views).
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paystub-${p.employee_name.replace(/\s+/g, "_")}-${p.pay_date}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -------------------------------------------------------------------------- */
/* ACH batch export — CSV. Banks ingest CSV via "ACH origination" upload.     */
/* We don't store full routing/account numbers (last4 only), so a NACHA       */
/* fixed-width file isn't possible from the app alone — emit a clearly        */
/* labelled CSV draft instead.                                                 */
/* -------------------------------------------------------------------------- */
export type AchLine = {
  employee_name: string;
  routing_last4: string | null;
  account_last4: string | null;
  account_type?: string | null;
  net_pay: number;
};

export function downloadAchCsv(opts: {
  company_name: string;
  pay_date: string;
  lines: AchLine[];
}) {
  const rows = [
    ["#", "Employee", "Routing (last 4)", "Account (last 4)", "Account type", "Amount (USD)"],
    ...opts.lines.map((l, i) => [
      String(i + 1),
      l.employee_name,
      l.routing_last4 ? `xxxx${l.routing_last4}` : "—",
      l.account_last4 ? `xxxx${l.account_last4}` : "—",
      l.account_type ?? "checking",
      (Number(l.net_pay) || 0).toFixed(2),
    ]),
  ];
  const total = opts.lines.reduce((s, l) => s + (Number(l.net_pay) || 0), 0);
  rows.push(["", "TOTAL", "", "", "", total.toFixed(2)]);

  const csv =
    `# ACH BATCH DRAFT — ${opts.company_name}\n` +
    `# Pay date: ${opts.pay_date}\n` +
    `# Items: ${opts.lines.length}   Total net: $${total.toFixed(2)}\n` +
    `# Account numbers are masked. Provide the full routing & account numbers to your bank's ACH origination portal.\n` +
    rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
      .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ach-batch-${opts.pay_date}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
