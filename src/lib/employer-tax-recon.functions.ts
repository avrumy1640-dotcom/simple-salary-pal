import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const ADMIN = ['owner', 'admin', 'payroll_admin', 'accountant'] as const;

async function requireAdmin(context: { supabase: any; userId: string }, companyId: string) {
  const { data, error } = await context.supabase.rpc('has_any_role', {
    _user_id: context.userId,
    _company_id: companyId,
    _roles: ADMIN,
  });
  if (error) throw error;
  if (!data) throw new Error('Forbidden: payroll admin role required');
}

export const listTaxPayments = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { company_id: string; year?: number }) => {
    if (!input?.company_id) throw new Error('company_id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from('employer_tax_payments')
      .select('*')
      .eq('company_id', data.company_id)
      .order('paid_on', { ascending: false });
    if (data.year) {
      q = q.gte('period_end', `${data.year}-01-01`).lte('period_end', `${data.year}-12-31`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const recordTaxPayment = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      company_id: string;
      agency: string;
      tax_kind: string;
      period_start: string;
      period_end: string;
      amount: number;
      paid_on: string;
      confirmation_ref?: string;
      status?: 'pending' | 'submitted' | 'confirmed' | 'reconciled' | 'rejected';
      notes?: string;
    }) => {
      if (!input?.company_id || !input?.agency || !input?.tax_kind) throw new Error('missing fields');
      if (!(input.amount >= 0)) throw new Error('amount required');
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.company_id);
    const { data: row, error } = await context.supabase
      .from('employer_tax_payments')
      .insert({
        company_id: data.company_id,
        agency: data.agency,
        tax_kind: data.tax_kind,
        period_start: data.period_start,
        period_end: data.period_end,
        amount: data.amount,
        paid_on: data.paid_on,
        confirmation_ref: data.confirmation_ref ?? null,
        status: data.status ?? 'confirmed',
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const reconcileEmployerTax = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { company_id: string; year: number }) => {
    if (!input?.company_id || !input?.year) throw new Error('company_id + year required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc('reconcile_employer_tax', {
      _company_id: data.company_id,
      _year: data.year,
    });
    if (error) throw error;
    return (rows ?? []) as { tax_kind: string; accrued: number; paid: number; variance: number }[];
  });

export const listYtdSnapshots = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { company_id: string; tax_year: number }) => {
    if (!input?.company_id || !input?.tax_year) throw new Error('company_id + tax_year required');
    return input;
  })
  .handler(async ({ data, context }) => {
    // Latest snapshot per employee for the year
    const { data: rows, error } = await context.supabase
      .from('payroll_ytd_snapshots')
      .select('employee_id, pay_date, ytd_gross, ytd_fed_tax, ytd_ss_tax, ytd_medicare_tax, ytd_state_tax, ytd_net, employees:employee_id(full_name)')
      .eq('company_id', data.company_id)
      .eq('tax_year', data.tax_year)
      .order('pay_date', { ascending: false });
    if (error) throw error;

    const latest = new Map<string, any>();
    for (const r of rows ?? []) {
      if (!latest.has(r.employee_id)) latest.set(r.employee_id, r);
    }
    return [...latest.values()];
  });
