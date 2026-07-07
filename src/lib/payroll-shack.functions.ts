// Public server-fn surface for the Payroll Shack integration.
// Every fn requires an authenticated owner/admin/payroll_admin of the
// company, decrypts the API key server-side, and calls Payroll Shack.
// Endpoints and payload shapes live in providers/payrollShack.server.ts.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PRIVILEGED = ["owner", "admin", "payroll_admin"] as const;

async function assertPrivileged(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", PRIVILEGED as unknown as string[])
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: only owners, admins, or payroll admins can call Payroll Shack.");
}

const companyOnly = z.object({ companyId: z.string().uuid() });

/** Test connectivity and mark the integration as last_synced when successful. */
export const testPayrollShack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyOnly.parse(d))
  .handler(async ({ data, context }) => {
    await assertPrivileged(context.supabase, context.userId, data.companyId);
    const { pingPayrollShack } = await import("@/lib/providers/payrollShack.server");
    const res = await pingPayrollShack(data.companyId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("provider_integrations")
      .update({
        status: res.ok ? "connected" : "error",
        last_synced_at: res.ok ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", data.companyId)
      .eq("provider", "payroll_shack");

    return res;
  });

/** Pull employees from Payroll Shack. Returns the raw provider payload. */
export const listPayrollShackEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    companyOnly.extend({ limit: z.number().int().min(1).max(500).optional(), cursor: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPrivileged(context.supabase, context.userId, data.companyId);
    const { listEmployees } = await import("@/lib/providers/payrollShack.server");
    return listEmployees(data.companyId, { limit: data.limit, cursor: data.cursor });
  });

/** Submit a pay run to Payroll Shack. */
const payRunSchema = companyOnly.extend({
  pay_period_start: z.string().min(1),
  pay_period_end: z.string().min(1),
  pay_date: z.string().min(1),
  entries: z
    .array(
      z.object({
        employee_id: z.string().min(1),
        hours: z.number().min(0).optional(),
        gross_cents: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(5000),
});

export const submitPayrollShackPayRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => payRunSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPrivileged(context.supabase, context.userId, data.companyId);
    const { createPayRun } = await import("@/lib/providers/payrollShack.server");
    return createPayRun(data.companyId, {
      pay_period_start: data.pay_period_start,
      pay_period_end: data.pay_period_end,
      pay_date: data.pay_date,
      entries: data.entries,
    });
  });

export const getPayrollShackPayRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyOnly.extend({ payRunId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPrivileged(context.supabase, context.userId, data.companyId);
    const { getPayRun } = await import("@/lib/providers/payrollShack.server");
    return getPayRun(data.companyId, data.payRunId);
  });
