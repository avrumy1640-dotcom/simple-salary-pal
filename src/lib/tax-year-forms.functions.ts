import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Phase C — Year-end W-2 / 1099-NEC generation.
 *
 * Aggregates paid payroll runs (and contractor payments) into per-recipient
 * tax_year_forms rows. Pure SQL/JS — no external filing API yet.
 *
 * Helper functions (PDF render / EFW2 / IRIS) are imported from
 * tax-year-forms.helpers and run server-side inside handlers.
 */

const ADMIN_ROLES = ['owner', 'admin', 'payroll_admin', 'accountant'] as const;

async function requireAdmin(context: { supabase: any; userId: string }, companyId: string) {
  const { data, error } = await context.supabase.rpc('has_any_role', {
    _user_id: context.userId,
    _company_id: companyId,
    _roles: ADMIN_ROLES,
  });
  if (error) throw error;
  if (!data) throw new Error('Forbidden: payroll admin role required');
}

// ─── List runs / forms ──────────────────────────────────────────────

export const listTaxYearRuns = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { company_id: string }) => {
    if (!input?.company_id) throw new Error('company_id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from('tax_year_runs')
      .select('*')
      .eq('company_id', data.company_id)
      .order('tax_year', { ascending: false })
      .order('kind', { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const listTaxYearForms = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string }) => {
    if (!input?.run_id) throw new Error('run_id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from('tax_year_forms')
      .select('*')
      .eq('run_id', data.run_id)
      .is('superseded_by', null)
      .order('recipient_name', { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

/** Employee/contractor self-service — read their own current + prior forms. */
export const listMyTaxForms = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // RLS does the filtering — Employee policy and Contractor policy
    // restrict rows to the signed-in user's own employee_id / contractor.email.
    const { data, error } = await context.supabase
      .from('tax_year_forms')
      .select('id, tax_year, kind, recipient_name, recipient_tin_last4, box_1_wages, box_2_fed_tax, nec_box_1_nonemployee_comp, generated_at, pdf_storage_path')
      .order('tax_year', { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

// ─── W-2 generation ─────────────────────────────────────────────────

export const generateW2Run = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { company_id: string; tax_year: number }) => {
    if (!input?.company_id) throw new Error('company_id required');
    if (!input?.tax_year || input.tax_year < 2000 || input.tax_year > 2100) {
      throw new Error('tax_year required');
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.company_id);
    const { company_id, tax_year } = data;
    const start = `${tax_year}-01-01`;
    const end = `${tax_year}-12-31`;

    // 1. Lock: refuse if any runs in year are not paid.
    const { data: pending, error: pendErr } = await context.supabase
      .from('payroll_runs')
      .select('id, status, pay_date')
      .eq('company_id', company_id)
      .gte('pay_date', start)
      .lte('pay_date', end)
      .neq('status', 'paid')
      .neq('status', 'reversed');
    if (pendErr) throw pendErr;
    if ((pending ?? []).length > 0) {
      throw new Error(
        `Cannot generate W-2s — ${pending!.length} payroll run(s) for ${tax_year} are not yet paid. Finalize them first.`,
      );
    }

    // 2. Sum payroll_items per employee for paid runs.
    const { data: items, error: itemsErr } = await context.supabase
      .from('payroll_items')
      .select(
        `id, employee_id, employee_name, gross_pay, federal_tax,
         social_security, medicare, state_tax,
         payroll_runs!inner ( id, company_id, status, pay_date )`,
      )
      .eq('payroll_runs.company_id', company_id)
      .eq('payroll_runs.status', 'paid')
      .gte('payroll_runs.pay_date', start)
      .lte('payroll_runs.pay_date', end);
    if (itemsErr) throw itemsErr;

    type Agg = {
      employee_id: string;
      employee_name: string;
      gross: number;
      fed_tax: number;
      ss_tax: number;
      medicare_tax: number;
      state_tax: number;
    };
    const byEmp = new Map<string, Agg>();
    for (const it of items ?? []) {
      if (!it.employee_id) continue;
      const prev = byEmp.get(it.employee_id) ?? {
        employee_id: it.employee_id,
        employee_name: it.employee_name ?? '',
        gross: 0,
        fed_tax: 0,
        ss_tax: 0,
        medicare_tax: 0,
        state_tax: 0,
      };
      prev.gross += Number(it.gross_pay ?? 0);
      prev.fed_tax += Number(it.federal_tax ?? 0);
      prev.ss_tax += Number(it.social_security ?? 0);
      prev.medicare_tax += Number(it.medicare ?? 0);
      prev.state_tax += Number(it.state_tax ?? 0);
      byEmp.set(it.employee_id, prev);
    }

    // 3. Box-12 pre-tax deduction codes from payroll_item_lines (when present).
    const { data: dedLines } = await context.supabase
      .from('payroll_item_lines')
      .select(
        `amount, code, metadata, payroll_items!inner ( employee_id, run_id ),
         payroll_runs:run_id!inner ( company_id, pay_date, status )`,
      )
      .eq('line_type', 'deduction')
      .eq('payroll_runs.company_id', company_id)
      .eq('payroll_runs.status', 'paid')
      .gte('payroll_runs.pay_date', start)
      .lte('payroll_runs.pay_date', end);

    const CODE_MAP: Record<string, string> = {
      '401k': 'D',
      roth_401k: 'AA',
      '403b': 'E',
      hsa: 'W',
      dependent_care_fsa: '10',
      employer_health: 'DD',
    };
    const box12ByEmp = new Map<string, Map<string, number>>();
    for (const l of dedLines ?? []) {
      const empId = (l as any).payroll_items?.employee_id as string | undefined;
      if (!empId) continue;
      const w2Code = CODE_MAP[(l.code ?? '').toLowerCase()];
      if (!w2Code) continue;
      const inner = box12ByEmp.get(empId) ?? new Map<string, number>();
      inner.set(w2Code, (inner.get(w2Code) ?? 0) + Number(l.amount ?? 0));
      box12ByEmp.set(empId, inner);
    }

    // 4. Upsert run row.
    const { data: existingRun } = await context.supabase
      .from('tax_year_runs')
      .select('id, status')
      .eq('company_id', company_id)
      .eq('tax_year', tax_year)
      .eq('kind', 'w2')
      .maybeSingle();
    if (existingRun && existingRun.status === 'filed') {
      throw new Error('Run already filed. Use corrections workflow.');
    }
    const runUpsert = await context.supabase
      .from('tax_year_runs')
      .upsert(
        {
          id: existingRun?.id,
          company_id,
          tax_year,
          kind: 'w2',
          status: 'draft',
          generated_at: new Date().toISOString(),
          created_by: context.userId,
          totals: {
            recipients: byEmp.size,
            box_1: [...byEmp.values()].reduce((a, b) => a + b.gross, 0).toFixed(2),
            box_2: [...byEmp.values()].reduce((a, b) => a + b.fed_tax, 0).toFixed(2),
          },
        },
        { onConflict: 'company_id,tax_year,kind' },
      )
      .select()
      .single();
    if (runUpsert.error) throw runUpsert.error;
    const runId = runUpsert.data.id as string;

    // 5. Replace previous forms for this run.
    await context.supabase.from('tax_year_forms').delete().eq('run_id', runId);

    // 6. Fetch employee snapshots.
    const empIds = [...byEmp.keys()];
    const { data: emps } = await context.supabase
      .from('employees')
      .select('id, full_name, address_line1, address_line2, city, state, zip')
      .in('id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']);
    const empById = new Map((emps ?? []).map((e: any) => [e.id, e]));

    // 7. Insert one row per employee.
    const inserts = [...byEmp.values()].map((agg) => {
      const emp = empById.get(agg.employee_id);
      const box12 = box12ByEmp.get(agg.employee_id);
      const box12Codes = box12 ? [...box12.entries()].map(([code, amount]) => ({ code, amount: Number(amount.toFixed(2)) })) : [];
      const preTax = box12 ? [...box12.values()].reduce((a, b) => a + b, 0) : 0;
      const box1 = Math.max(0, agg.gross - preTax);
      // SS/Medicare wages: gross minus §125-style pre-tax (HSA, FSA) but include 401(k).
      const ssExcl = (box12?.get('W') ?? 0) + (box12?.get('10') ?? 0);
      const ssWages = Math.max(0, agg.gross - ssExcl);
      return {
        run_id: runId,
        company_id,
        tax_year,
        kind: 'w2' as const,
        employee_id: agg.employee_id,
        recipient_name: emp?.full_name ?? agg.employee_name ?? 'Employee',
        recipient_address: emp
          ? {
              line1: emp.address_line1,
              line2: emp.address_line2,
              city: emp.city,
              state: emp.state,
              zip: emp.zip,
            }
          : null,
        box_1_wages: Number(box1.toFixed(2)),
        box_2_fed_tax: Number(agg.fed_tax.toFixed(2)),
        box_3_ss_wages: Number(Math.min(ssWages, 168600).toFixed(2)),
        box_4_ss_tax: Number(agg.ss_tax.toFixed(2)),
        box_5_medicare_wages: Number(ssWages.toFixed(2)),
        box_6_medicare_tax: Number(agg.medicare_tax.toFixed(2)),
        box_12_codes: box12Codes,
        state_lines: emp?.state
          ? [{ state: emp.state, wages: Number(box1.toFixed(2)), tax: Number(agg.state_tax.toFixed(2)) }]
          : [],
      };
    });

    if (inserts.length > 0) {
      const ins = await context.supabase.from('tax_year_forms').insert(inserts);
      if (ins.error) throw ins.error;
    }

    return { run_id: runId, recipients: inserts.length };
  });

// ─── 1099-NEC generation ────────────────────────────────────────────

export const generate1099NecRun = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { company_id: string; tax_year: number }) => {
    if (!input?.company_id) throw new Error('company_id required');
    if (!input?.tax_year) throw new Error('tax_year required');
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.company_id);
    const { company_id, tax_year } = data;
    const start = `${tax_year}-01-01`;
    const end = `${tax_year}-12-31`;

    const { data: pmts, error } = await context.supabase
      .from('contractor_payments')
      .select('contractor_id, amount, category, status')
      .eq('company_id', company_id)
      .eq('status', 'paid')
      .gte('payment_date', start)
      .lte('payment_date', end);
    if (error) throw error;

    const byC = new Map<string, number>();
    for (const p of pmts ?? []) {
      if (p.category && p.category !== 'nonemployee_compensation' && p.category !== 'services') continue;
      byC.set(p.contractor_id, (byC.get(p.contractor_id) ?? 0) + Number(p.amount ?? 0));
    }
    // 1099-NEC threshold $600
    const qualifying = [...byC.entries()].filter(([, amt]) => amt >= 600);

    const cIds = qualifying.map(([id]) => id);
    const { data: cs } = await context.supabase
      .from('contractors')
      .select('id, full_name, business_name, tax_id_last4, address_line1, address_line2, city, state, zip')
      .in('id', cIds.length ? cIds : ['00000000-0000-0000-0000-000000000000']);
    const cById = new Map((cs ?? []).map((c: any) => [c.id, c]));

    const { data: existingRun } = await context.supabase
      .from('tax_year_runs')
      .select('id, status')
      .eq('company_id', company_id)
      .eq('tax_year', tax_year)
      .eq('kind', '1099nec')
      .maybeSingle();
    if (existingRun?.status === 'filed') {
      throw new Error('Run already filed. Use corrections workflow.');
    }
    const runUpsert = await context.supabase
      .from('tax_year_runs')
      .upsert(
        {
          id: existingRun?.id,
          company_id,
          tax_year,
          kind: '1099nec',
          status: 'draft',
          generated_at: new Date().toISOString(),
          created_by: context.userId,
          totals: {
            recipients: qualifying.length,
            total: qualifying.reduce((a, [, amt]) => a + amt, 0).toFixed(2),
          },
        },
        { onConflict: 'company_id,tax_year,kind' },
      )
      .select()
      .single();
    if (runUpsert.error) throw runUpsert.error;
    const runId = runUpsert.data.id as string;

    await context.supabase.from('tax_year_forms').delete().eq('run_id', runId);

    const inserts = qualifying.map(([contractor_id, amt]) => {
      const c = cById.get(contractor_id);
      return {
        run_id: runId,
        company_id,
        tax_year,
        kind: '1099nec' as const,
        contractor_id,
        recipient_name: c?.business_name || c?.full_name || 'Contractor',
        recipient_tin_last4: c?.tax_id_last4 ?? null,
        recipient_address: c
          ? { line1: c.address_line1, line2: c.address_line2, city: c.city, state: c.state, zip: c.zip }
          : null,
        nec_box_1_nonemployee_comp: Number(amt.toFixed(2)),
      };
    });
    if (inserts.length > 0) {
      const ins = await context.supabase.from('tax_year_forms').insert(inserts);
      if (ins.error) throw ins.error;
    }
    return { run_id: runId, recipients: inserts.length };
  });

// ─── Lifecycle ──────────────────────────────────────────────────────

export const setTaxYearRunStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string; status: 'draft' | 'employee_preview' | 'filed'; filing_ref?: string }) => {
    if (!input?.run_id) throw new Error('run_id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from('tax_year_runs')
      .select('id, company_id')
      .eq('id', data.run_id)
      .single();
    if (error) throw error;
    await requireAdmin(context, run.company_id);
    const patch: any = { status: data.status };
    if (data.status === 'filed') {
      patch.filed_at = new Date().toISOString();
      if (data.filing_ref) patch.filing_ref = data.filing_ref;
    }
    const { error: uErr } = await context.supabase
      .from('tax_year_runs')
      .update(patch)
      .eq('id', data.run_id);
    if (uErr) throw uErr;
    return { ok: true };
  });

// ─── EFW2 / IRIS exports (text/JSON, generated on demand) ──────────

export const exportEfw2 = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string }) => {
    if (!input?.run_id) throw new Error('run_id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: run } = await context.supabase
      .from('tax_year_runs')
      .select('id, company_id, tax_year, kind')
      .eq('id', data.run_id)
      .single();
    if (!run) throw new Error('Run not found');
    await requireAdmin(context, run.company_id);
    if (run.kind !== 'w2') throw new Error('EFW2 is W-2 only');

    const { data: company } = await context.supabase
      .from('companies')
      .select('legal_name, ein, address_line1, city, state, postal_code')
      .eq('id', run.company_id)
      .single();
    const { data: forms } = await context.supabase
      .from('tax_year_forms')
      .select('*')
      .eq('run_id', data.run_id)
      .is('superseded_by', null);

    // SSA EFW2 fixed-width export (subset). Full spec: SSA Publication EFW2.
    const pad = (s: string, n: number, right = true, ch = ' ') => {
      const v = (s ?? '').slice(0, n);
      return right ? v.padEnd(n, ch) : v.padStart(n, ch);
    };
    const num = (n: number, w: number) => pad(Math.round(Math.max(0, Number(n) || 0) * 100).toString(), w, false, '0');
    const lines: string[] = [];
    // RA — Submitter record (very abbreviated; real export needs more fields)
    lines.push(
      'RA' +
        pad(String(company?.ein ?? '').replace(/\D/g, ''), 9, false, '0') +
        pad('', 17) +
        pad(company?.legal_name ?? '', 57) +
        pad(company?.address_line1 ?? '', 22) +
        pad(company?.city ?? '', 22) +
        pad(company?.state ?? '', 2) +
        pad(String(company?.postal_code ?? '').slice(0, 5), 5),
    );
    // RE — Employer
    lines.push(
      'RE' +
        pad(String(run.tax_year), 4) +
        pad(String(company?.ein ?? '').replace(/\D/g, ''), 9, false, '0') +
        pad(company?.legal_name ?? '', 57),
    );
    let rwCount = 0;
    let totalWages = 0;
    let totalFed = 0;
    for (const f of forms ?? []) {
      rwCount++;
      totalWages += Number(f.box_1_wages);
      totalFed += Number(f.box_2_fed_tax);
      // RW — Employee record
      lines.push(
        'RW' +
          pad('', 9, false, '0') + // SSN placeholder (kept blank in app)
          pad(f.recipient_name ?? '', 27) +
          pad('', 1) +
          pad('', 22) +
          num(f.box_1_wages, 11) +
          num(f.box_2_fed_tax, 11) +
          num(f.box_3_ss_wages, 11) +
          num(f.box_4_ss_tax, 11) +
          num(f.box_5_medicare_wages, 11) +
          num(f.box_6_medicare_tax, 11),
      );
    }
    // RT — Totals
    lines.push(
      'RT' +
        pad(String(rwCount), 7, false, '0') +
        num(totalWages, 15) +
        num(totalFed, 15),
    );
    // RF — Final
    lines.push('RF' + pad(String(rwCount), 7, false, '0'));

    return { filename: `efw2-${run.tax_year}.txt`, content: lines.join('\n') };
  });

export const export1099Iris = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string }) => {
    if (!input?.run_id) throw new Error('run_id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: run } = await context.supabase
      .from('tax_year_runs')
      .select('id, company_id, tax_year, kind')
      .eq('id', data.run_id)
      .single();
    if (!run) throw new Error('Run not found');
    await requireAdmin(context, run.company_id);
    if (run.kind !== '1099nec') throw new Error('IRIS is 1099-NEC only');

    const { data: company } = await context.supabase
      .from('companies')
      .select('legal_name, ein, address_line1, city, state, postal_code')
      .eq('id', run.company_id)
      .single();
    const { data: forms } = await context.supabase
      .from('tax_year_forms')
      .select('*')
      .eq('run_id', data.run_id)
      .is('superseded_by', null);

    const payload = {
      filer: {
        name: company?.legal_name ?? null,
        tin: company?.ein ?? null,
        address: {
          line1: company?.address_line1,
          city: company?.city,
          state: company?.state,
          zip: company?.postal_code,
        },
      },
      tax_year: run.tax_year,
      form: '1099-NEC',
      payees: (forms ?? []).map((f: any) => ({
        name: f.recipient_name,
        tin_last4: f.recipient_tin_last4,
        address: f.recipient_address,
        boxes: {
          '1_nonemployee_compensation': Number(f.nec_box_1_nonemployee_comp ?? 0),
          '4_federal_income_tax_withheld': Number(f.nec_box_4_fed_tax ?? 0),
        },
      })),
    };
    return { filename: `iris-1099nec-${run.tax_year}.json`, content: JSON.stringify(payload, null, 2) };
  });

// ─── Corrections ────────────────────────────────────────────────────

export const issueCorrection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { form_id: string; changes: Record<string, unknown>; reason: string }) => {
    if (!input?.form_id) throw new Error('form_id required');
    if (!input?.reason) throw new Error('reason required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: parent, error } = await context.supabase
      .from('tax_year_forms')
      .select('*')
      .eq('id', data.form_id)
      .single();
    if (error) throw error;
    await requireAdmin(context, parent.company_id);

    // Create reissued form by cloning parent + applying changes
    const { id, created_at, updated_at, superseded_by, generated_at, ...rest } = parent;
    const reissued = { ...rest, ...data.changes, generated_at: new Date().toISOString() };
    const insRes = await context.supabase.from('tax_year_forms').insert(reissued).select().single();
    if (insRes.error) throw insRes.error;
    // Supersede parent
    await context.supabase.from('tax_year_forms').update({ superseded_by: insRes.data.id }).eq('id', parent.id);
    // Correction record
    await context.supabase.from('tax_year_corrections').insert({
      parent_form_id: parent.id,
      company_id: parent.company_id,
      kind: parent.kind === 'w2' ? 'W-2c' : '1099-NEC CORRECTED',
      changes: data.changes as any,
      reason: data.reason,
      reissued_form_id: insRes.data.id,
      created_by: context.userId,
    });
    // Mark parent run as corrected
    await context.supabase.from('tax_year_runs').update({ status: 'corrected' }).eq('id', parent.run_id);
    return { reissued_form_id: insRes.data.id };
  });
