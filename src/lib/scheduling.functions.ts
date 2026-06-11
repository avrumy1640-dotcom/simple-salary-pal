import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();
const isoDt = z.string().min(8).max(40);

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
  .inputValidator((d: unknown) =>
    z.object({ companyId: uuid, weekStart: isoDt, weekEnd: isoDt }).parse(d),
  )
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
  .inputValidator((d: unknown) => z.object({ shiftId: uuid }).parse(d))
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
  .inputValidator((d: unknown) =>
    z.object({
      shiftId: uuid,
      requestType: z.enum(["drop","swap"]),
      targetEmployeeId: uuid.nullable().optional(),
      targetShiftId: uuid.nullable().optional(),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
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
  .inputValidator((d: unknown) =>
    z.object({ swapId: uuid, decision: z.enum(["approved","denied"]), notes: z.string().max(500).optional() }).parse(d),
  )
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
  .inputValidator((d: unknown) => z.object({ swapId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("shift_swap_requests")
      .update({ status: "cancelled" }).eq("id", data.swapId).eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Target employee declines an incoming swap proposal → cancels the request.
export const declineSwapAsTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ swapId: uuid, reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: swap } = await supabase
      .from("shift_swap_requests").select("id, company_id, target_employee_id, status").eq("id", data.swapId).maybeSingle();
    if (!swap) throw new Error("Swap not found");
    if (swap.status !== "pending") throw new Error("Already decided");
    const { data: empId } = await supabase.rpc("current_employee_id", { _company_id: swap.company_id });
    if (!empId || empId !== swap.target_employee_id) throw new Error("Not your proposal");
    const { error } = await supabase.from("shift_swap_requests").update({
      status: "cancelled",
      decision_notes: data.reason ? `Declined by coworker: ${data.reason}` : "Declined by coworker",
    }).eq("id", swap.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
