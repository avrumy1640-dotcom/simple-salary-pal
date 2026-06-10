// Employee lifecycle server functions.
//
// Flow:  prospect → onboarding → active → on_leave → active → terminated → (rehire)→ active
//
// The DB trigger tg_employee_lifecycle_guard blocks edits to compensation/banking
// fields while terminated, auto-stamps termination_date, and keeps the legacy
// `status` column in sync. These server fns enforce role + write audit metadata.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HR_ROLES = ["owner", "admin", "hr_admin"] as const;

async function assertHr(supabase: any, userId: string, companyId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", HR_ROLES as unknown as string[])
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: HR admin role required");
}

async function loadEmployee(supabase: any, employeeId: string) {
  const { data: emp, error } = await supabase
    .from("employees").select("*").eq("id", employeeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!emp) throw new Error("Employee not found");
  return emp;
}

/* -------------------- Terminate -------------------- */

const terminateInput = z.object({
  employee_id: z.string().uuid(),
  termination_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(3).max(500),
  rehire_eligible: z.boolean().default(true),
  payout_pto: z.boolean().default(false),
});

export const terminateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => terminateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const emp = await loadEmployee(supabase, data.employee_id);
    await assertHr(supabase, userId, emp.company_id);
    if (emp.lifecycle_status === "terminated") throw new Error("Already terminated");

    const { data: updated, error } = await supabase
      .from("employees")
      .update({
        lifecycle_status: "terminated",
        termination_date: data.termination_date,
        termination_reason: data.reason,
        rehire_eligible: data.rehire_eligible,
      })
      .eq("id", data.employee_id)
      .select().single();
    if (error) throw new Error(error.message);

    // Optional PTO payout: zero out the balance by posting a debit
    if (data.payout_pto && Number(emp.pto_balance_hours) > 0) {
      await supabase.from("pto_ledger").insert({
        company_id: emp.company_id,
        employee_id: emp.id,
        delta_hours: -Number(emp.pto_balance_hours),
        reason: "pto_terminal_payout",
        ref_type: "employees",
        ref_id: emp.id,
        balance_after: 0, // trigger will recompute
      });
    }

    // Cancel any pending PTO requests
    await supabase.from("pto_entries")
      .update({ status: "cancelled" })
      .eq("employee_id", emp.id)
      .eq("status", "pending");

    return { ok: true, employee: updated };
  });

/* -------------------- Reactivate / Rehire -------------------- */

const reactivateInput = z.object({
  employee_id: z.string().uuid(),
  new_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pay_rate: z.number().nonnegative().optional(),
});

export const reactivateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reactivateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const emp = await loadEmployee(supabase, data.employee_id);
    await assertHr(supabase, userId, emp.company_id);
    if (emp.lifecycle_status !== "terminated") throw new Error("Employee is not terminated");
    if (emp.rehire_eligible === false) throw new Error("Employee is marked not rehireable; HR must clear this flag first.");

    const patch: Record<string, unknown> = {
      lifecycle_status: "active",
      termination_date: null,
      termination_reason: null,
    };
    if (data.new_start_date) patch.start_date = data.new_start_date;
    if (typeof data.pay_rate === "number") patch.pay_rate = data.pay_rate;

    const { data: updated, error } = await supabase
      .from("employees").update(patch).eq("id", data.employee_id).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, employee: updated };
  });

/* -------------------- Leave of absence -------------------- */

const leaveInput = z.object({
  employee_id: z.string().uuid(),
  leave_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leave_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reason: z.string().min(3).max(500),
});

export const placeOnLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => leaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const emp = await loadEmployee(supabase, data.employee_id);
    await assertHr(supabase, userId, emp.company_id);
    if (emp.lifecycle_status === "terminated") throw new Error("Cannot place a terminated employee on leave.");
    const { data: updated, error } = await supabase
      .from("employees").update({
        lifecycle_status: "on_leave",
        leave_start_date: data.leave_start_date,
        leave_end_date: data.leave_end_date ?? null,
        leave_reason: data.reason,
      }).eq("id", data.employee_id).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, employee: updated };
  });

export const returnFromLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employee_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const emp = await loadEmployee(supabase, data.employee_id);
    await assertHr(supabase, userId, emp.company_id);
    if (emp.lifecycle_status !== "on_leave") throw new Error("Employee is not on leave");
    const { data: updated, error } = await supabase
      .from("employees").update({
        lifecycle_status: "active",
        leave_end_date: emp.leave_end_date ?? new Date().toISOString().slice(0, 10),
      }).eq("id", data.employee_id).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, employee: updated };
  });
