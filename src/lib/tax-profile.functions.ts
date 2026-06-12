import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Phase B — Multi-state withholding helpers.
 *
 * - listEmployeeTaxProfiles / upsertEmployeeTaxProfile / deleteEmployeeTaxProfile
 *   manage rows in `employee_tax_profiles`. Federal is always one row.
 * - apportionWages splits period wages across jurisdictions using
 *   work_state_allocations (or the employee's primary work state).
 * - listReciprocity / listNonResidentRules / listStateEmployerTaxes expose
 *   the reference data used by the calculator and admin UI.
 */

export interface TaxProfileInput {
  id?: string;
  company_id: string;
  employee_id: string;
  jurisdiction_id: string;
  is_resident?: boolean;
  is_work_location?: boolean;
  filing_status?: 'single' | 'married' | 'married_separate' | 'head_of_household';
  allowances?: number;
  dependents_under17?: number;
  dependents_other?: number;
  extra_withholding?: number;
  exempt?: boolean;
  exempt_reason?: string | null;
  effective_start?: string;
  effective_end?: string | null;
}

export const listEmployeeTaxProfiles = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { employee_id: string }) => {
    if (!input?.employee_id) throw new Error('employee_id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from('employee_tax_profiles')
      .select('*, jurisdiction:tax_jurisdictions(code,name,kind)')
      .eq('employee_id', data.employee_id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertEmployeeTaxProfile = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TaxProfileInput) => {
    if (!input.company_id || !input.employee_id || !input.jurisdiction_id) {
      throw new Error('company_id, employee_id, jurisdiction_id required');
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const payload = {
      company_id: data.company_id,
      employee_id: data.employee_id,
      jurisdiction_id: data.jurisdiction_id,
      is_resident: data.is_resident ?? false,
      is_work_location: data.is_work_location ?? false,
      filing_status: data.filing_status ?? 'single',
      allowances: data.allowances ?? 0,
      dependents_under17: data.dependents_under17 ?? 0,
      dependents_other: data.dependents_other ?? 0,
      extra_withholding: data.extra_withholding ?? 0,
      exempt: data.exempt ?? false,
      exempt_reason: data.exempt_reason ?? null,
      effective_start: data.effective_start ?? new Date().toISOString().slice(0, 10),
      effective_end: data.effective_end ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from('employee_tax_profiles')
        .update(payload)
        .eq('id', data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    } else {
      const { data: row, error } = await context.supabase
        .from('employee_tax_profiles')
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
  });

export const deleteEmployeeTaxProfile = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error('id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from('employee_tax_profiles').delete().eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- apportionment ---

export interface WageAllocation {
  jurisdiction_code: string;
  taxable_wages: number;
}

export interface ApportionInput {
  period_wages: number;
  allocations?: Array<{ jurisdiction_code: string; pct?: number; hours?: number }>;
  primary_work_state?: string; // fallback when no allocations
  home_state?: string; // resident state (used for reciprocity suppression)
}

/**
 * Splits period_wages across jurisdictions.
 * - If `allocations` is provided, splits by pct (preferred) or hours.
 * - Otherwise 100% to primary_work_state.
 * - Reciprocity: if home_state has a `state_reciprocity` entry against the
 *   work state, that share is reassigned to home_state (caller must verify
 *   the certificate is on file).
 */
export const apportionWages = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ApportionInput) => {
    if (typeof input?.period_wages !== 'number' || input.period_wages < 0) {
      throw new Error('period_wages must be a non-negative number');
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<WageAllocation[]> => {
    const wages = data.period_wages;
    const allocs = data.allocations && data.allocations.length > 0
      ? data.allocations
      : data.primary_work_state
        ? [{ jurisdiction_code: data.primary_work_state, pct: 100 }]
        : [];

    if (allocs.length === 0) return [];

    // Normalize pct or hours into shares
    const totalPct = allocs.reduce((s, a) => s + (a.pct ?? 0), 0);
    const totalHours = allocs.reduce((s, a) => s + (a.hours ?? 0), 0);
    const useHours = totalPct === 0 && totalHours > 0;

    let split: WageAllocation[] = allocs.map((a) => {
      const share = useHours ? (a.hours ?? 0) / totalHours : (a.pct ?? 0) / Math.max(totalPct, 1);
      return {
        jurisdiction_code: a.jurisdiction_code,
        taxable_wages: Math.round(wages * share * 100) / 100,
      };
    });

    // Apply reciprocity: if home_state has a reciprocity row with this work state,
    // move that share to home_state.
    if (data.home_state) {
      const workStates = Array.from(new Set(split.map((s) => s.jurisdiction_code)));
      const { data: recs } = await context.supabase
        .from('state_reciprocity')
        .select('home_state, work_state')
        .eq('home_state', data.home_state)
        .in('work_state', workStates);
      const reciprocalWorkStates = new Set((recs ?? []).map((r) => r.work_state));
      if (reciprocalWorkStates.size > 0) {
        let homeAcc = split.find((s) => s.jurisdiction_code === data.home_state);
        const remainder: WageAllocation[] = [];
        for (const row of split) {
          if (reciprocalWorkStates.has(row.jurisdiction_code) && row.jurisdiction_code !== data.home_state) {
            if (!homeAcc) {
              homeAcc = { jurisdiction_code: data.home_state, taxable_wages: 0 };
              remainder.push(homeAcc);
            }
            homeAcc.taxable_wages = Math.round((homeAcc.taxable_wages + row.taxable_wages) * 100) / 100;
          } else {
            remainder.push(row);
          }
        }
        split = remainder;
      }
    }

    return split;
  });

// --- reference data lookups (for admin UI) ---

export const listJurisdictions = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('tax_jurisdictions')
      .select('id, code, name, kind')
      .order('kind')
      .order('code');
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listReciprocity = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('state_reciprocity')
      .select('*')
      .order('home_state');
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listStateEmployerTaxes = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('state_employer_taxes')
      .select('*')
      .order('state_code')
      .order('tax_code');
    if (error) throw new Error(error.message);
    return data ?? [];
  });
