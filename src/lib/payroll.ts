// Simplified US payroll calculation for SMB demo purposes.
// NOT actual tax compliance — uses rough effective rates.

export interface DeductionInput {
  name: string;
  pre_tax: boolean;
  amount: number;
  amount_type: "fixed" | "percent" | string;
}

export interface PayrollCalcInput {
  payType: "hourly" | "salary";
  payRate: number;
  regularHours: number;
  overtimeHours: number;
  payPeriodsPerYear?: number;
  filingStatus?: "single" | "married" | "head" | string;
  dependents?: number;
  extraWithholding?: number;
  deductions?: DeductionInput[];
}

export interface PayrollCalcResult {
  gross: number;
  preTaxDeductions: number;
  taxableIncome: number;
  federalTax: number;
  socialSecurity: number;
  medicare: number;
  stateTax: number;
  postTaxDeductions: number;
  totalDeductions: number;
  net: number;
  regularHours: number;
  overtimeHours: number;
  deductionLines: { name: string; amount: number; pre_tax: boolean }[];
}

const STATE_RATE = 0.04;
const SOCIAL_SECURITY = 0.062;
const MEDICARE = 0.0145;

function fedRateFor(filing: string, taxable: number): number {
  // Rough progressive effective rate by filing status (annualized buckets).
  const annual = taxable * 26; // assume biweekly approximation
  const brackets =
    filing === "married"
      ? [[0, 0.0], [23200, 0.10], [94300, 0.12], [201050, 0.22], [383900, 0.24]]
      : filing === "head"
      ? [[0, 0.0], [16550, 0.10], [63100, 0.12], [100500, 0.22], [191950, 0.24]]
      : [[0, 0.0], [11600, 0.10], [47150, 0.12], [100525, 0.22], [191950, 0.24]];
  let rate = 0;
  for (const [floor, r] of brackets) if (annual >= floor) rate = r;
  return rate;
}

export function calcPay(input: PayrollCalcInput): PayrollCalcResult {
  let gross = 0;
  if (input.payType === "hourly") {
    gross = input.regularHours * input.payRate + input.overtimeHours * input.payRate * 1.5;
  } else {
    const periods = input.payPeriodsPerYear || 26;
    gross = input.payRate / periods;
  }
  gross = round2(gross);

  const deds = input.deductions ?? [];
  const lines = deds.map((d) => ({
    name: d.name,
    pre_tax: d.pre_tax,
    amount: round2(d.amount_type === "percent" ? gross * (Number(d.amount) / 100) : Number(d.amount)),
  }));
  const preTaxDeductions = round2(lines.filter((l) => l.pre_tax).reduce((s, l) => s + l.amount, 0));
  const postTaxDeductions = round2(lines.filter((l) => !l.pre_tax).reduce((s, l) => s + l.amount, 0));

  const taxableIncome = round2(Math.max(0, gross - preTaxDeductions));

  const dependentCredit = Math.min(Number(input.dependents || 0) * 2000, taxableIncome * 26) / 26;
  const fedRate = fedRateFor(input.filingStatus || "single", taxableIncome);
  const federalTax = round2(Math.max(0, taxableIncome * fedRate - dependentCredit + Number(input.extraWithholding || 0)));
  const stateTax = round2(taxableIncome * STATE_RATE);
  const socialSecurity = round2(gross * SOCIAL_SECURITY);
  const medicare = round2(gross * MEDICARE);

  const totalDeductions = round2(preTaxDeductions + postTaxDeductions + federalTax + stateTax + socialSecurity + medicare);
  const net = round2(gross - totalDeductions);

  return {
    gross,
    preTaxDeductions,
    taxableIncome,
    federalTax,
    stateTax,
    socialSecurity,
    medicare,
    postTaxDeductions,
    totalDeductions,
    net,
    regularHours: input.regularHours,
    overtimeHours: input.overtimeHours,
    deductionLines: lines,
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export function fmtUSD(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));
}
