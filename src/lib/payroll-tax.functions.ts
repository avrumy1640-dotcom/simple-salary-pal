import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Phase A.3 — Bracketed tax calculator.
 *
 * Computes per-paycheck withholding using versioned brackets in `tax_brackets`,
 * `tax_standard_deductions`, and `tax_flat_rates`. Federal Pub 15-T Worksheet 1A
 * shape: gross → pre-tax → annualize → bracket lookup → divide by periods →
 * subtract dependent credit per period → add extra withholding → floor at 0.
 *
 * Stateless reference math: no PII reads, no writes. Reference data is
 * world-readable to authenticated users (RLS allows SELECT).
 */

type FilingStatus = 'single' | 'married' | 'married_separate' | 'head_of_household';
type PayFrequency = 'annual' | 'biweekly' | 'semimonthly' | 'weekly' | 'monthly' | 'daily' | 'quarterly';

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  annual: 1,
  quarterly: 4,
  monthly: 12,
  semimonthly: 24,
  biweekly: 26,
  weekly: 52,
  daily: 260,
};

export interface PeriodWithholdingInput {
  wages: number; // gross wages for the period
  preTaxDeductions?: number; // 401k pretax, section 125, etc.
  ytdWages?: number; // YTD gross BEFORE this period (for SS cap / add'l medicare)
  filingStatus: FilingStatus;
  dependentsUnder17?: number;
  dependentsOther?: number;
  extraWithholding?: number; // per period, W-4 Step 4(c)
  jurisdiction?: string; // 'US' default; e.g. 'US-CA' for state income
  payFrequency: PayFrequency;
  payDate: string; // ISO yyyy-mm-dd
}

export interface WithholdingLine {
  code: string;
  description: string;
  amount: number;
  isEmployer: boolean;
}

export interface PeriodWithholdingResult {
  taxableWages: number;
  annualizedTaxableWages: number;
  lines: WithholdingLine[];
  totals: {
    employeeTax: number;
    employerTax: number;
    netReduction: number;
  };
  meta: {
    federalVersionId: string | null;
    ficaVersionId: string | null;
    medicareVersionId: string | null;
    notes: string[];
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const computePeriodWithholding = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PeriodWithholdingInput) => {
    if (!input || typeof input.wages !== 'number' || input.wages < 0) {
      throw new Error('wages must be a non-negative number');
    }
    if (!input.filingStatus) throw new Error('filingStatus required');
    if (!input.payFrequency) throw new Error('payFrequency required');
    if (!input.payDate) throw new Error('payDate required');
    return input;
  })
  .handler(async ({ data, context }): Promise<PeriodWithholdingResult> => {
    const { supabase } = context;
    const jurisdiction = data.jurisdiction ?? 'US';
    const periods = PERIODS_PER_YEAR[data.payFrequency] ?? 26;
    const preTax = Math.max(0, data.preTaxDeductions ?? 0);
    const taxable = Math.max(0, data.wages - preTax);
    const annualized = taxable * periods;
    const ytd = Math.max(0, data.ytdWages ?? 0);
    const extra = Math.max(0, data.extraWithholding ?? 0);

    const notes: string[] = [];
    const lines: WithholdingLine[] = [];

    // --- Federal income tax (or state, if jurisdiction is a state) ---
    const incVersionId = await resolveVersion(supabase, jurisdiction, 'income', data.payDate);
    let fedIncome = 0;
    if (incVersionId) {
      // Get annual brackets for this filing status
      const { data: brackets, error: bErr } = await supabase
        .from('tax_brackets')
        .select('lower_amount, upper_amount, base_tax, marginal_rate')
        .eq('version_id', incVersionId)
        .eq('filing_status', data.filingStatus)
        .eq('pay_frequency', 'annual')
        .order('lower_amount', { ascending: true });
      if (bErr) throw new Error(`bracket lookup failed: ${bErr.message}`);

      const annualTax = bracketTax(annualized, brackets ?? []);

      // Dependent credit (annual) per Pub 15-T Step 3
      const { data: sd } = await supabase
        .from('tax_standard_deductions')
        .select('dependent_credit_under17, dependent_credit_other')
        .eq('version_id', incVersionId)
        .eq('filing_status', data.filingStatus)
        .eq('pay_frequency', 'annual')
        .maybeSingle();
      const credit =
        (data.dependentsUnder17 ?? 0) * Number(sd?.dependent_credit_under17 ?? 0) +
        (data.dependentsOther ?? 0) * Number(sd?.dependent_credit_other ?? 0);

      const perPeriod = Math.max(0, (annualTax - credit) / periods) + extra;
      fedIncome = round2(perPeriod);
      lines.push({
        code: jurisdiction === 'US' ? 'federal_income' : 'state_income',
        description: jurisdiction === 'US' ? 'Federal income tax' : `${jurisdiction} income tax`,
        amount: fedIncome,
        isEmployer: false,
      });
    } else {
      notes.push(`No income tax table on file for ${jurisdiction} on ${data.payDate}`);
    }

    // --- FICA / Medicare / Add'l Medicare / FUTA (federal only) ---
    let ficaVersionId: string | null = null;
    let medVersionId: string | null = null;

    if (jurisdiction === 'US') {
      ficaVersionId = await resolveVersion(supabase, 'US', 'fica', data.payDate);
      medVersionId = await resolveVersion(supabase, 'US', 'medicare', data.payDate);
      const addMedId = await resolveVersion(supabase, 'US', 'add_medicare', data.payDate);
      const futaId = await resolveVersion(supabase, 'US', 'futa', data.payDate);

      // Social Security: wage base cap on YTD
      if (ficaVersionId) {
        const { data: rates } = await supabase
          .from('tax_flat_rates')
          .select('rate, wage_base_cap, is_employee, is_employer')
          .eq('version_id', ficaVersionId)
          .eq('code', 'social_security');
        for (const r of rates ?? []) {
          const cap = Number(r.wage_base_cap ?? 0);
          const taxableForSS = cap > 0 ? Math.max(0, Math.min(taxable, cap - ytd)) : taxable;
          const amt = round2(taxableForSS * Number(r.rate));
          lines.push({
            code: 'social_security',
            description: r.is_employer ? 'Social Security (employer)' : 'Social Security',
            amount: amt,
            isEmployer: !!r.is_employer,
          });
        }
      }

      // Medicare: no cap
      if (medVersionId) {
        const { data: rates } = await supabase
          .from('tax_flat_rates')
          .select('rate, is_employee, is_employer')
          .eq('version_id', medVersionId)
          .eq('code', 'medicare');
        for (const r of rates ?? []) {
          const amt = round2(taxable * Number(r.rate));
          lines.push({
            code: 'medicare',
            description: r.is_employer ? 'Medicare (employer)' : 'Medicare',
            amount: amt,
            isEmployer: !!r.is_employer,
          });
        }
      }

      // Additional Medicare: employee only, kicks in over threshold YTD
      if (addMedId) {
        const { data: rates } = await supabase
          .from('tax_flat_rates')
          .select('rate, threshold')
          .eq('version_id', addMedId)
          .eq('code', 'add_medicare')
          .maybeSingle();
        if (rates) {
          const threshold = Number(rates.threshold ?? 200000);
          const overBefore = Math.max(0, ytd - threshold);
          const overAfter = Math.max(0, ytd + taxable - threshold);
          const taxableOver = Math.max(0, overAfter - overBefore);
          if (taxableOver > 0) {
            lines.push({
              code: 'additional_medicare',
              description: 'Additional Medicare (0.9%)',
              amount: round2(taxableOver * Number(rates.rate)),
              isEmployer: false,
            });
          }
        }
      }

      // FUTA: employer only, capped at wage base
      if (futaId) {
        const { data: rates } = await supabase
          .from('tax_flat_rates')
          .select('rate, wage_base_cap')
          .eq('version_id', futaId)
          .eq('code', 'futa')
          .maybeSingle();
        if (rates) {
          const cap = Number(rates.wage_base_cap ?? 7000);
          const taxableForFuta = Math.max(0, Math.min(taxable, cap - ytd));
          if (taxableForFuta > 0) {
            lines.push({
              code: 'employer_futa',
              description: 'FUTA (employer)',
              amount: round2(taxableForFuta * Number(rates.rate)),
              isEmployer: true,
            });
          }
        }
      }
    }

    const employeeTax = lines.filter((l) => !l.isEmployer).reduce((s, l) => s + l.amount, 0);
    const employerTax = lines.filter((l) => l.isEmployer).reduce((s, l) => s + l.amount, 0);

    return {
      taxableWages: round2(taxable),
      annualizedTaxableWages: round2(annualized),
      lines,
      totals: {
        employeeTax: round2(employeeTax),
        employerTax: round2(employerTax),
        netReduction: round2(employeeTax),
      },
      meta: {
        federalVersionId: incVersionId,
        ficaVersionId,
        medicareVersionId: medVersionId,
        notes,
      },
    };
  });

// --- helpers ---

async function resolveVersion(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: unknown }> },
  jurisdiction: string,
  taxType: string,
  on: string,
): Promise<string | null> {
  const { data } = await supabase.rpc('resolve_tax_version', {
    _jurisdiction: jurisdiction,
    _tax_type: taxType,
    _on: on,
  });
  return (data as string | null) ?? null;
}

interface Bracket {
  lower_amount: number;
  upper_amount: number | null;
  base_tax: number;
  marginal_rate: number;
}

function bracketTax(amount: number, brackets: Bracket[]): number {
  if (!brackets.length) return 0;
  // Brackets are ordered ascending by lower_amount; pick the row containing `amount`.
  for (let i = brackets.length - 1; i >= 0; i--) {
    const b = brackets[i];
    const lo = Number(b.lower_amount);
    if (amount >= lo) {
      const base = Number(b.base_tax);
      const rate = Number(b.marginal_rate);
      return base + (amount - lo) * rate;
    }
  }
  return 0;
}

/** Lightweight summary view for the admin/employee tax-tables status page. */
export const listTaxTablesStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('tax_tables_status')
      .select('code, name, kind, tax_type, effective_start, effective_end, is_active');
    if (error) throw new Error(error.message);
    return data ?? [];
  });
