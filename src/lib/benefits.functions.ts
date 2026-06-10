import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CONSENT_TEXT =
  "By electing this benefit, I authorize the corresponding pre/post-tax payroll deduction and agree this electronic action constitutes my legal signature under ESIGN/UETA.";

export const electBenefit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    company_id: string; plan_id: string; employee_id: string;
    coverage_tier: "employee" | "employee_spouse" | "employee_children" | "family";
    effective_date: string;
    signed_name: string;
    qualifying_event?: string | null;
    user_agent?: string | null;
    ip?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify the caller is the employee or an admin
    const { data: emp } = await supabase
      .from("employees")
      .select("id, user_id, company_id, start_date")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (!emp || emp.company_id !== data.company_id) throw new Error("employee not found");

    const isSelf = emp.user_id === userId;
    let isAdmin = false;
    if (!isSelf) {
      for (const r of ["owner","admin","hr_admin","benefits_admin"]) {
        const { data: ok } = await supabase.rpc("has_role", { _user_id: userId, _company_id: data.company_id, _role: r as any });
        if (ok) { isAdmin = true; break; }
      }
      if (!isAdmin) throw new Error("forbidden");
    }

    if (isSelf) {
      const { data: canSelf } = await supabase.rpc("employee_can_self_enroll", { _employee_id: data.employee_id });
      if (!canSelf) throw new Error("enrollment_window_closed");
    }

    // Load plan
    const { data: plan } = await supabase
      .from("benefit_plans")
      .select("monthly_premium_employee, monthly_premium_employee_spouse, monthly_premium_employee_children, monthly_premium_family, employer_contribution_pct, employer_contribution_flat")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (!plan) throw new Error("plan not found");

    const total = Number(
      data.coverage_tier === "family" ? plan.monthly_premium_family :
      data.coverage_tier === "employee_spouse" ? plan.monthly_premium_employee_spouse :
      data.coverage_tier === "employee_children" ? plan.monthly_premium_employee_children :
      plan.monthly_premium_employee
    );
    const employer = +(total * (Number(plan.employer_contribution_pct ?? 0)/100) + Number(plan.employer_contribution_flat ?? 0)).toFixed(2);
    const employerCapped = Math.min(employer, total);
    const employee = +(total - employerCapped).toFixed(2);

    const status = isAdmin ? "active" : "pending";

    const { data: enrollment, error } = await supabase
      .from("benefit_enrollments")
      .insert({
        company_id: data.company_id,
        plan_id: data.plan_id,
        employee_id: data.employee_id,
        coverage_tier: data.coverage_tier,
        status,
        effective_date: data.effective_date,
        employee_monthly_cost: employee,
        employer_monthly_cost: employerCapped,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("benefit_election_events").insert({
      company_id: data.company_id,
      enrollment_id: enrollment.id,
      employee_id: data.employee_id,
      event_type: isAdmin ? "admin_elect" : "self_elect",
      plan_id: data.plan_id,
      coverage_tier: data.coverage_tier,
      employee_monthly_cost: employee,
      employer_monthly_cost: employerCapped,
      signed_name: data.signed_name,
      signed_ip: data.ip ?? null,
      signed_user_agent: data.user_agent ?? null,
      consent_text: CONSENT_TEXT,
      qualifying_event: data.qualifying_event ?? null,
      effective_date: data.effective_date,
      actor_user_id: userId,
    });

    return { enrollment };
  });

export const approveEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enrollment_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: e } = await supabase.from("benefit_enrollments").select("*").eq("id", data.enrollment_id).maybeSingle();
    if (!e) throw new Error("not found");
    let ok = false;
    for (const r of ["owner","admin","hr_admin","benefits_admin"]) {
      const { data: has } = await supabase.rpc("has_role", { _user_id: userId, _company_id: e.company_id, _role: r as any });
      if (has) { ok = true; break; }
    }
    if (!ok) throw new Error("forbidden");
    const { error } = await supabase.from("benefit_enrollments").update({ status: "active" }).eq("id", data.enrollment_id);
    if (error) throw new Error(error.message);
    await supabase.from("benefit_election_events").insert({
      company_id: e.company_id, enrollment_id: e.id, employee_id: e.employee_id,
      event_type: "approved", plan_id: e.plan_id, coverage_tier: e.coverage_tier,
      employee_monthly_cost: e.employee_monthly_cost, employer_monthly_cost: e.employer_monthly_cost,
      effective_date: e.effective_date, actor_user_id: userId,
      consent_text: "Administrator approval of pending election.",
    });
    return { ok: true };
  });

export const terminateEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enrollment_id: string; end_date: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: e } = await supabase.from("benefit_enrollments").select("*").eq("id", data.enrollment_id).maybeSingle();
    if (!e) throw new Error("not found");
    let ok = false;
    for (const r of ["owner","admin","hr_admin","benefits_admin"]) {
      const { data: has } = await supabase.rpc("has_role", { _user_id: userId, _company_id: e.company_id, _role: r as any });
      if (has) { ok = true; break; }
    }
    if (!ok) throw new Error("forbidden");
    const { error } = await supabase.from("benefit_enrollments")
      .update({ status: "terminated", end_date: data.end_date })
      .eq("id", data.enrollment_id);
    if (error) throw new Error(error.message);
    await supabase.from("benefit_election_events").insert({
      company_id: e.company_id, enrollment_id: e.id, employee_id: e.employee_id,
      event_type: "terminated", plan_id: e.plan_id, coverage_tier: e.coverage_tier,
      effective_date: data.end_date, actor_user_id: userId,
      consent_text: data.reason ?? "Coverage termination",
    });
    return { ok: true };
  });
