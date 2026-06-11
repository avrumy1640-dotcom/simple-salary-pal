import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();
const HR_ROLES = ["owner", "admin", "hr_admin", "payroll_admin"] as const;

async function assertHr(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _company_id: companyId,
    _roles: HR_ROLES as any,
  });
  if (data !== true) throw new Error("forbidden");
}

/** HR admin: list pending hr_forms with employee context. */
export const listFormsForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: uuid,
        status: z.enum(["pending", "signed", "approved", "rejected", "all"]).default("pending"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertHr(supabase, userId, data.company_id);

    let q = supabase
      .from("hr_forms")
      .select("id, form_type, status, data, signed_at, signed_name, tax_year, created_at, employee_id, employees(id, full_name, email, job_title, department)")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);

    const { data: forms, error } = await q;
    if (error) throw new Error(error.message);
    return { forms: forms ?? [] };
  });

/**
 * Approve a submitted form. On approval we apply the changes to the employee
 * record using the admin client (RLS + self-edit trigger bypassed because
 * auth.uid() is NULL for service role). The form row is then marked `approved`.
 */
export const approveForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ form_id: uuid, notes: z.string().max(2000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: form, error: fErr } = await supabaseAdmin
      .from("hr_forms")
      .select("*")
      .eq("id", data.form_id)
      .single();
    if (fErr) throw new Error(fErr.message);
    if (!form) throw new Error("Form not found.");
    await assertHr(supabase, userId, form.company_id);

    const payload = (form.data ?? {}) as Record<string, any>;
    const updates: Record<string, any> = {};

    if (form.form_type === "w4" || form.form_type === "state_w4") {
      if (payload.filing_status) updates.filing_status = String(payload.filing_status);
      if (payload.dependents != null) updates.dependents = Number(payload.dependents) || 0;
      if (payload.extra_withholding != null) updates.extra_withholding = Number(payload.extra_withholding) || 0;
    }
    if (form.form_type === "address_change") {
      if (payload.address_line1) updates.address_line1 = String(payload.address_line1);
      if (payload.city) updates.city = String(payload.city);
      if (payload.state) updates.state = String(payload.state);
      if (payload.zip) updates.zip = String(payload.zip);
    }
    if (form.form_type === "direct_deposit") {
      if (payload.routing) updates.bank_routing_last4 = String(payload.routing).slice(-4);
      if (payload.account) updates.bank_account_last4 = String(payload.account).slice(-4);
      if (payload.account_type) updates.bank_account_type = String(payload.account_type);
      updates.direct_deposit_enabled = true;
    }

    if (form.employee_id && Object.keys(updates).length > 0) {
      const { error: uErr } = await supabaseAdmin
        .from("employees")
        .update(updates as any)
        .eq("id", form.employee_id);
      if (uErr) throw new Error(uErr.message);
    }

    const mergedData = { ...payload, _reviewer_notes: data.notes ?? null, _applied: updates };
    const { error: stErr } = await supabaseAdmin
      .from("hr_forms")
      .update({ status: "approved", data: mergedData })
      .eq("id", form.id);
    if (stErr) throw new Error(stErr.message);

    // Notify employee
    const { data: emp } = await supabaseAdmin
      .from("employees")
      .select("user_id, full_name")
      .eq("id", form.employee_id)
      .maybeSingle();
    if (emp?.user_id) {
      await supabaseAdmin.from("notifications").insert({
        company_id: form.company_id,
        user_id: emp.user_id,
        kind: "request_answered",
        title: `Your ${String(form.form_type).toUpperCase()} form was approved`,
        body: data.notes ? data.notes.slice(0, 280) : "Your submitted form was approved and applied to your record.",
        link_path: "/employee/documents",
        entity_type: "hr_forms",
        entity_id: form.id,
      });
    }

    return { applied: updates };
  });

/** Reject a submitted form. */
export const rejectForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ form_id: uuid, reason: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: form, error: fErr } = await supabaseAdmin
      .from("hr_forms")
      .select("id, company_id, employee_id, form_type, data")
      .eq("id", data.form_id)
      .single();
    if (fErr || !form) throw new Error("Form not found.");
    await assertHr(supabase, userId, form.company_id);

    const merged = { ...(form.data ?? {}), _rejection_reason: data.reason };
    const { error } = await supabaseAdmin
      .from("hr_forms")
      .update({ status: "rejected", data: merged })
      .eq("id", form.id);
    if (error) throw new Error(error.message);

    const { data: emp } = await supabaseAdmin
      .from("employees")
      .select("user_id")
      .eq("id", form.employee_id)
      .maybeSingle();
    if (emp?.user_id) {
      await supabaseAdmin.from("notifications").insert({
        company_id: form.company_id,
        user_id: emp.user_id,
        kind: "request_answered",
        title: `Your ${String(form.form_type).toUpperCase()} form needs changes`,
        body: data.reason.slice(0, 280),
        link_path: "/employee/documents",
        entity_type: "hr_forms",
        entity_id: form.id,
      });
    }
    return { ok: true };
  });
