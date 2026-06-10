// Payroll workflow server functions. Enforce state transitions, RBAC, and audit logging.
//
// State machine:
//   draft -> review -> approved -> locked -> processed
//                                          -> reversed
//   processed -> corrected (creates a new draft run with correction_of=originalId)

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["review", "approved"],
  review: ["draft", "approved"],
  approved: ["locked", "draft"],
  locked: ["processed", "reversed"],
  processed: ["reversed", "corrected"],
  reversed: [],
  corrected: [],
};

async function requireRole(
  supabase: any,
  userId: string,
  companyId: string,
  roles: string[]
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", roles)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: missing required role");
}

async function writeAudit(
  supabase: any,
  args: {
    actor_id: string;
    company_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    before?: unknown;
    after?: unknown;
  }
) {
  await supabase.from("audit_events").insert({
    actor_id: args.actor_id,
    company_id: args.company_id,
    action: args.action,
    entity_type: args.entity_type,
    entity_id: args.entity_id,
    before: args.before ?? null,
    after: args.after ?? null,
  });
}

const transitionInput = z.object({
  run_id: z.string().uuid(),
  next_status: z.enum(["draft", "review", "approved", "locked", "processed", "reversed"]),
  reason: z.string().optional(),
});

export const transitionPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => transitionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: run, error } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", data.run_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Payroll run not found");

    const allowed = VALID_TRANSITIONS[run.status] ?? [];
    if (!allowed.includes(data.next_status)) {
      throw new Error(`Invalid transition: ${run.status} -> ${data.next_status}`);
    }

    await requireRole(supabase, userId, run.company_id, ["owner", "admin", "payroll_admin"]);

    const patch: Record<string, unknown> = { status: data.next_status };
    const now = new Date().toISOString();
    if (data.next_status === "approved") { patch.approved_at = now; patch.approved_by = userId; }
    if (data.next_status === "locked") { patch.locked_at = now; patch.locked_by = userId; }
    if (data.next_status === "processed") { patch.processed_at = now; }
    if (data.next_status === "reversed") {
      patch.reversed_at = now;
      patch.reversed_by = userId;
      await supabase.from("payroll_reversals").insert({
        company_id: run.company_id,
        run_id: run.id,
        reason: data.reason ?? "No reason provided",
        reversed_by: userId,
      });
    }

    const { data: updated, error: uErr } = await supabase
      .from("payroll_runs")
      .update(patch)
      .eq("id", run.id)
      .select()
      .single();
    if (uErr) throw new Error(uErr.message);

    await writeAudit(supabase, {
      actor_id: userId,
      company_id: run.company_id,
      action:
        data.next_status === "approved" ? "approve" :
        data.next_status === "locked" ? "lock" :
        data.next_status === "processed" ? "process" :
        data.next_status === "reversed" ? "reverse" : "update",
      entity_type: "payroll_run",
      entity_id: run.id,
      before: { status: run.status },
      after: { status: data.next_status, reason: data.reason },
    });

    // On processing, write employer tax liability + tax records
    if (data.next_status === "processed") {
      const { data: items } = await supabase
        .from("payroll_items")
        .select("gross_pay, social_security, medicare, federal_tax, state_tax")
        .eq("run_id", run.id);
      const totals = (items ?? []).reduce(
        (s: any, i: any) => ({
          gross: s.gross + Number(i.gross_pay || 0),
          ss: s.ss + Number(i.social_security || 0),
          med: s.med + Number(i.medicare || 0),
          fed: s.fed + Number(i.federal_tax || 0),
          state: s.state + Number(i.state_tax || 0),
        }),
        { gross: 0, ss: 0, med: 0, fed: 0, state: 0 }
      );
      // Pull state UI rate from company settings
      const { data: company } = await supabase
        .from("companies").select("state_unemployment_rate, state_unemployment_wage_base, state").eq("id", run.company_id).maybeSingle();
      const sutaRate = Number(company?.state_unemployment_rate ?? 0.027);
      const futaCapped = Math.min(totals.gross, 7000);
      const sutaCapped = Math.min(totals.gross, Number(company?.state_unemployment_wage_base ?? 7000));

      await supabase.from("employer_tax_liabilities").insert({
        company_id: run.company_id,
        run_id: run.id,
        futa: Number((futaCapped * 0.006).toFixed(2)),
        suta: Number((sutaCapped * sutaRate).toFixed(2)),
        employer_ss: totals.ss,
        employer_medicare: totals.med,
      });

      await supabase.from("tax_records").insert([
        { company_id: run.company_id, run_id: run.id, period_start: run.pay_period_start, period_end: run.pay_period_end, jurisdiction: "US-FED", tax_type: "fit", taxable_wages: totals.gross, tax_amount: totals.fed, liability_date: run.pay_date },
        { company_id: run.company_id, run_id: run.id, period_start: run.pay_period_start, period_end: run.pay_period_end, jurisdiction: "US-FED", tax_type: "fica", taxable_wages: totals.gross, tax_amount: Number((totals.ss + totals.med).toFixed(2)), liability_date: run.pay_date },
        { company_id: run.company_id, run_id: run.id, period_start: run.pay_period_start, period_end: run.pay_period_end, jurisdiction: company?.state ?? "STATE", tax_type: "sit", taxable_wages: totals.gross, tax_amount: totals.state, liability_date: run.pay_date },
      ]);
    }

    return { ok: true, run: updated };
  });

const correctionInput = z.object({
  original_run_id: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const createCorrectionRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => correctionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: original, error } = await supabase
      .from("payroll_runs").select("*").eq("id", data.original_run_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!original) throw new Error("Original run not found");
    if (original.status !== "processed") throw new Error("Only processed runs can be corrected");

    await requireRole(supabase, userId, original.company_id, ["owner", "admin", "payroll_admin"]);

    const { data: newRun, error: nErr } = await supabase
      .from("payroll_runs")
      .insert({
        company_id: original.company_id,
        owner_id: original.owner_id,
        pay_period_start: original.pay_period_start,
        pay_period_end: original.pay_period_end,
        pay_date: original.pay_date,
        status: "draft",
        correction_of: original.id,
      })
      .select()
      .single();
    if (nErr) throw new Error(nErr.message);

    await supabase.from("payroll_corrections").insert({
      company_id: original.company_id,
      original_run_id: original.id,
      correcting_run_id: newRun.id,
      reason: data.reason,
      created_by: userId,
    });

    await supabase.from("payroll_runs").update({ status: "corrected" }).eq("id", original.id);

    await writeAudit(supabase, {
      actor_id: userId,
      company_id: original.company_id,
      action: "correct",
      entity_type: "payroll_run",
      entity_id: original.id,
      after: { correcting_run_id: newRun.id, reason: data.reason },
    });

    return { ok: true, correcting_run: newRun };
  });
