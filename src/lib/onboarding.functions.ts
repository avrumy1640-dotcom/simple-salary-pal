// Self-service onboarding for new hires.
// Each handler verifies the caller IS the employee being updated, then uses
// the admin client to write privileged columns (W-4 / direct deposit / personal)
// that the employees self-update trigger normally blocks.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const personalSchema = z.object({
  date_of_birth: z.string().nullable().optional(),
  ssn_last4: z.string().regex(/^\d{4}$/).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address_line1: z.string().max(200).nullable().optional(),
  address_line2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(50).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  emergency_contact_name: z.string().max(120).nullable().optional(),
  emergency_contact_phone: z.string().max(40).nullable().optional(),
});

const w4Schema = z.object({
  filing_status: z.enum(["single", "married", "head_of_household"]),
  dependents: z.number().int().min(0).max(20),
  extra_withholding: z.number().min(0).max(10000),
});

const ddSchema = z.object({
  bank_account_type: z.enum(["checking", "savings"]),
  routing_full: z.string().regex(/^\d{9}$/),
  account_full: z.string().regex(/^\d{4,17}$/),
  direct_deposit_enabled: z.boolean().default(true),
});

const submitSchema = z.object({
  personal: personalSchema,
  w4: w4Schema,
  direct_deposit: ddSchema,
  acknowledge_handbook: z.boolean(),
});

async function getMyEmployee(supabase: any, userId: string) {
  const { data: user } = await supabase.auth.getUser();
  const email = user?.user?.email;
  if (!email) throw new Error("No authenticated email");
  // Try user_id link first; fall back to email
  let { data } = await supabase.from("employees").select("id, company_id, user_id, email").eq("user_id", userId).limit(1).maybeSingle();
  if (!data) {
    const r = await supabase.from("employees").select("id, company_id, user_id, email").ilike("email", email).limit(1).maybeSingle();
    data = r.data;
  }
  if (!data) throw new Error("No employee record linked to this account");
  return data as { id: string; company_id: string; user_id: string | null; email: string | null };
}

/** Submit the full onboarding packet in one call. */
export const submitOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const emp = await getMyEmployee(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Personal info + W-4 + direct deposit (last4 only stored)
    const routing_last4 = data.direct_deposit.routing_full.slice(-4);
    const account_last4 = data.direct_deposit.account_full.slice(-4);

    const update = {
      date_of_birth: data.personal.date_of_birth ?? null,
      ssn_last4: data.personal.ssn_last4 ?? null,
      phone: data.personal.phone ?? null,
      address_line1: data.personal.address_line1 ?? null,
      address_line2: data.personal.address_line2 ?? null,
      city: data.personal.city ?? null,
      state: data.personal.state ?? null,
      zip: data.personal.zip ?? null,
      emergency_contact_name: data.personal.emergency_contact_name ?? null,
      emergency_contact_phone: data.personal.emergency_contact_phone ?? null,
      filing_status: data.w4.filing_status,
      dependents: data.w4.dependents,
      extra_withholding: data.w4.extra_withholding,
      bank_account_type: data.direct_deposit.bank_account_type,
      bank_routing_last4: routing_last4,
      bank_account_last4: account_last4,
      direct_deposit_enabled: data.direct_deposit.direct_deposit_enabled,
      user_id: emp.user_id ?? userId,
      lifecycle_status: "active" as const,
    };

    const { error: upErr } = await supabaseAdmin
      .from("employees")
      .update(update)
      .eq("id", emp.id);
    if (upErr) throw new Error(upErr.message);

    // 2) Mark any required pre-employment onboarding tasks complete
    await supabaseAdmin
      .from("onboarding_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("employee_id", emp.id)
      .eq("status", "pending")
      .in("category", ["personal", "tax", "banking", "w4", "direct_deposit"]);

    // 3) Handbook acknowledgment if requested
    if (data.acknowledge_handbook) {
      await supabaseAdmin.from("handbook_acknowledgments").insert({
        company_id: emp.company_id,
        employee_id: emp.id,
        document_title: "Employee handbook (self-onboarding)",
        acknowledged_at: new Date().toISOString(),
      });
    }

    // 4) Audit trail
    await supabaseAdmin.from("audit_events").insert({
      company_id: emp.company_id,
      actor_id: userId,
      entity_type: "employees",
      entity_id: emp.id,
      action: "update",
      summary: "New hire completed self-onboarding",
    });

    return { ok: true, employee_id: emp.id };
  });

/** Check current onboarding status for the signed-in employee. */
export const getMyOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    try {
      const emp = await getMyEmployee(supabase, userId);
      const { data: full } = await supabase
        .from("employees")
        .select("id, full_name, email, job_title, start_date, lifecycle_status, filing_status, dependents, extra_withholding, bank_account_last4, direct_deposit_enabled, date_of_birth, ssn_last4, phone, address_line1, city, state, zip, emergency_contact_name, emergency_contact_phone")
        .eq("id", emp.id)
        .maybeSingle();

      const e = full ?? {};
      const personalDone = !!(e.date_of_birth && e.address_line1 && e.city && e.zip && e.emergency_contact_name);
      const w4Done = !!e.filing_status;
      const ddDone = !!e.bank_account_last4;
      const complete = personalDone && w4Done && ddDone;

      return {
        ok: true,
        employee: e,
        steps: { personalDone, w4Done, ddDone },
        complete,
      };
    } catch {
      return { ok: false, employee: null, steps: { personalDone: false, w4Done: false, ddDone: false }, complete: false };
    }
  });
