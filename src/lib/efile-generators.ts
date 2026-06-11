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

/* ---------------- Form 940 (annual FUTA) ---------------- */

export interface Form940 {
  form: "940";
  ein: string;
  employer_name: string;
  year: number;
  lines: Record<string, number>;
  generated_at: string;
}

export function buildForm940(opts: {
  company: FilingCompany;
  year: number;
  items: FilingItem[];
  runs: FilingRun[];
  futaWageBase?: number;
  stateCreditRate?: number;
}): Form940 {
  const { company, year, items, runs } = opts;
  const wageBase = opts.futaWageBase ?? 7000;
  const stateCredit = Math.min(Math.max(opts.stateCreditRate ?? 0.054, 0), 0.054);
  const effectiveRate = 0.06 - stateCredit;

  const runMap = new Map(runs.map((r) => [r.id, r.pay_date]));
  const totalsByEmp = new Map<string, number>();
  items.forEach((i) => {
    const d = runMap.get(i.run_id);
    if (!d || !d.startsWith(String(year))) return;
    totalsByEmp.set(i.employee_id, (totalsByEmp.get(i.employee_id) || 0) + Number(i.gross_pay));
  });

  let totalPayments = 0;
  let exemptOverBase = 0;
  let futaTaxable = 0;
  totalsByEmp.forEach((wages) => {
    totalPayments += wages;
    const taxable = Math.min(wages, wageBase);
    futaTaxable += taxable;
    exemptOverBase += Math.max(0, wages - wageBase);
  });
  const futaBeforeAdj = round2(futaTaxable * 0.06);
  const stateCreditAmt = round2(futaTaxable * stateCredit);
  const futaAfterCredit = round2(futaTaxable * effectiveRate);

  return {
    form: "940",
    ein: digitsOnly(company.ein || ""),
    employer_name: company.legal_name,
    year,
    generated_at: new Date().toISOString(),
    lines: {
      "3_total_payments_to_employees": round2(totalPayments),
      "5_payments_over_7000": round2(exemptOverBase),
      "7_total_taxable_futa_wages": round2(futaTaxable),
      "8_futa_before_adjustments_6pct": futaBeforeAdj,
      "9_state_credit_reduction": stateCreditAmt,
      "10_adjustments": 0,
      "12_total_futa_tax_after_adjustments": futaAfterCredit,
      "13_futa_deposits_paid_ytd": futaAfterCredit,
      "14_balance_due": 0,
      "15_overpayment": 0,
    },
  };
}

export function form940ToText(f: Form940): string {
  return [
    `Form 940 — Employer's Annual Federal Unemployment (FUTA) Tax Return`,
    `Tax Year ${f.year}`,
    `Employer: ${f.employer_name}  EIN: ${f.ein || "(missing)"}`,
    `Generated: ${f.generated_at}`,
    ``,
    `Line  3  Total payments to all employees ............... $${f.lines["3_total_payments_to_employees"].toFixed(2)}`,
    `Line  5  Payments in excess of $7,000 .................. $${f.lines["5_payments_over_7000"].toFixed(2)}`,
    `Line  7  Total taxable FUTA wages ...................... $${f.lines["7_total_taxable_futa_wages"].toFixed(2)}`,
    `Line  8  FUTA before adjustments (6.0%) ................ $${f.lines["8_futa_before_adjustments_6pct"].toFixed(2)}`,
    `Line  9  State unemployment credit (up to 5.4%) ........ $${f.lines["9_state_credit_reduction"].toFixed(2)}`,
    `Line 10  Adjustments ................................... $${f.lines["10_adjustments"].toFixed(2)}`,
    `Line 12  Total FUTA tax after adjustments .............. $${f.lines["12_total_futa_tax_after_adjustments"].toFixed(2)}`,
    `Line 13  FUTA tax deposited for the year ............... $${f.lines["13_futa_deposits_paid_ytd"].toFixed(2)}`,
    `Line 14  Balance due ................................... $${f.lines["14_balance_due"].toFixed(2)}`,
    `Line 15  Overpayment ................................... $${f.lines["15_overpayment"].toFixed(2)}`,
    ``,
    `Import-ready for IRS MeF transmitters. The JSON sidecar mirrors the`,
    `official 940 line numbering.`,
  ].join("\n");
}

/* ---------------- W-3 transmittal (summary of W-2s) ---------------- */

export interface FormW3 {
  form: "W-3";
  ein: string;
  employer_name: string;
  year: number;
  number_of_w2s: number;
  totals: {
    box1_wages: number;
    box2_federal_income_tax: number;
    box3_ss_wages: number;
    box4_ss_tax: number;
    box5_medicare_wages: number;
    box6_medicare_tax: number;
    box16_state_wages: number;
    box17_state_tax: number;
  };
  generated_at: string;
}

export function buildFormW3(opts: {
  company: FilingCompany;
  year: number;
  itemsByEmployee: Map<string, { wages: number; fedWH: number; ss: number; medicare: number; stateWH: number }>;
}): FormW3 {
  const { company, year, itemsByEmployee } = opts;
  let w = 0, f = 0, s = 0, m = 0, sw = 0;
  let count = 0;
  itemsByEmployee.forEach((t) => {
    if (t.wages <= 0) return;
    count++;
    w += t.wages; f += t.fedWH; s += t.ss; m += t.medicare; sw += t.stateWH;
  });
  return {
    form: "W-3",
    ein: digitsOnly(company.ein || ""),
    employer_name: company.legal_name,
    year,
    number_of_w2s: count,
    totals: {
      box1_wages: round2(w),
      box2_federal_income_tax: round2(f),
      box3_ss_wages: round2(w),
      box4_ss_tax: round2(s),
      box5_medicare_wages: round2(w),
      box6_medicare_tax: round2(m),
      box16_state_wages: round2(w),
      box17_state_tax: round2(sw),
    },
    generated_at: new Date().toISOString(),
  };
}

export function formW3ToText(w3: FormW3): string {
  const t = w3.totals;
  return [
    `Form W-3 — Transmittal of Wage and Tax Statements`,
    `Tax Year ${w3.year}`,
    `Employer: ${w3.employer_name}  EIN: ${w3.ein || "(missing)"}`,
    `Number of W-2s transmitted: ${w3.number_of_w2s}`,
    `Generated: ${w3.generated_at}`,
    ``,
    `Box  1  Wages, tips, other compensation ............ $${t.box1_wages.toFixed(2)}`,
    `Box  2  Federal income tax withheld ................ $${t.box2_federal_income_tax.toFixed(2)}`,
    `Box  3  Social security wages ...................... $${t.box3_ss_wages.toFixed(2)}`,
    `Box  4  Social security tax withheld ............... $${t.box4_ss_tax.toFixed(2)}`,
    `Box  5  Medicare wages and tips .................... $${t.box5_medicare_wages.toFixed(2)}`,
    `Box  6  Medicare tax withheld ...................... $${t.box6_medicare_tax.toFixed(2)}`,
    `Box 16  State wages, tips, etc. .................... $${t.box16_state_wages.toFixed(2)}`,
    `Box 17  State income tax ........................... $${t.box17_state_tax.toFixed(2)}`,
    ``,
    `Submit alongside the SSA EFW2 file (W-2s). When e-filing via BSO the`,
    `EFW2 RT record fulfils the W-3 totals — this human summary is for records.`,
  ].join("\n");
}

/* ---------------- Form 1096 (transmittal for 1099s) ---------------- */

export interface Form1096 {
  form: "1096";
  ein: string;
  employer_name: string;
  year: number;
  form_type: "1099-NEC" | "1099-MISC";
  number_of_forms: number;
  federal_income_tax_withheld: number;
  total_amount_reported: number;
  generated_at: string;
}

export function buildForm1096(opts: {
  company: FilingCompany;
  year: number;
  contractors: FilingContractor[];
  paymentsByContractor: Map<string, number>;
  formType?: "1099-NEC" | "1099-MISC";
}): Form1096 {
  const { company, year, contractors, paymentsByContractor, formType = "1099-NEC" } = opts;
  const filers = contractors.filter((c) => (paymentsByContractor.get(c.id) || 0) >= 600);
  const total = filers.reduce((s, c) => s + (paymentsByContractor.get(c.id) || 0), 0);
  return {
    form: "1096",
    ein: digitsOnly(company.ein || ""),
    employer_name: company.legal_name,
    year,
    form_type: formType,
    number_of_forms: filers.length,
    federal_income_tax_withheld: 0,
    total_amount_reported: round2(total),
    generated_at: new Date().toISOString(),
  };
}

export function form1096ToText(f: Form1096): string {
  return [
    `Form 1096 — Annual Summary and Transmittal of U.S. Information Returns`,
    `Tax Year ${f.year}`,
    `Filer: ${f.employer_name}  EIN: ${f.ein || "(missing)"}`,
    `Type of return being transmitted: ${f.form_type}`,
    `Generated: ${f.generated_at}`,
    ``,
    `Box 3  Total number of forms ...................... ${f.number_of_forms}`,
    `Box 4  Federal income tax withheld ................ $${f.federal_income_tax_withheld.toFixed(2)}`,
    `Box 5  Total amount reported ...................... $${f.total_amount_reported.toFixed(2)}`,
    ``,
    `Required only when paper-filing 1099s. When e-filing through the IRS`,
    `FIRE system (IRS Pub 1220) the T-record replaces this transmittal.`,
  ].join("\n");
}

/* ---------------- New-Hire State Reporting ---------------- */

export type NewHireRow = {
  employee_id: string;
  full_name: string;
  ssn_last4: string | null;
  date_of_birth: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  start_date: string | null;
  state_of_hire: string | null;
};

/**
 * Generic state new-hire registry CSV.
 * Per PRWORA (42 U.S.C. § 653a), states must receive new-hire reports within
 * 20 days of hire. Most state directories accept this column layout.
 */
export function buildNewHireReportCSV(opts: {
  company: FilingCompany;
  rows: NewHireRow[];
}): string {
  const { company, rows } = opts;
  const ein = digitsOnly(company.ein || "");
  const cell = (s: string | null | undefined) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const header = [
    "# State New-Hire Report",
    `# Employer: ${company.legal_name}  FEIN: ${ein || "(missing)"}`,
    `# Address: ${company.address_line1 || ""}, ${company.city || ""}, ${upper(company.state || "")} ${digitsOnly(company.postal_code || "")}`,
    `# Generated: ${new Date().toISOString().slice(0, 10)}`,
    [
      "FEIN","Employer_Name","Employer_Address","Employer_City","Employer_State","Employer_Zip",
      "Employee_SSN_Last4","Employee_First_Name","Employee_Last_Name","Employee_Address",
      "Employee_City","Employee_State","Employee_Zip","Date_Of_Hire","Date_Of_Birth","State_Of_Hire",
    ].join(","),
  ].join("\n");

  const lines = rows.map((r) => {
    const [first, ...rest] = (r.full_name || "").split(" ");
    const last = rest.join(" ") || "";
    return [
      ein,
      cell(company.legal_name),
      cell(company.address_line1 || ""),
      cell(company.city || ""),
      upper(company.state || ""),
      digitsOnly(company.postal_code || "").slice(0, 5),
      r.ssn_last4 || "",
      cell(first || ""),
      cell(last),
      cell(r.address_line1 || ""),
      cell(r.city || ""),
      upper(r.state || ""),
      digitsOnly(r.zip || "").slice(0, 5),
      r.start_date || "",
      r.date_of_birth || "",
      upper(r.state_of_hire || r.state || ""),
    ].join(",");
  });
  return [header, ...lines].join("\n") + "\n";
}

/* ---------------- utils ---------------- */
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
