import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Payroll provider server functions.
 *
 * Every call uses a single backend-wide API key (`PAYROLL_SHACK_API_KEY`),
 * which is a company-scoped `apay_...` key. The upstream API scopes results
 * to that key's company, so we do not send a company_id parameter — we only
 * use the local companyId to authorize the caller against Supabase RLS.
 *
 * No per-company credentials, no settings UI, no admin key entry — once the
 * secret is set on the backend, these functions just work. The provider
 * name is intentionally not exposed in errors or return values.
 */

const PRIVILEGED = ["owner", "admin", "payroll_admin", "manager"] as const;

async function assertCompanyAccess(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", PRIVILEGED as unknown as string[])
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: you don't have access to this company's payroll.");
}

const companyOnly = z.object({ companyId: z.string().uuid() });

export const listPayrollEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyOnly.parse(d))
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<any>("/api/v1/payroll/employees");
  });

export const getPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    companyOnly.extend({ runId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<any>(
      `/api/v1/payroll/pay-runs/${encodeURIComponent(data.runId)}`,
    );
  });

export const listPayRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyOnly.parse(d))
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<any>("/api/v1/payroll/pay-runs");
  });

export const getPayRunPayslips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    companyOnly.extend({ runId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<any>(
      `/api/v1/payroll/pay-runs/${encodeURIComponent(data.runId)}/payslips`,
    );
  });

export const runPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    companyOnly
      .extend({
        periodStart: z.string().min(1),
        periodEnd: z.string().min(1),
        payDate: z.string().min(1),
        employeeIds: z.array(z.string().min(1)).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<any>("/api/v1/payroll/pay-runs", {
      method: "POST",
      body: {
        period_start: data.periodStart,
        period_end: data.periodEnd,
        pay_date: data.payDate,
        employee_ids: data.employeeIds,
      },
    });
  });

export const approvePayRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    companyOnly.extend({ runId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<any>(
      `/api/v1/payroll/pay-runs/${encodeURIComponent(data.runId)}/approve`,
      { method: "POST" },
    );
  });
