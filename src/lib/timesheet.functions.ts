// Timesheet lifecycle server functions.
//
// Flow:
//   1) rollupTimesheet({company_id, employee_id, period_start, period_end})
//        → reads punches, pairs them, applies federal + (optional) daily OT rules,
//          writes/updates time_entries linked to a timesheets row (status='open').
//   2) submitTimesheet({timesheet_id}) → employee or manager flips status='submitted'
//   3) approveTimesheet({timesheet_id}) → manager flips status='approved'; locks edits.
//   4) correctPunch({punch_id, new_punched_at, reason}) → creates a corrected punch
//      pointing at the original via corrected_from_id (audit trail).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rollupPunches, type OvertimeConfig } from "./overtime";

const MANAGER_ROLES = ["owner", "admin", "hr_admin", "payroll_admin", "manager"] as const;

async function assertManagerRole(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("company_id", companyId)
    .in("role", MANAGER_ROLES as unknown as string[]).limit(1);
  if (!data || data.length === 0) throw new Error("Forbidden: manager role required");
}

async function loadOtConfig(supabase: any, companyId: string): Promise<OvertimeConfig> {
  const { data } = await supabase
    .from("companies")
    .select("workweek_start_dow, weekly_ot_threshold, daily_ot_threshold, daily_double_ot_threshold")
    .eq("id", companyId).maybeSingle();
  return {
    workweekStartDow: Number(data?.workweek_start_dow ?? 0),
    weeklyOtThreshold: Number(data?.weekly_ot_threshold ?? 40),
    dailyOtThreshold: data?.daily_ot_threshold == null ? null : Number(data.daily_ot_threshold),
    dailyDoubleOtThreshold: data?.daily_double_ot_threshold == null ? null : Number(data.daily_double_ot_threshold),
  };
}

/* -------------------- rollupTimesheet -------------------- */

const rollupInput = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
});

export const rollupTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rollupInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertManagerRole(supabase, userId, data.company_id);

    // Verify employee belongs to company
    const { data: emp } = await supabase.from("employees")
      .select("id, user_id").eq("id", data.employee_id).eq("company_id", data.company_id).maybeSingle();
    if (!emp) throw new Error("Employee not found in this company");

    const { data: punches, error: pErr } = await supabase
      .from("time_clock_punches")
      .select("punched_at, punch_type")
      .eq("company_id", data.company_id)
      .eq("employee_id", data.employee_id)
      .gte("punched_at", `${data.period_start}T00:00:00Z`)
      .lte("punched_at", `${data.period_end}T23:59:59Z`)
      .order("punched_at", { ascending: true });
    if (pErr) throw new Error(pErr.message);

    const config = await loadOtConfig(supabase, data.company_id);
    const rollup = rollupPunches((punches ?? []) as any, config);

    // Upsert timesheet (composite unique on employee_id+period)
    const { data: existingTs } = await supabase.from("timesheets")
      .select("id, status")
      .eq("employee_id", data.employee_id)
      .eq("period_start", data.period_start)
      .eq("period_end", data.period_end)
      .maybeSingle();

    if (existingTs && (existingTs.status === "approved" || existingTs.status === "locked")) {
      throw new Error(`Timesheet is ${existingTs.status}; cannot recompute. Reject or unlock first.`);
    }

    let timesheetId = existingTs?.id;
    const tsPatch = {
      company_id: data.company_id,
      employee_id: data.employee_id,
      period_start: data.period_start,
      period_end: data.period_end,
      total_regular_hours: rollup.totals.regular,
      total_overtime_hours: rollup.totals.overtime,
      total_double_ot_hours: rollup.totals.doubleOvertime,
      status: "open" as const,
    };
    if (timesheetId) {
      await supabase.from("timesheets").update(tsPatch).eq("id", timesheetId);
    } else {
      const { data: created, error: cErr } = await supabase.from("timesheets").insert(tsPatch).select("id").single();
      if (cErr) throw new Error(cErr.message);
      timesheetId = created.id;
    }

    // Replace time_entries for this timesheet's period (only deletes if unlocked — trigger enforces)
    await supabase.from("time_entries")
      .delete()
      .eq("employee_id", data.employee_id)
      .eq("company_id", data.company_id)
      .gte("work_date", data.period_start)
      .lte("work_date", data.period_end);

    if (rollup.daily.length > 0) {
      const rows = rollup.daily.map((d) => ({
        owner_id: userId,
        company_id: data.company_id,
        employee_id: data.employee_id,
        timesheet_id: timesheetId,
        work_date: d.workDate,
        hours: d.regularHours,
        overtime_hours: d.overtimeHours,
        double_overtime_hours: d.doubleOvertimeHours,
      }));
      const { error: eErr } = await supabase.from("time_entries").insert(rows);
      if (eErr) throw new Error(eErr.message);
    }

    return { ok: true, timesheet_id: timesheetId, totals: rollup.totals, daily: rollup.daily };
  });

/* -------------------- submit / approve / reject -------------------- */

const idInput = z.object({ timesheet_id: z.string().uuid() });

async function transitionTimesheet(
  supabase: any, userId: string, timesheetId: string, target: "submitted" | "approved" | "rejected" | "open"
) {
  const { data: ts } = await supabase.from("timesheets").select("*").eq("id", timesheetId).maybeSingle();
  if (!ts) throw new Error("Timesheet not found");
  const isManagerAction = target === "approved" || target === "rejected";
  if (isManagerAction) {
    await assertManagerRole(supabase, userId, ts.company_id);
  } else {
    // submit/open: allow self OR manager
    const { data: emp } = await supabase.from("employees").select("user_id").eq("id", ts.employee_id).maybeSingle();
    if (emp?.user_id !== userId) await assertManagerRole(supabase, userId, ts.company_id);
  }
  if (ts.status === "approved" || ts.status === "locked") {
    throw new Error(`Timesheet is ${ts.status}; cannot transition.`);
  }
  const patch: Record<string, unknown> = { status: target };
  if (target === "submitted") patch.submitted_at = new Date().toISOString();
  if (target === "approved") { patch.approved_at = new Date().toISOString(); patch.approved_by = userId; }
  const { data: updated, error } = await supabase.from("timesheets").update(patch).eq("id", timesheetId).select().single();
  if (error) throw new Error(error.message);
  return updated;
}

export const submitTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ts = await transitionTimesheet(supabase, userId, data.timesheet_id, "submitted");
    return { ok: true, timesheet: ts };
  });

export const approveTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ts = await transitionTimesheet(supabase, userId, data.timesheet_id, "approved");
    return { ok: true, timesheet: ts };
  });

export const rejectTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ timesheet_id: z.string().uuid(), reason: z.string().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const ts = await transitionTimesheet(supabase, userId, data.timesheet_id, "rejected");
    await supabase.from("audit_events").insert({
      company_id: ts.company_id, actor_id: userId, action: "update",
      entity_type: "timesheet", entity_id: ts.id,
      after: { status: "rejected", reason: data.reason },
    });
    return { ok: true, timesheet: ts };
  });

/* -------------------- correctPunch -------------------- */

const correctInput = z.object({
  punch_id: z.string().uuid(),
  new_punched_at: z.string(), // ISO
  reason: z.string().min(3).max(500),
});

export const correctPunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => correctInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: orig } = await supabase.from("time_clock_punches").select("*").eq("id", data.punch_id).maybeSingle();
    if (!orig) throw new Error("Punch not found");
    await assertManagerRole(supabase, userId, orig.company_id);

    // Verify covering timesheet (by date) isn't locked
    const workDate = new Date(orig.punched_at).toISOString().slice(0, 10);
    const { data: ts } = await supabase.from("timesheets")
      .select("status")
      .eq("employee_id", orig.employee_id)
      .lte("period_start", workDate).gte("period_end", workDate)
      .maybeSingle();
    if (ts && (ts.status === "approved" || ts.status === "locked")) {
      throw new Error("Covering timesheet is locked; reject it before correcting punches.");
    }

    // Insert correcting punch; keep original (immutable audit trail)
    const { data: corrected, error } = await supabase.from("time_clock_punches").insert({
      company_id: orig.company_id,
      employee_id: orig.employee_id,
      user_id: orig.user_id,
      punch_type: orig.punch_type,
      punched_at: data.new_punched_at,
      latitude: orig.latitude, longitude: orig.longitude, accuracy_m: orig.accuracy_m,
      address: orig.address, inside_geofence: orig.inside_geofence,
      notes: `Correction: ${data.reason}`,
      corrected_from_id: orig.id,
      correction_reason: data.reason,
      corrected_at: new Date().toISOString(),
      corrected_by: userId,
    }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, punch: corrected, supersedes: orig.id };
  });
