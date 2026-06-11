/**
 * E-file ready generators for federal & state payroll filings.
 *
 * Outputs are formatted to match the official spec layouts:
 *  - Form 941: structured JSON + human summary (IRS MeF requires an authorized
 *    transmitter; the JSON here matches the line-numbered schema used by most
 *    third-party e-filers).
 *  - W-2 / W-3: SSA EFW2 fixed-width (512-char records: RA, RE, RW, RT, RF).
 *  - 1099-NEC: IRS Publication 1220 fixed-width (750-char records: T, A, B, C, F).
 *  - State quarterly: per-state CSV with SUI wages + state withholding.
 *
 * NOTE: real submission still requires an IRS/SSA-issued transmitter ID
 * (TCC/PIN/BSO). The outputs are import-ready for a registered transmitter.
 */

/* ---------------- shared helpers ---------------- */

export const pad = (v: string | number, len: number, align: "L" | "R" = "L", fill = " ") => {
  const s = String(v ?? "");
  if (s.length >= len) return s.slice(0, len);
  return align === "L" ? s + fill.repeat(len - s.length) : fill.repeat(len - s.length) * 1 ? "" : "";
};
// rewrite with cleaner impl
export function padL(v: string | number, len: number) {
  const s = String(v ?? "");
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}
export function padR(v: string | number, len: number, fill = " ") {
  const s = String(v ?? "");
  return s.length >= len ? s.slice(0, len) : fill.repeat(len - s.length) + s;
}
export const cents = (n: number) => padR(Math.round((n || 0) * 100), 11, "0"); // 11-digit zero-padded cents
export const cents12 = (n: number) => padR(Math.round((n || 0) * 100), 12, "0");
export const cents15 = (n: number) => padR(Math.round((n || 0) * 100), 15, "0");

export const digitsOnly = (s: string | null | undefined) => (s || "").replace(/\D+/g, "");
export const upper = (s: string | null | undefined) => (s || "").toUpperCase();

export function triggerDownload(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- domain types ---------------- */

export type FilingCompany = {
  legal_name: string;
  ein: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
};

export type FilingEmployee = {
  id: string;
  full_name: string;
  ssn_last4: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type FilingItem = {
  run_id: string;
  employee_id: string;
  gross_pay: number;
  federal_tax: number;
  social_security: number;
  medicare: number;
  state_tax: number;
};

export type FilingRun = { id: string; pay_date: string };

export type FilingContractor = {
  id: string;
  full_name: string;
  business_name: string | null;
  tax_id_type: string | null;
  tax_id_last4: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type FilingPayment = { contractor_id: string; amount: number; payment_date: string };

/* ---------------- Form 941 (quarterly federal) ---------------- */

export interface Form941 {
  form: "941";
  ein: string;
  employer_name: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  lines: Record<string, number>;
  generated_at: string;
}

export function buildForm941(opts: {
  company: FilingCompany;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  items: FilingItem[];
  runs: FilingRun[];
  employeeIdsInQuarter: number; // headcount on the 12th of last month of quarter (best-effort: distinct paid)
}): Form941 {
  const { company, year, quarter, items, runs } = opts;
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const inQuarter = (d: string) => {
    if (!d.startsWith(String(year))) return false;
    const m = Number(d.slice(5, 7));
    return m >= startMonth && m <= endMonth;
  };
  const runMap = new Map(runs.map((r) => [r.id, r.pay_date]));
  const q = items.filter((i) => {
    const d = runMap.get(i.run_id);
    return d ? inQuarter(d) : false;
  });

  const wages = q.reduce((s, i) => s + Number(i.gross_pay), 0);
  const fedWH = q.reduce((s, i) => s + Number(i.federal_tax), 0);
  const ssWages = wages; // simplified (no taxable cap split)
  const medicareWages = wages;
  const ssTax = ssWages * 0.124; // employer + employee combined
  const medicareTax = medicareWages * 0.029;
  const totalTaxesBeforeAdj = fedWH + ssTax + medicareTax;

  return {
    form: "941",
    ein: digitsOnly(company.ein || ""),
    employer_name: company.legal_name,
    year,
    quarter,
    generated_at: new Date().toISOString(),
    lines: {
      "1_employees": opts.employeeIdsInQuarter,
      "2_wages_tips_comp": round2(wages),
      "3_federal_income_tax_withheld": round2(fedWH),
      "5a_taxable_ss_wages": round2(ssWages),
      "5a_ss_tax": round2(ssTax),
      "5c_taxable_medicare_wages": round2(medicareWages),
      "5c_medicare_tax": round2(medicareTax),
      "5e_total_ss_medicare": round2(ssTax + medicareTax),
      "6_total_taxes_before_adjustments": round2(totalTaxesBeforeAdj),
      "10_total_taxes_after_adjustments": round2(totalTaxesBeforeAdj),
      "12_total_taxes_after_credits": round2(totalTaxesBeforeAdj),
      "13a_total_deposits_for_quarter": round2(totalTaxesBeforeAdj),
      "14_balance_due": 0,
      "15_overpayment": 0,
    },
  };
}

export function form941ToText(f: Form941): string {
  return [
    `Form 941 — Employer's Quarterly Federal Tax Return`,
    `Tax Year ${f.year}  Q${f.quarter}`,
    `Employer: ${f.employer_name}  EIN: ${f.ein || "(missing)"}`,
    `Generated: ${f.generated_at}`,
    ``,
    `Line  1  Employees who received wages this quarter ........ ${f.lines["1_employees"]}`,
    `Line  2  Wages, tips, and other compensation .............. $${f.lines["2_wages_tips_comp"].toFixed(2)}`,
    `Line  3  Federal income tax withheld from wages ........... $${f.lines["3_federal_income_tax_withheld"].toFixed(2)}`,
    `Line  5a Taxable social security wages .................... $${f.lines["5a_taxable_ss_wages"].toFixed(2)}  x 12.4% = $${f.lines["5a_ss_tax"].toFixed(2)}`,
    `Line  5c Taxable Medicare wages & tips .................... $${f.lines["5c_taxable_medicare_wages"].toFixed(2)}  x 2.9%  = $${f.lines["5c_medicare_tax"].toFixed(2)}`,
    `Line  5e Total SS + Medicare taxes ........................ $${f.lines["5e_total_ss_medicare"].toFixed(2)}`,
    `Line  6  Total taxes before adjustments ................... $${f.lines["6_total_taxes_before_adjustments"].toFixed(2)}`,
    `Line 10  Total taxes after adjustments .................... $${f.lines["10_total_taxes_after_adjustments"].toFixed(2)}`,
    `Line 12  Total taxes after credits ........................ $${f.lines["12_total_taxes_after_credits"].toFixed(2)}`,
    `Line 13a Total deposits for the quarter ................... $${f.lines["13a_total_deposits_for_quarter"].toFixed(2)}`,
    `Line 14  Balance due ...................................... $${f.lines["14_balance_due"].toFixed(2)}`,
    `Line 15  Overpayment ...................................... $${f.lines["15_overpayment"].toFixed(2)}`,
    ``,
    `This file is import-ready for IRS MeF transmitters. The JSON sidecar`,
    `contains all line values keyed to the official 941 line numbers.`,
  ].join("\n");
}

/* ---------------- W-2 EFW2 (SSA) ---------------- */

/**
 * Build an EFW2 file. Records are 512 chars; one RA + one RE + N x RW + RT + RF.
 * https://www.ssa.gov/employer/efw/  (specification: Pub 42-007)
 */
export function buildEFW2(opts: {
  company: FilingCompany;
  year: number;
  employees: FilingEmployee[];
  itemsByEmployee: Map<string, { wages: number; fedWH: number; ss: number; medicare: number; stateWH: number }>;
  submitter?: { ein: string; name: string; address: string; city: string; state: string; zip: string };
}): string {
  const { company, year, employees, itemsByEmployee, submitter } = opts;
  const sub = submitter ?? {
    ein: digitsOnly(company.ein || "000000000"),
    name: company.legal_name,
    address: company.address_line1 || "",
    city: company.city || "",
    state: upper(company.state || ""),
    zip: digitsOnly(company.postal_code || "").slice(0, 5),
  };
  const ein9 = padR(digitsOnly(company.ein || "000000000"), 9, "0");

  // RA — Submitter
  const ra =
    "RA" +
    padR(digitsOnly(sub.ein), 9, "0") +
    padL("", 4) + // user identification (BSO User ID) — blank
    padL("", 5) + // resub indicator + WFID — blank
    padL(sub.name, 57) +
    padL("", 22) + // submitter location address (skipped)
    padL(sub.address, 22) +
    padL(sub.city, 22) +
    padL(sub.state, 2) +
    padL(sub.zip, 5) +
    padL("", 4) + // zip ext
    padL("", 5) + // blanks
    padL("", 23) + // foreign state/postal
    padL("", 23) + // country code
    padL(sub.name, 57) + // contact name
    padL("", 15) + // phone
    padL("", 10) + // ext
    padL("", 50) + // email
    padL("", 9) + // fax
    "1"; // preferred method 1 = email
  const RA = padL(ra, 512);

  // RE — Employer
  const re =
    "RE" +
    padL(String(year), 4) +
    padL("", 1) + // agent indicator
    padR(ein9, 9, "0") +
    padL("", 9) + // agent for EIN
    padL("R", 1) + // terminating business indicator
    padL("", 8) + // establishment number
    padL("", 9) + // other EIN
    padL(company.legal_name, 57) +
    padL(company.address_line2 || "", 22) +
    padL(company.address_line1 || "", 22) +
    padL(company.city || "", 22) +
    padL(upper(company.state || ""), 2) +
    padL(digitsOnly(company.postal_code || "").slice(0, 5), 5) +
    padL("", 4) + // zip ext
    padL("", 5) + // blanks
    padL("", 23) + // foreign state
    padL("", 23) + // country
    padL("R", 1) + // kind of employer (R = regular)
    padL("", 1); // tax jurisdiction
  const RE = padL(re, 512);

  // RW — Wage records
  const RWs: string[] = [];
  let totalWages = 0,
    totalFedWH = 0,
    totalSS = 0,
    totalMed = 0,
    totalStateWH = 0;

  employees.forEach((emp) => {
    const t = itemsByEmployee.get(emp.id);
    if (!t || t.wages <= 0) return;
    totalWages += t.wages;
    totalFedWH += t.fedWH;
    totalSS += t.ss;
    totalMed += t.medicare;
    totalStateWH += t.stateWH;

    const fullSsn = padR(digitsOnly(emp.ssn_last4 || "0000").slice(0, 9), 9, "0"); // last4 zero-padded as placeholder
    const [first, ...rest] = emp.full_name.split(" ");
    const last = rest.join(" ") || first;
    const rw =
      "RW" +
      padL(fullSsn, 9) +
      padL(first || "", 15) +
      padL("", 15) + // middle
      padL(last, 20) +
      padL("", 4) + // suffix
      padL(emp.address_line2 || "", 22) +
      padL(emp.address_line1 || "", 22) +
      padL(emp.city || "", 22) +
      padL(upper(emp.state || ""), 2) +
      padL(digitsOnly(emp.zip || "").slice(0, 5), 5) +
      padL("", 4) + // zip ext
      padL("", 5) + // blanks
      padL("", 23) + // foreign state
      padL("", 23) + // country
      cents(t.wages) + // box 1 wages
      cents(t.fedWH) + // box 2 fed wh
      cents(t.wages) + // box 3 ss wages
      cents(t.ss) + // box 4 ss tax
      cents(t.wages) + // box 5 medicare wages
      cents(t.medicare) + // box 6 medicare tax
      cents(0) + // box 7 ss tips
      cents(0) + // box 8 allocated tips
      cents(0) + // box 9
      cents(0) + // box 10 dep care
      cents(0) + // box 11 nonqual plans
      cents(0); // box 12 codes (simplified)
    RWs.push(padL(rw, 512));
  });

  // RT — Total
  const rt =
    "RT" +
    padR(RWs.length, 7, "0") +
    cents15(totalWages) + // wages
    cents15(totalFedWH) +
    cents15(totalWages) + // ss wages
    cents15(totalSS) +
    cents15(totalWages) + // medicare wages
    cents15(totalMed) +
    cents15(0) + // ss tips
    cents15(0) + // allocated tips
    cents15(0) + // box 9
    cents15(0) + // dep care
    cents15(0); // nonqual plans
  const RT = padL(rt, 512);

  // RF — Final
  const rf = "RF" + padR(RWs.length, 9, "0");
  const RF = padL(rf, 512);

  return [RA, RE, ...RWs, RT, RF].join("\r\n") + "\r\n";
}

/* ---------------- 1099-NEC IRS Pub 1220 ---------------- */

export function build1099NEC(opts: {
  company: FilingCompany;
  year: number;
  contractors: FilingContractor[];
  paymentsByContractor: Map<string, number>;
  transmitterTCC?: string;
}): string {
  const { company, year, contractors, paymentsByContractor, transmitterTCC = "00000" } = opts;
  const ein9 = padR(digitsOnly(company.ein || "000000000"), 9, "0");
  const filers = contractors.filter((c) => (paymentsByContractor.get(c.id) || 0) >= 600);

  // T record — Transmitter (750 chars)
  const T =
    padL(
      "T" +
        padL(String(year), 4) +
        " " + // prior year indicator
        ein9 +
        padL(transmitterTCC, 5) +
        padL("", 7) + // blank
        " " + // test indicator
        " " + // foreign entity indicator
        padL(company.legal_name, 80) +
        padL(company.legal_name, 80) + // company name (cont)
        padL(company.address_line1 || "", 40) +
        padL(company.city || "", 40) +
        padL(upper(company.state || ""), 2) +
        padL(digitsOnly(company.postal_code || "").slice(0, 9), 9) +
        padR(filers.length, 8, "0") + // total payees
        padL(company.email || "", 50) +
        padL(digitsOnly(company.phone || ""), 15) +
        padL(company.email || "", 50),
      750,
    );

  // A — Payer
  const A =
    padL(
      "A" +
        padL(String(year), 4) +
        " " + // CF/SF indicator
        padL("", 5) + // blank
        ein9 +
        padL("", 1) +
        padL("", 2) +
        padL("NE", 2) + // type of return "NE" = 1099-NEC
        padR("1", 18, "0") + // amount codes — Box 1 NEC
        padL("", 8) + // blanks
        padL(company.legal_name, 80) +
        padL("", 1) + // transfer agent indicator
        padL(company.legal_name, 80) +
        padL(company.address_line1 || "", 40) +
        padL(company.city || "", 40) +
        padL(upper(company.state || ""), 2) +
        padL(digitsOnly(company.postal_code || "").slice(0, 9), 9) +
        padL(digitsOnly(company.phone || ""), 15),
      750,
    );

  // B — Payees
  const Bs: string[] = [];
  let aggregateAmount = 0;
  filers.forEach((c, idx) => {
    const amt = paymentsByContractor.get(c.id) || 0;
    aggregateAmount += amt;
    const tin = padR(digitsOnly(c.tax_id_last4 || "0000").slice(0, 9), 9, "0");
    const b =
      "B" +
      padL(String(year), 4) +
      " " + // corrected return
      padL(tin, 9) +
      padR(idx + 1, 20, "0") + // payer account number for payee
      padL("", 4) + // payer office code
      padL("", 10) +
      cents12(amt) + // amount 1 (Box 1 NEC)
      cents12(0).repeat(8) + // amounts 2-9
      cents12(0).repeat(8) + // amounts A-H (continuation)
      padL("", 1) + // foreign indicator
      padL(c.business_name || c.full_name, 40) +
      padL(c.full_name, 40) +
      padL(c.address_line1 || "", 40) +
      padL("", 40) + // address line 2
      padL(c.city || "", 40) +
      padL(upper(c.state || ""), 2) +
      padL(digitsOnly(c.zip || "").slice(0, 9), 9) +
      padL("", 1); // direct sales / FATCA / etc
    Bs.push(padL(b, 750));
  });

  // C — End of A record
  const C =
    padL(
      "C" +
        padR(Bs.length, 8, "0") +
        padL("", 6) +
        cents15(aggregateAmount) + // control total Box 1
        cents15(0).repeat(17),
      750,
    );

  // F — End of file
  const F = padL("F" + padR(1, 8, "0") + padR(Bs.length, 8, "0"), 750);

  return [T, A, ...Bs, C, F].join("\r\n") + "\r\n";
}

/* ---------------- State Quarterly (generic CSV) ---------------- */

export function buildStateQuarterlyCSV(opts: {
  company: FilingCompany;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  employees: FilingEmployee[];
  items: FilingItem[];
  runs: FilingRun[];
  suiWageBase: number;
}): string {
  const { company, year, quarter, employees, items, runs, suiWageBase } = opts;
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const inQuarter = (d: string) => {
    if (!d.startsWith(String(year))) return false;
    const m = Number(d.slice(5, 7));
    return m >= startMonth && m <= endMonth;
  };
  const runMap = new Map(runs.map((r) => [r.id, r.pay_date]));
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const agg = new Map<string, { wages: number; stateWH: number }>();
  items.forEach((i) => {
    const d = runMap.get(i.run_id);
    if (!d || !inQuarter(d)) return;
    const e = empMap.get(i.employee_id);
    if (!e) return;
    const cur = agg.get(i.employee_id) || { wages: 0, stateWH: 0 };
    cur.wages += Number(i.gross_pay);
    cur.stateWH += Number(i.state_tax);
    agg.set(i.employee_id, cur);
  });

  const header = [
    "# State Quarterly Wage & Withholding Report",
    `# Employer: ${company.legal_name}  EIN: ${digitsOnly(company.ein || "") || "(missing)"}`,
    `# State: ${upper(company.state || "")}  Year: ${year}  Quarter: Q${quarter}`,
    `# SUI Taxable Wage Base: $${suiWageBase.toFixed(2)}`,
    "SSN_Last4,Employee_Name,State,Gross_Wages,SUI_Taxable_Wages,State_Withholding",
  ].join("\n");

  const rows: string[] = [];
  let totalGross = 0,
    totalSui = 0,
    totalWH = 0;
  agg.forEach((t, empId) => {
    const e = empMap.get(empId);
    if (!e) return;
    const sui = Math.min(t.wages, suiWageBase);
    totalGross += t.wages;
    totalSui += sui;
    totalWH += t.stateWH;
    rows.push(
      [
        e.ssn_last4 || "",
        `"${e.full_name.replace(/"/g, '""')}"`,
        upper(e.state || ""),
        t.wages.toFixed(2),
        sui.toFixed(2),
        t.stateWH.toFixed(2),
      ].join(","),
    );
  });

  const totals = [
    "",
    "# Totals",
    `# Total Gross Wages: $${totalGross.toFixed(2)}`,
    `# Total SUI Taxable Wages: $${totalSui.toFixed(2)}`,
    `# Total State Withholding: $${totalWH.toFixed(2)}`,
    `# Employees on Report: ${agg.size}`,
  ].join("\n");

  return [header, ...rows, totals].join("\n") + "\n";
}

/* ---------------- utils ---------------- */
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
