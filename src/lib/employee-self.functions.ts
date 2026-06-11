import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const FORM_TYPES = ["w4", "i9", "state_w4", "direct_deposit", "address_change"] as const;

/**
 * Employee-initiated form submission. Inserts an hr_forms row with status='pending'
 * for HR to review. Uses the admin client because the hr_forms RLS policy only
 * permits owner/admin/hr_admin to INSERT — but we authorize the caller as the
 * employee themselves (`employees.user_id = auth.uid()`) before doing so.
 */
export const submitEmployeeForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      form_type: z.enum(FORM_TYPES),
      data: z.record(z.string(), z.any()).default({}),
      signed_name: z.string().min(1).max(200),
      tax_year: z.number().int().min(2000).max(2100).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Find the employee record for the caller (RLS-scoped)
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, company_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (empErr) throw new Error(empErr.message);
    if (!emp) throw new Error("No employee record found for this user.");

    // Resolve company owner for owner_id column (admin client)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("owner_id")
      .eq("id", emp.company_id)
      .maybeSingle();
    if (!company?.owner_id) throw new Error("Company not found.");

    const ip =
      (typeof globalThis !== "undefined" &&
        (globalThis as any).process?.env?.CF_CONNECTING_IP) ||
      null;

    const { data: row, error } = await supabaseAdmin
      .from("hr_forms")
      .insert({
        owner_id: company.owner_id,
        company_id: emp.company_id,
        employee_id: emp.id,
        form_type: data.form_type,
        status: "pending",
        data: data.data,
        signed_at: new Date().toISOString(),
        signed_name: data.signed_name,
        signed_ip: ip,
        tax_year: data.tax_year ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Notify managers/HR
    await supabaseAdmin.rpc("notify_managers", {
      _company_id: emp.company_id,
      _kind: "request_answered" as any,
      _title: `Employee submitted a ${data.form_type.toUpperCase()} form`,
      _body: `${data.signed_name} submitted a ${data.form_type} form for review.`,
      _link: "/app/compliance",
      _entity_type: "hr_forms",
      _entity_id: row.id,
    });

    return { id: row.id as string };
  });

/** Fetch the current employee's hr_forms history (self) */
export const listMyForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id, company_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) return { forms: [] as any[] };
    const { data } = await supabase
      .from("hr_forms")
      .select("id, form_type, status, signed_at, signed_name, tax_year, created_at, updated_at")
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return { forms: data ?? [] };
  });

/**
 * Employee self-update — whitelist of safe contact/address columns only.
 * Sensitive payroll fields (pay, tax, banking, status) require a reviewed
 * hr_forms submission via submitEmployeeForm().
 */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone: z.string().max(40).optional().nullable(),
        address_line1: z.string().max(200).optional().nullable(),
        address_line2: z.string().max(200).optional().nullable(),
        city: z.string().max(100).optional().nullable(),
        state: z.string().max(40).optional().nullable(),
        zip: z.string().max(20).optional().nullable(),
        emergency_contact_name: z.string().max(200).optional().nullable(),
        emergency_contact_phone: z.string().max(40).optional().nullable(),
        emergency_contact_relationship: z.string().max(80).optional().nullable(),
        preferred_name: z.string().max(120).optional().nullable(),
        personal_email: z.string().email().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (empErr) throw new Error(empErr.message);
    if (!emp) throw new Error("No employee record found.");

    // Strip undefined keys so we never null-out unrelated columns.
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined) patch[k] = v;
    if (Object.keys(patch).length === 0) return { ok: true, updated: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("employees")
      .update(patch)
      .eq("id", emp.id);
    if (error) throw new Error(error.message);
    return { ok: true, updated: Object.keys(patch).length };
  });

