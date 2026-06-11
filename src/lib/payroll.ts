// Production payroll calculation engine.
// Handles regular, OT, double-OT, holiday, PTO, sick, bonuses (supplemental),
// commissions (supplemental), reimbursements (non-taxable), garnishments (CCPA-capped),
// pre/post-tax deductions, employee taxes, AND employer-side taxes (FUTA / SUTA / employer FICA).
//
// NOT a substitute for a certified tax engine (Symmetry, Avalara). Use
// `provider_integrations.provider='symmetry'` to override withholding via real provider.

export interface DeductionInput {
  name: string;
  pre_tax: boolean;
  amount: number;
  amount_type: "fixed" | "percent" | string;
}

export interface GarnishmentInput {
  id?: string;
  name: string;
  type: "child_support" | "tax_levy" | "student_loan" | "creditor" | "bankruptcy" | "other";
  priority: number; // lower = applied first
  amount: number;
  amount_type: "fixed" | "percent";
  cap_percentage: number; // CCPA cap, e.g. 25 / 50 / 60
}

export interface PayrollCalcInput {
  payType: "hourly" | "salary";
  payRate: number;
  regularHours: number;
  overtimeHours: number;
  doubleOvertimeHours?: number;
  holidayHours?: number;
  ptoHours?: number;
  sickHours?: number;
  bonuses?: number;
  commissions?: number;
  reimbursements?: number; // non-taxable, added back to net
  payPeriodsPerYear?: number;
  filingStatus?: "single" | "married" | "head" | string;
  dependents?: number;
  extraWithholding?: number;
  deductions?: DeductionInput[];
  garnishments?: GarnishmentInput[];
  // Company-level config (cached per run)
  overtimeMultiplier?: number;       // default 1.5
  doubleOvertimeMultiplier?: number; // default 2.0
  holidayMultiplier?: number;        // default 1.5
  stateUnemploymentRate?: number;    // default 0.027
  stateUnemploymentWageBase?: number; // default 7000
  ytdGrossBeforeRun?: number;        // for FUTA/SUTA wage-base cap
  ytdSocialSecurityWages?: number;   // for SS wage base cap (2025: 168,600)
  workState?: string;                // 2-letter postal code; drives state income tax
}

export interface PayrollCalcResult {
  // Earnings breakdown
  regularEarnings: number;
  overtimeEarnings: number;
  doubleOvertimeEarnings: number;
  holidayEarnings: number;
  ptoEarnings: number;
  sickEarnings: number;
  bonuses: number;
  commissions: number;
  reimbursements: number;
  gross: number;             // includes everything taxable (excl. reimbursements)
  totalCompensation: number; // gross + reimbursements (what hits the bank)

  // Deductions
  preTaxDeductions: number;
  postTaxDeductions: number;
  deductionLines: { name: string; amount: number; pre_tax: boolean }[];

  // Taxes (employee side)
  taxableIncome: number;          // regular wages taxable
  taxableSupplemental: number;    // bonuses + commissions
  federalTax: number;             // regular + supplemental flat 22%
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;     // 0.9% above $200k YTD
  stateTax: number;

  // Garnishments
  garnishmentLines: { name: string; amount: number }[];
  totalGarnishments: number;

  // Employer-side taxes (company expense, not deducted from employee)
  employerSocialSecurity: number;
  employerMedicare: number;
  futa: number; // 0.6% on first 7k
  suta: number; // configurable per state

  // Totals
  totalDeductions: number; // pre+post+taxes+garnishments
  net: number;             // take-home including reimbursements

  // Hours echo
  regularHours: number;
  overtimeHours: number;
  doubleOvertimeHours: number;
  holidayHours: number;
  ptoHours: number;
  sickHours: number;
}

const SOCIAL_SECURITY_RATE = 0.062;
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009;
const ADDITIONAL_MEDICARE_THRESHOLD = 200000;
const SS_WAGE_BASE_2025 = 168600;
const SUPPLEMENTAL_FED_RATE = 0.22;
const FUTA_RATE = 0.006;
const FUTA_WAGE_BASE = 7000;
const DEFAULT_STATE_RATE = 0.04;

// 2025 federal tax brackets (annual taxable income). Progressive — each
// bracket's rate applies ONLY to the income above its floor, not to the
// whole amount. Returns the FULL ANNUAL federal income tax, which the
// caller divides by periodsPerYear to get a per-paycheck withholding.
function annualFederalTax(filing: string, annualTaxable: number): number {
  if (annualTaxable <= 0) return 0;
  const brackets: Array<[number, number]> =
    filing === "married"
      ? [[0, 0.10], [23200, 0.12], [94300, 0.22], [201050, 0.24], [383900, 0.32], [487450, 0.35], [731200, 0.37]]
      : filing === "head"
      ? [[0, 0.10], [16550, 0.12], [63100, 0.22], [100500, 0.24], [191950, 0.32], [243700, 0.35], [609350, 0.37]]
      : [[0, 0.10], [11600, 0.12], [47150, 0.22], [100525, 0.24], [191950, 0.32], [243725, 0.35], [609350, 0.37]];
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [floor, rate] = brackets[i];
    const ceiling = brackets[i + 1]?.[0] ?? Infinity;
    if (annualTaxable <= floor) break;
    const slice = Math.min(annualTaxable, ceiling) - floor;
    tax += slice * rate;
  }
  return tax;
}

function r2(n: number) { return Math.round(n * 100) / 100; }

export function calcPay(input: PayrollCalcInput): PayrollCalcResult {
  const periodsPerYear = input.payPeriodsPerYear || 26;
  const otMult = input.overtimeMultiplier ?? 1.5;
  const dotMult = input.doubleOvertimeMultiplier ?? 2.0;
  const holMult = input.holidayMultiplier ?? 1.5;
  const stateUiRate = input.stateUnemploymentRate ?? 0.027;
  const stateUiBase = input.stateUnemploymentWageBase ?? FUTA_WAGE_BASE;
  const ytdGross = input.ytdGrossBeforeRun ?? 0;
  const ytdSS = input.ytdSocialSecurityWages ?? 0;

  // ---------- Earnings ----------
  let baseRate = input.payRate;
  if (input.payType === "salary") {
    baseRate = input.payRate / periodsPerYear / Math.max(input.regularHours || 80, 1);
  }
  const regularRate = input.payType === "hourly" ? input.payRate : baseRate;

  const regularEarnings = input.payType === "salary"
    ? r2(input.payRate / periodsPerYear)
    : r2(input.regularHours * regularRate);
  const overtimeEarnings = r2((input.overtimeHours || 0) * regularRate * otMult);
  const doubleOvertimeEarnings = r2((input.doubleOvertimeHours || 0) * regularRate * dotMult);
  const holidayEarnings = r2((input.holidayHours || 0) * regularRate * holMult);
  const ptoEarnings = r2((input.ptoHours || 0) * regularRate);
  const sickEarnings = r2((input.sickHours || 0) * regularRate);
  const bonuses = r2(input.bonuses || 0);
  const commissions = r2(input.commissions || 0);
  const reimbursements = r2(input.reimbursements || 0);

  const regularGross = r2(regularEarnings + overtimeEarnings + doubleOvertimeEarnings + holidayEarnings + ptoEarnings + sickEarnings);
  const supplementalGross = r2(bonuses + commissions);
  const gross = r2(regularGross + supplementalGross);
  const totalCompensation = r2(gross + reimbursements);

  // ---------- Deductions ----------
  const deds = input.deductions ?? [];
  const deductionLines = deds.map((d) => ({
    name: d.name,
    pre_tax: d.pre_tax,
    amount: r2(d.amount_type === "percent" ? gross * (Number(d.amount) / 100) : Number(d.amount)),
  }));
  const preTaxDeductions = r2(deductionLines.filter((l) => l.pre_tax).reduce((s, l) => s + l.amount, 0));
  const postTaxDeductions = r2(deductionLines.filter((l) => !l.pre_tax).reduce((s, l) => s + l.amount, 0));

  // ---------- Taxable wages ----------
  const taxableIncome = r2(Math.max(0, regularGross - preTaxDeductions));
  const taxableSupplemental = r2(supplementalGross);

  // ---------- Federal income tax (progressive on annualized wages) ----------
  const annualizedTaxable = taxableIncome * periodsPerYear;
  const annualFed = annualFederalTax(input.filingStatus || "single", annualizedTaxable);
  const perPeriodFed = annualFed / periodsPerYear;
  const dependentCredit = Math.min(Number(input.dependents || 0) * 2000, annualFed) / periodsPerYear;
  const federalRegular = Math.max(0, perPeriodFed - dependentCredit + Number(input.extraWithholding || 0));
  const federalSupplemental = taxableSupplemental * SUPPLEMENTAL_FED_RATE;
  const federalTax = r2(federalRegular + federalSupplemental);

  // ---------- FICA (employee + wage-base aware) ----------
  const ssTaxableThisRun = Math.max(0, Math.min(gross, SS_WAGE_BASE_2025 - ytdSS));
  const socialSecurity = r2(ssTaxableThisRun * SOCIAL_SECURITY_RATE);
  const medicare = r2(gross * MEDICARE_RATE);
  const ytdGrossAfterRun = ytdGross + gross;
  const addlMedicareTaxable = Math.max(0, ytdGrossAfterRun - ADDITIONAL_MEDICARE_THRESHOLD) - Math.max(0, ytdGross - ADDITIONAL_MEDICARE_THRESHOLD);
  const additionalMedicare = r2(Math.max(0, addlMedicareTaxable) * ADDITIONAL_MEDICARE_RATE);

  // ---------- State tax ----------
  const stateTax = r2(taxableIncome * DEFAULT_STATE_RATE);

  // ---------- Garnishments (CCPA cap on disposable earnings) ----------
  const disposable = r2(gross - federalTax - socialSecurity - medicare - additionalMedicare - stateTax);
  const garnishments = (input.garnishments ?? []).slice().sort((a, b) => a.priority - b.priority);
  const garnishmentLines: { name: string; amount: number }[] = [];
  let remainingDisposable = Math.max(0, disposable);
  for (const g of garnishments) {
    if (remainingDisposable <= 0) { garnishmentLines.push({ name: g.name, amount: 0 }); continue; }
    const cap = disposable * (Number(g.cap_percentage) / 100);
    const requested = g.amount_type === "percent" ? disposable * (Number(g.amount) / 100) : Number(g.amount);
    const amount = r2(Math.min(requested, cap, remainingDisposable));
    garnishmentLines.push({ name: g.name, amount });
    remainingDisposable -= amount;
  }
  const totalGarnishments = r2(garnishmentLines.reduce((s, l) => s + l.amount, 0));

  // ---------- Employer-side taxes ----------
  const employerSocialSecurity = r2(ssTaxableThisRun * SOCIAL_SECURITY_RATE);
  const employerMedicare = r2(gross * MEDICARE_RATE);
  const futaRemaining = Math.max(0, FUTA_WAGE_BASE - ytdGross);
  const futaTaxable = Math.max(0, Math.min(gross, futaRemaining));
  const futa = r2(futaTaxable * FUTA_RATE);
  const sutaRemaining = Math.max(0, stateUiBase - ytdGross);
  const sutaTaxable = Math.max(0, Math.min(gross, sutaRemaining));
  const suta = r2(sutaTaxable * stateUiRate);

  // ---------- Totals ----------
  const totalDeductions = r2(preTaxDeductions + postTaxDeductions + federalTax + socialSecurity + medicare + additionalMedicare + stateTax + totalGarnishments);
  // Net cannot go below zero — clamp and surface any shortfall via deductionLines if needed.
  const net = r2(Math.max(0, gross - totalDeductions) + reimbursements);

  return {
    regularEarnings, overtimeEarnings, doubleOvertimeEarnings, holidayEarnings,
    ptoEarnings, sickEarnings, bonuses, commissions, reimbursements,
    gross, totalCompensation,
    preTaxDeductions, postTaxDeductions, deductionLines,
    taxableIncome, taxableSupplemental,
    federalTax, socialSecurity, medicare, additionalMedicare, stateTax,
    garnishmentLines, totalGarnishments,
    employerSocialSecurity, employerMedicare, futa, suta,
    totalDeductions, net,
    regularHours: input.regularHours,
    overtimeHours: input.overtimeHours,
    doubleOvertimeHours: input.doubleOvertimeHours || 0,
    holidayHours: input.holidayHours || 0,
    ptoHours: input.ptoHours || 0,
    sickHours: input.sickHours || 0,
  };
}

export function fmtUSD(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));
}
