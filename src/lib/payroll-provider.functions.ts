import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Payroll provider server functions.
 *
 * Every call uses a single backend-wide API key (`PAYROLL_SHACK_API_KEY`).
 * No per-company credentials, no settings UI, no admin key entry — once the
 * secret is set on the backend, these functions just work.
 *
 * The provider name is intentionally not exposed in errors or return values;
 * customers see a generic "payroll" surface.
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
    return callPayrollProvider<Record<string, unknown>>("/employees", { query: { company_id: data.companyId } });
  });

export const getPayrollStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    companyOnly.extend({ runId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<Record<string, unknown>>(`/payroll-runs/${encodeURIComponent(data.runId)}`, {
      query: { company_id: data.companyId },
    });
  });

export const getPayStub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    companyOnly.extend({ payStubId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<Record<string, unknown>>(`/pay-stubs/${encodeURIComponent(data.payStubId)}`, {
      query: { company_id: data.companyId },
    });
  });

export const runPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    companyOnly
      .extend({
        payPeriodStart: z.string().min(1),
        payPeriodEnd: z.string().min(1),
        payDate: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, context.userId, data.companyId);
    const { callPayrollProvider } = await import("@/lib/providers/payrollShack.server");
    return callPayrollProvider<Record<string, unknown>>("/payroll-runs", {
      method: "POST",
      body: {
        company_id: data.companyId,
        pay_period_start: data.payPeriodStart,
        pay_period_end: data.payPeriodEnd,
        pay_date: data.payDate,
      },
    });
  });
