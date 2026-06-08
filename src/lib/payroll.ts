// Very simplified US payroll calculation for SMB demo purposes.
// NOT actual tax compliance — uses rough effective rates.

export interface PayrollCalcInput {
  payType: "hourly" | "salary";
  payRate: number;
  regularHours: number;
  overtimeHours: number;
  payPeriodsPerYear?: number; // for salary
}

export interface PayrollCalcResult {
  gross: number;
  federalTax: number;
  socialSecurity: number;
  medicare: number;
  stateTax: number;
  net: number;
  regularHours: number;
  overtimeHours: number;
}

const FEDERAL_RATE = 0.10;   // flat simplified
const STATE_RATE = 0.04;     // flat simplified (CA-ish baseline)
const SOCIAL_SECURITY = 0.062;
const MEDICARE = 0.0145;

export function calcPay(input: PayrollCalcInput): PayrollCalcResult {
  let gross = 0;
  if (input.payType === "hourly") {
    gross = input.regularHours * input.payRate + input.overtimeHours * input.payRate * 1.5;
  } else {
    const periods = input.payPeriodsPerYear || 26;
    gross = input.payRate / periods;
  }
  gross = Math.round(gross * 100) / 100;
  const federalTax = round2(gross * FEDERAL_RATE);
  const stateTax = round2(gross * STATE_RATE);
  const socialSecurity = round2(gross * SOCIAL_SECURITY);
  const medicare = round2(gross * MEDICARE);
  const net = round2(gross - federalTax - stateTax - socialSecurity - medicare);
  return {
    gross,
    federalTax,
    stateTax,
    socialSecurity,
    medicare,
    net,
    regularHours: input.regularHours,
    overtimeHours: input.overtimeHours,
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export function fmtUSD(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));
}
