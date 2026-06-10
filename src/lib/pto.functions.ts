// PTO server functions.
//
// Authoritative flow:
//   • Request lifecycle: pending → approved | denied | cancelled.
//   • Approval inserts a debit row into pto_ledger via DB trigger (tg_pto_entry_apply),
//     which in turn recomputes balance_after and mirrors it onto employees.pto_balance_hours.
//   • Accrual runs (runAccrual) compute hours-per-period per assigned policy, apply
//     max-balance caps, and insert credit rows into pto_ledger keyed by run id so a
//     duplicate run cannot double-credit (UNIQUE on ref_type+ref_id+reason).
//
// All mutations are authorized via has_any_role; the DB still re-enforces RLS as a
// defense in depth.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PTO_ADMIN_ROLES = ["owner", "admin", "hr_admin", "payroll_admin", "manager"] as const;

async function assertPtoAdmin(supabase: any, userId: string, companyId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", PTO_ADMIN_ROLES as unknown as string[])
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: PTO admin or manager role required");
}

/* -------------------- Approve / Deny / Cancel -------------------- */

const idInput = z.object({ entry_id: z.string().uuid() });

export const approvePtoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: entry, error } = await supabase
      .from("pto_entries").select("*").eq("id", data.entry_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!entry) throw new Error("Request not found");
    if (entry.status === "approved") return { ok: true, entry };
    await assertPtoAdmin(supabase, userId, entry.company_id);

    // Optional safety: prevent approving a request that would exceed available balance
    // for paid PTO categories. Unpaid leave is exempt.
    if (entry.pto_type !== "unpaid") {
      const { data: emp } = await supabase
        .from("employees").select("pto_balance_hours, lifecycle_status")
        .eq("id", entry.employee_id).maybeSingle();
      if (emp?.lifecycle_status === "terminated") {
        throw new Error("Employee is terminated; cannot approve PTO.");
      }
      if (emp && Number(emp.pto_balance_hours) < Number(entry.hours)) {
        throw new Error(
          `Insufficient balance: employee has ${Number(emp.pto_balance_hours).toFixed(2)}h, ` +
          `request is ${Number(entry.hours).toFixed(2)}h. Approve anyway by changing type to unpaid or reducing hours.`
        );
      }
    }

    const { data: updated, error: uErr } = await supabase
      .from("pto_entries")
      .update({ status: "approved" })
      .eq("id", data.entry_id)
      .select().single();
    if (uErr) throw new Error(uErr.message);
    return { ok: true, entry: updated };
  });

export const denyPtoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entry_id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: entry } = await supabase.from("pto_entries").select("*").eq("id", data.entry_id).maybeSingle();
    if (!entry) throw new Error("Request not found");
    await assertPtoAdmin(supabase, userId, entry.company_id);
    const wasApproved = entry.status === "approved";
    const notes = data.reason ? `${entry.notes ?? ""}\n[denied] ${data.reason}`.trim() : entry.notes;
    const { data: updated, error } = await supabase
      .from("pto_entries").update({ status: "denied", notes }).eq("id", data.entry_id).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, entry: updated, reversed: wasApproved };
  });

export const cancelPtoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: entry } = await supabase.from("pto_entries").select("*").eq("id", data.entry_id).maybeSingle();
    if (!entry) throw new Error("Request not found");

    // Self-cancel allowed only while pending.
    const { data: emp } = await supabase.from("employees").select("user_id").eq("id", entry.employee_id).maybeSingle();
    const isSelf = emp?.user_id === userId;
    if (!isSelf) {
      await assertPtoAdmin(supabase, userId, entry.company_id);
    } else if (entry.status !== "pending") {
      throw new Error("Cannot cancel a request that's already been decided");
    }

    const { data: updated, error } = await supabase
      .from("pto_entries").update({ status: "cancelled" }).eq("id", data.entry_id).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, entry: updated };
  });

/* -------------------- Accrual run -------------------- */

const accrualInput = z.object({
  company_id: z.string().uuid(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  policy_id: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Runs an accrual: for each active employee that has a pto_policy_id (or for everyone
 * matching the explicit policy_id), credits `hours_per_period` to their pto_ledger,
 * capped by the policy's max_balance_hours. Idempotent per (company, as_of_date, policy).
 */
export const runAccrual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => accrualInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertPtoAdmin(supabase, userId, data.company_id);

    // Idempotency check
    const { data: existing } = await supabase
      .from("pto_accrual_runs")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("as_of_date", data.as_of_date)
      .eq("policy_id", data.policy_id ?? null)
      .maybeSingle();
    if (existing) {
      return { ok: false, error: "Accrual already run for this date+policy", run_id: existing.id };
    }

    // Insert run shell so we have an id to anchor ledger entries against
    const { data: run, error: rErr } = await supabase
      .from("pto_accrual_runs")
      .insert({
        company_id: data.company_id,
        as_of_date: data.as_of_date,
        policy_id: data.policy_id ?? null,
        triggered_by: userId,
        notes: data.notes ?? null,
      })
      .select().single();
    if (rErr) throw new Error(rErr.message);

    // Load policies (or just the requested one)
    let policyQuery = supabase
      .from("pto_accrual_policies")
      .select("id, hours_per_period, max_balance_hours")
      .eq("company_id", data.company_id);
    if (data.policy_id) policyQuery = policyQuery.eq("id", data.policy_id);
    const { data: policies } = await policyQuery;

    if (!policies || policies.length === 0) {
      return { ok: true, run_id: run.id, employees_accrued: 0, hours_total: 0, note: "No policies configured" };
    }

    const policyById = new Map<string, { hours_per_period: number; max_balance_hours: number | null }>();
    for (const p of policies as any[]) {
      policyById.set(p.id, {
        hours_per_period: Number(p.hours_per_period),
        max_balance_hours: p.max_balance_hours == null ? null : Number(p.max_balance_hours),
      });
    }

    // Load eligible employees
    let empQuery = supabase
      .from("employees")
      .select("id, pto_policy_id, pto_balance_hours")
      .eq("company_id", data.company_id)
      .eq("lifecycle_status", "active");
    if (data.policy_id) empQuery = empQuery.eq("pto_policy_id", data.policy_id);
    else empQuery = empQuery.not("pto_policy_id", "is", null);
    const { data: employees } = await empQuery;

    let count = 0;
    let total = 0;
    const ledgerRows: any[] = [];
    for (const emp of (employees ?? []) as any[]) {
      const policy = policyById.get(emp.pto_policy_id);
      if (!policy) continue;
      const current = Number(emp.pto_balance_hours ?? 0);
      let credit = policy.hours_per_period;
      if (policy.max_balance_hours != null) {
        const room = Math.max(0, policy.max_balance_hours - current);
        credit = Math.min(credit, room);
      }
      if (credit <= 0) continue;
      ledgerRows.push({
        company_id: data.company_id,
        employee_id: emp.id,
        delta_hours: Number(credit.toFixed(2)),
        reason: "pto_accrual",
        ref_type: "pto_accrual_runs",
        ref_id: run.id,
        balance_after: 0, // trigger overwrites
      });
      count += 1;
      total += credit;
    }

    if (ledgerRows.length > 0) {
      const { error: lErr } = await supabase.from("pto_ledger").insert(ledgerRows);
      if (lErr) throw new Error(lErr.message);
      // Stamp last_accrued_at on each accrued employee
      const ids = ledgerRows.map((r) => r.employee_id);
      await supabase.from("employees").update({ last_accrued_at: new Date().toISOString() }).in("id", ids);
    }

    await supabase.from("pto_accrual_runs")
      .update({ employees_accrued: count, hours_total: Number(total.toFixed(2)) })
      .eq("id", run.id);

    return { ok: true, run_id: run.id, employees_accrued: count, hours_total: Number(total.toFixed(2)) };
  });
