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

// ---------- State income tax (2025 approximations) ----------
// Flat-rate states pay [rate]. No-income-tax states are explicitly 0.
// Progressive states use simplified brackets keyed off annual taxable wages.
// This is a fallback for when no Symmetry/Avalara provider is wired.
const STATE_NO_TAX = new Set(["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"]);
const STATE_FLAT_RATE: Record<string, number> = {
  AZ: 0.025, CO: 0.044, IL: 0.0495, IN: 0.0305, KY: 0.04,
  MA: 0.05,  MI: 0.0425, NC: 0.045,  PA: 0.0307, UT: 0.0465,
  ID: 0.058, GA: 0.0539, MS: 0.047,  IA: 0.038,
};
// Simplified progressive brackets [annualFloor, rate] (single filer approximation).
const STATE_PROGRESSIVE: Record<string, Array<[number, number]>> = {
  CA: [[0, 0.01], [10412, 0.02], [24684, 0.04], [38959, 0.06], [54081, 0.08], [68350, 0.093], [349137, 0.103], [418961, 0.113], [698271, 0.123]],
  NY: [[0, 0.04], [8500, 0.045], [11700, 0.0525], [13900, 0.055], [80650, 0.06], [215400, 0.0685], [1077550, 0.0965], [5000000, 0.103], [25000000, 0.109]],
  NJ: [[0, 0.014], [20000, 0.0175], [35000, 0.035], [40000, 0.0553], [75000, 0.0637], [500000, 0.0897], [1000000, 0.1075]],
  OR: [[0, 0.0475], [4300, 0.0675], [10750, 0.0875], [125000, 0.099]],
  MN: [[0, 0.0535], [31690, 0.068], [104090, 0.0785], [193240, 0.0985]],
  HI: [[0, 0.014], [9600, 0.064], [14400, 0.068], [19200, 0.072], [24000, 0.076], [36000, 0.079], [48000, 0.0825], [150000, 0.09], [175000, 0.10], [200000, 0.11]],
  VA: [[0, 0.02], [3000, 0.03], [5000, 0.05], [17000, 0.0575]],
  MD: [[0, 0.02], [1000, 0.03], [2000, 0.04], [3000, 0.0475], [100000, 0.05], [125000, 0.0525], [150000, 0.055], [250000, 0.0575]],
  OH: [[0, 0], [26050, 0.0275], [100000, 0.035]],
  WI: [[0, 0.035], [14320, 0.044], [28640, 0.053], [315310, 0.0765]],
  CT: [[0, 0.02], [10000, 0.045], [50000, 0.055], [100000, 0.06], [200000, 0.065], [250000, 0.069], [500000, 0.0699]],
  ME: [[0, 0.058], [26050, 0.0675], [61600, 0.0715]],
  DE: [[0, 0], [2000, 0.022], [5000, 0.039], [10000, 0.048], [20000, 0.052], [25000, 0.0555], [60000, 0.066]],
  NM: [[0, 0.017], [5500, 0.032], [11000, 0.047], [16000, 0.049], [210000, 0.059]],
  AR: [[0, 0], [5300, 0.02], [10600, 0.03], [15100, 0.034], [25000, 0.039], [89600, 0.044]],
  WV: [[0, 0.0236], [10000, 0.0315], [25000, 0.0354], [40000, 0.0472], [60000, 0.0512]],
  SC: [[0, 0], [3460, 0.03], [17330, 0.064]],
  AL: [[0, 0.02], [500, 0.04], [3000, 0.05]],
  MO: [[0, 0], [1273, 0.02], [2546, 0.025], [3819, 0.03], [5092, 0.035], [6365, 0.04], [7638, 0.045], [8911, 0.048]],
  OK: [[0, 0.0025], [1000, 0.0075], [2500, 0.0175], [3750, 0.0275], [4900, 0.0375], [7200, 0.0475]],
  ND: [[0, 0], [44725, 0.0195], [225975, 0.025]],
  RI: [[0, 0.0375], [77450, 0.0475], [176050, 0.0599]],
  VT: [[0, 0.0335], [45400, 0.066], [110050, 0.076], [229550, 0.0875]],
  KS: [[0, 0.031], [15000, 0.0525], [30000, 0.057]],
  LA: [[0, 0.0185], [12500, 0.035], [50000, 0.0425]],
  NE: [[0, 0.0246], [3700, 0.0351], [22170, 0.0501], [35730, 0.0584]],
  DC: [[0, 0.04], [10000, 0.06], [40000, 0.065], [60000, 0.085], [250000, 0.0925], [500000, 0.0975], [1000000, 0.1075]],
  MT: [[0, 0.047], [20500, 0.059]],
};

function annualStateTax(stateCode: string | undefined, annualTaxable: number): number {
  if (annualTaxable <= 0) return 0;
  const code = (stateCode || "").toUpperCase();
  if (!code) return annualTaxable * 0.04; // legacy fallback
  if (STATE_NO_TAX.has(code)) return 0;
  const flat = STATE_FLAT_RATE[code];
  if (flat != null) return annualTaxable * flat;
  const brackets = STATE_PROGRESSIVE[code];
  if (!brackets) return annualTaxable * 0.04; // unknown jurisdiction fallback
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
