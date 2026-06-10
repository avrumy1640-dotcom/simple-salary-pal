import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();
const yearSchema = z.number().int().min(2000).max(2100);

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(rows: Record<string, any>[], headers: string[]): string {
  const head = headers.map(csvEscape).join(",");
  const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

async function assertReportRole(supabase: any, userId: string, companyId: string) {
  for (const r of ["owner","admin","payroll_admin","accountant","auditor","hr_admin"]) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _company_id: companyId, _role: r as any });
    if (data === true) return;
  }
  throw new Error("forbidden");
}

export const exportPayrollRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ company_id: uuid, year: yearSchema.optional(), quarter: z.number().int().min(1).max(4).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReportRole(supabase, userId, data.company_id);

    let q = supabase
      .from("payroll_items")
      .select("employee_name, regular_hours, overtime_hours, gross_pay, federal_tax, state_tax, social_security, medicare, net_pay, payroll_runs!inner(period_start, period_end, pay_date, status, company_id)")
      .eq("company_id", data.company_id)
      .in("payroll_runs.status" as any, ["paid","reversed"]);

    if (data.year) {
      const start = `${data.year}-01-01`;
      const end = `${data.year}-12-31`;
      q = q.gte("payroll_runs.pay_date" as any, start).lte("payroll_runs.pay_date" as any, end);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const flat = (rows ?? []).map((r: any) => ({
      pay_date: r.payroll_runs?.pay_date,
      period_start: r.payroll_runs?.period_start,
      period_end: r.payroll_runs?.period_end,
      employee_name: r.employee_name,
      regular_hours: r.regular_hours,
      overtime_hours: r.overtime_hours,
      gross_pay: r.gross_pay,
      federal_tax: r.federal_tax,
      state_tax: r.state_tax,
      social_security: r.social_security,
      medicare: r.medicare,
      net_pay: r.net_pay,
    }));
    const csv = toCsv(flat, [
      "pay_date","period_start","period_end","employee_name",
      "regular_hours","overtime_hours","gross_pay","federal_tax","state_tax",
      "social_security","medicare","net_pay",
    ]);
    return { filename: `payroll_register_${data.year ?? "all"}.csv`, csv };
  });

export const exportW2Summary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: uuid, year: yearSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReportRole(supabase, userId, data.company_id);
    const { data: rows, error } = await supabase
      .from("w2_annual_summary")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("tax_year", data.year);
    if (error) throw new Error(error.message);
    const csv = toCsv((rows ?? []) as any[], [
      "tax_year","employee_id","employee_name","ssn_last4",
      "gross_wages","federal_withheld","state_withheld",
      "social_security_withheld","medicare_withheld","net_pay",
    ]);
    return { filename: `w2_summary_${data.year}.csv`, csv };
  });

export const export1099Summary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: uuid, year: yearSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReportRole(supabase, userId, data.company_id);
    const { data: rows, error } = await supabase
      .from("form_1099_annual_summary")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("tax_year", data.year);
    if (error) throw new Error(error.message);
    const csv = toCsv((rows ?? []) as any[], [
      "tax_year","contractor_id","contractor_name","tax_id_last4","payment_count","total_paid",
    ]);
    return { filename: `1099_summary_${data.year}.csv`, csv };
  });

export const exportGlForRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: run } = await supabase.from("payroll_runs").select("company_id, pay_date").eq("id", data.run_id).maybeSingle();
    if (!run) throw new Error("run not found");
    await assertReportRole(supabase, userId, run.company_id);

    // Ensure journal exists
    let { data: je } = await supabase
      .from("gl_journal_entries").select("id").eq("run_id", data.run_id).maybeSingle();
    if (!je) {
      const { data: newId, error } = await supabase.rpc("generate_gl_for_run", { _run_id: data.run_id });
      if (error) throw new Error(error.message);
      je = { id: newId as string };
    }

    const { data: lines, error } = await supabase
      .from("gl_journal_lines")
      .select("account_code, account_name, debit, credit, memo, sort_order")
      .eq("journal_id", je.id)
      .order("sort_order");
    if (error) throw new Error(error.message);

    const flat = (lines ?? []).map((l: any) => ({
      posting_date: run.pay_date,
      account_code: l.account_code,
      account_name: l.account_name,
      debit: l.debit,
      credit: l.credit,
      memo: l.memo,
    }));
    const csv = toCsv(flat, ["posting_date","account_code","account_name","debit","credit","memo"]);
    return { filename: `gl_payroll_${data.run_id.slice(0,8)}.csv`, csv };
  });

export const exportAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ company_id: uuid, days: z.number().int().min(1).max(3650).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReportRole(supabase, userId, data.company_id);
    const since = new Date(Date.now() - (data.days ?? 90) * 86400000).toISOString();
    const { data: rows, error } = await supabase
      .from("audit_events")
      .select("occurred_at, actor_id, action, entity_type, entity_id, ip")
      .eq("company_id", data.company_id)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);
    const csv = toCsv((rows ?? []) as any[], ["occurred_at","actor_id","action","entity_type","entity_id","ip"]);
    return { filename: `audit_log_${data.days ?? 90}d.csv`, csv };
  });
