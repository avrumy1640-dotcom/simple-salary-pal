import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Generate a simple PDF rendering of a W-2 or 1099-NEC (substitute form
 * layout — not the IRS pre-printed copy). Sufficient for employee preview /
 * download until we wire the official Copy B templates in `public/forms/`.
 */

async function loadForm(supabase: any, formId: string) {
  const { data, error } = await supabase
    .from('tax_year_forms')
    .select('*, tax_year_runs!inner(company_id, status), companies:company_id(legal_name, ein, address_line1, address_line2, city, state, postal_code)')
    .eq('id', formId)
    .single();
  if (error) throw error;
  return data;
}

async function renderPdf(form: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const draw = (text: string, x: number, y: number, opts: { size?: number; b?: boolean } = {}) =>
    page.drawText(text, { x, y, size: opts.size ?? 10, font: opts.b ? bold : font, color: rgb(0, 0, 0) });

  const isW2 = form.kind === 'w2';
  draw(isW2 ? `Form W-2  Wage and Tax Statement` : `Form 1099-NEC  Nonemployee Compensation`, 36, 750, { size: 14, b: true });
  draw(`Tax Year ${form.tax_year}`, 36, 732, { size: 11, b: true });
  draw(`This is a substitute statement generated from your payroll records.`, 36, 716, { size: 8 });

  // Employer block
  const c = form.companies ?? {};
  draw('Employer / Payer', 36, 690, { b: true });
  draw(c.legal_name ?? '', 36, 676);
  draw([c.address_line1, c.city, c.state, c.postal_code].filter(Boolean).join(', '), 36, 662);
  draw(`EIN: ${c.ein ?? '—'}`, 36, 648);

  // Recipient block
  draw(isW2 ? 'Employee' : 'Recipient', 320, 690, { b: true });
  draw(form.recipient_name ?? '', 320, 676);
  const a = form.recipient_address ?? {};
  draw([a.line1, a.city, a.state, a.zip].filter(Boolean).join(', '), 320, 662);
  draw(`SSN/TIN: xxx-xx-${form.recipient_tin_last4 ?? 'xxxx'}`, 320, 648);

  // Boxes
  const usd = (n: number) => '$' + Number(n ?? 0).toFixed(2);
  let y = 600;
  const row = (k: string, v: string) => { draw(k, 36, y, { b: true }); draw(v, 280, y); y -= 18; };
  if (isW2) {
    row('1. Wages, tips, other comp.', usd(form.box_1_wages));
    row('2. Federal income tax withheld', usd(form.box_2_fed_tax));
    row('3. Social security wages', usd(form.box_3_ss_wages));
    row('4. Social security tax withheld', usd(form.box_4_ss_tax));
    row('5. Medicare wages and tips', usd(form.box_5_medicare_wages));
    row('6. Medicare tax withheld', usd(form.box_6_medicare_tax));
    if (Array.isArray(form.box_12_codes) && form.box_12_codes.length) {
      row('12. Codes', form.box_12_codes.map((c: any) => `${c.code} ${usd(c.amount)}`).join(', '));
    }
    if (Array.isArray(form.state_lines) && form.state_lines.length) {
      for (const s of form.state_lines) {
        row(`State ${s.state} — wages / tax`, `${usd(s.wages)} / ${usd(s.tax)}`);
      }
    }
  } else {
    row('1. Nonemployee compensation', usd(form.nec_box_1_nonemployee_comp));
    row('4. Federal income tax withheld', usd(form.nec_box_4_fed_tax));
  }

  draw('Generated ' + new Date().toISOString().slice(0, 10) + ' — substitute statement', 36, 60, { size: 8 });
  return doc.save();
}

export const downloadTaxFormPdf = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { form_id: string }) => {
    if (!input?.form_id) throw new Error('form_id required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const form = await loadForm(context.supabase, data.form_id); // RLS scopes this
    const bytes = await renderPdf(form);
    // Return as base64 — client converts to Blob.
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    const fname = `${form.kind === 'w2' ? 'W2' : '1099NEC'}-${form.tax_year}-${(form.recipient_name ?? 'recipient').replace(/\W+/g, '_')}.pdf`;
    return { filename: fname, base64: b64, mime: 'application/pdf' };
  });
