// Payroll lifecycle server functions — authoritative, server-side calculation.
//
// State machine (matches DB CHECK constraint on payroll_runs.status):
//
//   draft ──► calculating ──► approved ──► paid (locked, immutable)
//                 │                          │
//                 └──► draft (recompute)      └──► reversed
//
// All math runs server-side via resolveTaxProvider(). Clients NEVER POST
// pre-computed totals — they submit hours/earnings and the server decides
// what the paycheck is worth. After a run is `paid`, the DB trigger locks
// payroll_items / payroll_item_lines / employer_tax_liabilities against
// any further mutation.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTaxProvider } from "./tax-provider";
import type { PayrollCalcResult } from "./payroll";

const PAYROLL_ROLES = ["owner", "admin", "payroll_admin"] as const;

async function assertPayrollRole(supabase: any, userId: string, companyId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", PAYROLL_ROLES as unknown as string[])
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: payroll role required");
}

async function loadCompanyConfig(supabase: any, companyId: string) {
  const { data } = await supabase
    .from("companies")
    .select("state, state_unemployment_rate, state_unemployment_wage_base")
    .eq("id", companyId)
    .maybeSingle();
  return {
    state: (data?.state as string) ?? "US",
    sutaRate: Number(data?.state_unemployment_rate ?? 0.027),
    sutaWageBase: Number(data?.state_unemployment_wage_base ?? 7000),
  };
}

async function loadYtdWages(supabase: any, companyId: string, employeeIds: string[], year: number) {
  if (employeeIds.length === 0) return new Map<string, { gross: number; ss: number }>();
  const { data } = await supabase
    .from("employee_ytd_wages")
    .select("employee_id, ytd_gross, ytd_ss_wages")
    .eq("company_id", companyId)
    .eq("tax_year", year)
    .in("employee_id", employeeIds);
  const m = new Map<string, { gross: number; ss: number }>();
  for (const r of data ?? []) m.set(r.employee_id, { gross: Number(r.ytd_gross), ss: Number(r.ytd_ss_wages) });
  return m;
}

function buildLines(itemId: string, companyId: string, runId: string, calc: PayrollCalcResult) {
  const lines: any[] = [];
  const push = (line_type: string, code: string, amount: number, extra: Partial<any> = {}) => {
    if (!amount && line_type !== "earning") return;
    lines.push({ company_id: companyId, run_id: runId, item_id: itemId, line_type, code, amount, ...extra });
  };
  // Earnings
  push("earning", "regular", calc.regularEarnings, { hours: calc.regularHours });
  push("earning", "overtime", calc.overtimeEarnings, { hours: calc.overtimeHours });
  push("earning", "double_overtime", calc.doubleOvertimeEarnings, { hours: calc.doubleOvertimeHours });
  push("earning", "holiday", calc.holidayEarnings, { hours: calc.holidayHours });
  push("earning", "pto", calc.ptoEarnings, { hours: calc.ptoHours });
  push("earning", "sick", calc.sickEarnings, { hours: calc.sickHours });
  push("earning", "bonus", calc.bonuses);
  push("earning", "commission", calc.commissions);
  push("reimbursement", "reimbursement", calc.reimbursements, { taxable: false });
  // Deductions
  for (const d of calc.deductionLines) {
    push(d.pre_tax ? "pre_tax_deduction" : "post_tax_deduction", d.name.slice(0, 60).toLowerCase().replace(/\s+/g, "_"), d.amount, { description: d.name, taxable: !d.pre_tax });
  }
  // Employee taxes
  push("employee_tax", "federal", calc.federalTax);
  push("employee_tax", "social_security", calc.socialSecurity);
  push("employee_tax", "medicare", calc.medicare);
  push("employee_tax", "additional_medicare", calc.additionalMedicare);
  push("employee_tax", "state", calc.stateTax);
  // Garnishments
  for (const g of calc.garnishmentLines) {
    push("garnishment", g.name.slice(0, 60).toLowerCase().replace(/\s+/g, "_"), g.amount, { description: g.name });
  }
  // Employer-side
  push("employer_tax", "employer_ss", calc.employerSocialSecurity);
  push("employer_tax", "employer_medicare", calc.employerMedicare);
  push("employer_tax", "futa", calc.futa);
  push("employer_tax", "suta", calc.suta);
  return lines;
}

/* -------------------- calculatePayrollRun -------------------- */

const calculateInput = z.object({
  company_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  pay_date: z.string(),
  pay_periods_per_year: z.number().int().min(1).max(52).default(26),
  rows: z.array(z.object({
    employee_id: z.string().uuid(),
    regular_hours: z.number().min(0).default(0),
    overtime_hours: z.number().min(0).default(0),
    double_overtime_hours: z.number().min(0).default(0),
    holiday_hours: z.number().min(0).default(0),
    pto_hours: z.number().min(0).default(0),
    sick_hours: z.number().min(0).default(0),
    bonuses: z.number().min(0).default(0),
    commissions: z.number().min(0).default(0),
    reimbursements: z.number().min(0).default(0),
  })).min(1),
});

export const calculatePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => calculateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertPayrollRole(supabase, userId, data.company_id);

    const employeeIds = data.rows.map((r) => r.employee_id);
    const { data: emps, error: empErr } = await supabase
      .from("employees")
      .select("id, full_name, pay_type, pay_rate, filing_status, dependents, extra_withholding, state")
      .eq("company_id", data.company_id)
      .in("id", employeeIds);
    if (empErr) throw new Error(empErr.message);

    const { data: dedRows } = await supabase
      .from("deductions")
      .select("employee_id, name, pre_tax, amount, amount_type, active")
      .eq("company_id", data.company_id)
      .eq("active", true)
      .in("employee_id", employeeIds);

    const { data: garnRows } = await supabase
      .from("garnishments")
      .select("employee_id, garnishment_type, priority, amount, amount_type, cap_percentage, is_active, court_order_ref")
      .eq("company_id", data.company_id)
      .eq("is_active", true)
      .in("employee_id", employeeIds);

    const config = await loadCompanyConfig(supabase, data.company_id);
    const year = new Date(data.pay_date).getUTCFullYear();
    const ytd = await loadYtdWages(supabase, data.company_id, employeeIds, year);

    // Create draft run
    const { data: run, error: rErr } = await supabase
      .from("payroll_runs")
      .insert({
        company_id: data.company_id,
        period_start: data.period_start,
        period_end: data.period_end,
        pay_date: data.pay_date,
        status: "calculating",
        gross_total: 0, tax_total: 0, net_total: 0,
      })
      .select().single();
    if (rErr) throw new Error(rErr.message);

    const provider = resolveTaxProvider();
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
    const itemsToInsert: any[] = [];
    const calcsByEmp = new Map<string, PayrollCalcResult>();

    for (const row of data.rows) {
      const emp = empMap.get(row.employee_id) as any;
      if (!emp) continue;
      const ytdRow = ytd.get(row.employee_id) ?? { gross: 0, ss: 0 };
      const calc = await provider.computePay({
        payType: emp.pay_type,
        payRate: Number(emp.pay_rate),
        regularHours: row.regular_hours,
        overtimeHours: row.overtime_hours,
        doubleOvertimeHours: row.double_overtime_hours,
        holidayHours: row.holiday_hours,
        ptoHours: row.pto_hours,
        sickHours: row.sick_hours,
        bonuses: row.bonuses,
        commissions: row.commissions,
        reimbursements: row.reimbursements,
        payPeriodsPerYear: data.pay_periods_per_year,
        filingStatus: emp.filing_status ?? "single",
        dependents: Number(emp.dependents ?? 0),
        extraWithholding: Number(emp.extra_withholding ?? 0),
        deductions: (dedRows ?? []).filter((d: any) => d.employee_id === row.employee_id).map((d: any) => ({
          name: d.name, pre_tax: d.pre_tax, amount: Number(d.amount), amount_type: d.amount_type,
        })),
        garnishments: (garnRows ?? []).filter((g: any) => g.employee_id === row.employee_id).map((g: any) => ({
          name: g.court_order_ref ?? g.garnishment_type, type: g.garnishment_type, priority: g.priority,
          amount: Number(g.amount), amount_type: g.amount_type, cap_percentage: Number(g.cap_percentage ?? 25),
        })),
        stateUnemploymentRate: config.sutaRate,
        stateUnemploymentWageBase: config.sutaWageBase,
        workState: (emp as any).state ?? config.state,
        ytdGrossBeforeRun: ytdRow.gross,
        ytdSocialSecurityWages: ytdRow.ss,
      });
      calcsByEmp.set(row.employee_id, calc);
      itemsToInsert.push({
        company_id: data.company_id,
        run_id: run.id, employee_id: row.employee_id, employee_name: emp.full_name,
        regular_hours: calc.regularHours, overtime_hours: calc.overtimeHours,
        gross_pay: calc.gross, federal_tax: calc.federalTax, social_security: calc.socialSecurity,
        medicare: calc.medicare + calc.additionalMedicare, state_tax: calc.stateTax, net_pay: calc.net,
      });
    }

    const { data: insertedItems, error: iErr } = await supabase
      .from("payroll_items").insert(itemsToInsert).select("id, employee_id");
    if (iErr) throw new Error(iErr.message);

    // Per-item line breakdown
    const allLines: any[] = [];
    for (const item of insertedItems ?? []) {
      const calc = calcsByEmp.get(item.employee_id);
      if (calc) allLines.push(...buildLines(item.id, data.company_id, run.id, calc));
    }
    if (allLines.length > 0) {
      const { error: lErr } = await supabase.from("payroll_item_lines").insert(allLines);
      if (lErr) throw new Error(lErr.message);
    }

    // Aggregate totals + employer tax row
    const totals = Array.from(calcsByEmp.values()).reduce((s, c) => ({
      gross: s.gross + c.gross,
      tax: s.tax + c.federalTax + c.stateTax + c.socialSecurity + c.medicare + c.additionalMedicare,
      net: s.net + c.net,
      empSS: s.empSS + c.employerSocialSecurity,
      empMed: s.empMed + c.employerMedicare,
      futa: s.futa + c.futa,
      suta: s.suta + c.suta,
    }), { gross: 0, tax: 0, net: 0, empSS: 0, empMed: 0, futa: 0, suta: 0 });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const { data: updatedRun, error: uErr } = await supabase
      .from("payroll_runs")
      .update({
        status: "draft",
        gross_total: round2(totals.gross),
        tax_total: round2(totals.tax),
        net_total: round2(totals.net),
      })
      .eq("id", run.id)
      .select().single();
    if (uErr) throw new Error(uErr.message);

    await supabase.from("employer_tax_liabilities").insert({
      company_id: data.company_id, run_id: run.id,
      futa: round2(totals.futa), suta: round2(totals.suta),
      employer_ss: round2(totals.empSS), employer_medicare: round2(totals.empMed),
    });

    return {
      ok: true,
      run: updatedRun,
      provider: { id: provider.id, productionReady: provider.isProductionReady },
      totals: {
        gross: round2(totals.gross), tax: round2(totals.tax), net: round2(totals.net),
        employer: { ss: round2(totals.empSS), medicare: round2(totals.empMed), futa: round2(totals.futa), suta: round2(totals.suta) },
      },
    };
  });

/* -------------------- approvePayrollRun -------------------- */

const approveInput = z.object({ run_id: z.string().uuid() });

export const approvePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: run, error } = await supabase.from("payroll_runs").select("*").eq("id", data.run_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Run not found");
    if (run.status !== "draft") throw new Error(`Cannot approve run in status '${run.status}'`);
    await assertPayrollRole(supabase, userId, run.company_id);

    const { data: updated, error: uErr } = await supabase
      .from("payroll_runs")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: userId })
      .eq("id", run.id).select().single();
    if (uErr) throw new Error(uErr.message);
    return { ok: true, run: updated };
  });

/* -------------------- markRunPaid (locks the run) -------------------- */

const payInput = z.object({ run_id: z.string().uuid() });

export const markRunPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: run, error } = await supabase.from("payroll_runs").select("*").eq("id", data.run_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Run not found");
    if (run.status !== "approved") throw new Error(`Run must be approved before payment; current status: ${run.status}`);
    await assertPayrollRole(supabase, userId, run.company_id);

    // DB trigger auto-stamps locked_at/locked_by/processed_at
    const { data: updated, error: uErr } = await supabase
      .from("payroll_runs").update({ status: "paid" }).eq("id", run.id).select().single();
    if (uErr) throw new Error(uErr.message);

    // Write tax_records (deposit liability) — DB block trigger is keyed off lock+children, this table is independent.
    const { data: company } = await supabase
      .from("companies").select("state").eq("id", run.company_id).maybeSingle();
    const { data: items } = await supabase
      .from("payroll_items").select("gross_pay, federal_tax, state_tax, social_security, medicare").eq("run_id", run.id);
    const sum = (items ?? []).reduce((s: any, i: any) => ({
      gross: s.gross + Number(i.gross_pay || 0),
      fed: s.fed + Number(i.federal_tax || 0),
      state: s.state + Number(i.state_tax || 0),
      fica: s.fica + Number(i.social_security || 0) + Number(i.medicare || 0),
    }), { gross: 0, fed: 0, state: 0, fica: 0 });
    const round2 = (n: number) => Math.round(n * 100) / 100;
    await supabase.from("tax_records").insert([
      { company_id: run.company_id, run_id: run.id, period_start: run.period_start, period_end: run.period_end, jurisdiction: "US-FED", tax_type: "fit", taxable_wages: round2(sum.gross), tax_amount: round2(sum.fed), liability_date: run.pay_date },
      { company_id: run.company_id, run_id: run.id, period_start: run.period_start, period_end: run.period_end, jurisdiction: "US-FED", tax_type: "fica", taxable_wages: round2(sum.gross), tax_amount: round2(sum.fica), liability_date: run.pay_date },
      { company_id: run.company_id, run_id: run.id, period_start: run.period_start, period_end: run.period_end, jurisdiction: company?.state ?? "STATE", tax_type: "sit", taxable_wages: round2(sum.gross), tax_amount: round2(sum.state), liability_date: run.pay_date },
    ]);

    return { ok: true, run: updated };
  });

/* -------------------- reversePayrollRun -------------------- */

const reverseInput = z.object({ run_id: z.string().uuid(), reason: z.string().min(3).max(500) });

export const reversePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reverseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: run, error } = await supabase.from("payroll_runs").select("*").eq("id", data.run_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Run not found");
    if (!["approved", "paid"].includes(run.status)) throw new Error(`Cannot reverse run in status '${run.status}'`);
    await assertPayrollRole(supabase, userId, run.company_id);

    const { data: updated, error: uErr } = await supabase
      .from("payroll_runs")
      .update({ status: "reversed", reversed_at: new Date().toISOString(), reversed_by: userId })
      .eq("id", run.id).select().single();
    if (uErr) throw new Error(uErr.message);

    await supabase.from("payroll_reversals").insert({
      company_id: run.company_id, run_id: run.id,
      reason: data.reason, reversed_by: userId,
    });
    return { ok: true, run: updated };
  });
