import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertManager(supabase: any, userId: string, companyId: string) {
  const { data: ok } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _company_id: companyId,
    _roles: ["owner", "admin", "hr_admin", "manager"],
  });
  if (!ok) throw new Error("Forbidden");
}

export const publishWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; weekStart: string; weekEnd: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId, data.companyId);
    const { data: count, error } = await supabase.rpc("publish_shifts", {
      _company_id: data.companyId,
      _start: data.weekStart,
      _end: data.weekEnd,
    });
    if (error) throw new Error(error.message);
    return { published: count ?? 0 };
  });

export const cancelShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shiftId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: shift, error: e1 } = await supabase
      .from("shifts").select("company_id").eq("id", data.shiftId).maybeSingle();
    if (e1 || !shift) throw new Error("Shift not found");
    await assertManager(supabase, context.userId, shift.company_id);
    const { error } = await supabase
      .from("shifts").update({ status: "cancelled" }).eq("id", data.shiftId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    shiftId: string;
    requestType: "drop" | "swap";
    targetEmployeeId?: string | null;
    targetShiftId?: string | null;
    reason?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: shift } = await supabase
      .from("shifts").select("id, company_id, employee_id, status").eq("id", data.shiftId).maybeSingle();
    if (!shift) throw new Error("Shift not found");
    if (shift.status !== "published") throw new Error("Only published shifts can be swapped");
    const { data: empId } = await supabase.rpc("current_employee_id", { _company_id: shift.company_id });
    if (!empId || empId !== shift.employee_id) throw new Error("You are not assigned to this shift");
    const { data: row, error } = await supabase.from("shift_swap_requests").insert({
      company_id: shift.company_id,
      shift_id: shift.id,
      requested_by_employee_id: empId,
      target_employee_id: data.targetEmployeeId ?? null,
      target_shift_id: data.targetShiftId ?? null,
      request_type: data.requestType,
      reason: data.reason ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const decideSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { swapId: string; decision: "approved" | "denied"; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: swap, error: e1 } = await supabase
      .from("shift_swap_requests").select("*").eq("id", data.swapId).maybeSingle();
    if (e1 || !swap) throw new Error("Swap request not found");
    if (swap.status !== "pending") throw new Error("Swap already decided");
    await assertManager(supabase, userId, swap.company_id);

    if (data.decision === "approved") {
      // Drop: unassign source shift. Swap: reassign source to target employee,
      // and if target_shift_id provided, reassign that shift to requester.
      if (swap.request_type === "drop") {
        const { error } = await supabase.from("shifts")
          .update({ employee_id: null }).eq("id", swap.shift_id);
        if (error) throw new Error(error.message);
      } else {
        if (!swap.target_employee_id) throw new Error("Target employee required for swap");
        const { error } = await supabase.from("shifts")
          .update({ employee_id: swap.target_employee_id }).eq("id", swap.shift_id);
        if (error) throw new Error(error.message);
        if (swap.target_shift_id) {
          const { error: e2 } = await supabase.from("shifts")
            .update({ employee_id: swap.requested_by_employee_id }).eq("id", swap.target_shift_id);
          if (e2) throw new Error(e2.message);
        }
      }
    }

    const { error } = await supabase.from("shift_swap_requests").update({
      status: data.decision,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      decision_notes: data.notes ?? null,
    }).eq("id", swap.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { swapId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("shift_swap_requests")
      .update({ status: "cancelled" }).eq("id", data.swapId).eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
