import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertRole(supabase: any, userId: string, companyId: string, roles: string[]) {
  for (const r of roles) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _company_id: companyId, _role: r });
    if (data === true) return;
  }
  throw new Error("forbidden");
}

export const assignOnboardingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    company_id: string; template_id: string;
    employee_id?: string | null; contractor_id?: string | null;
    start_date?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.company_id, ["owner","admin","hr_admin"]);
    const { data: out, error } = await supabase.rpc("assign_onboarding_template", {
      _company_id: data.company_id,
      _template_id: data.template_id,
      _employee_id: (data.employee_id ?? null) as any,
      _contractor_id: (data.contractor_id ?? null) as any,
      _start_date: data.start_date ?? new Date().toISOString().slice(0, 10),
    });
    if (error) throw new Error(error.message);
    return { assignment_id: out as string };
  });

export const generateComplianceAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { company_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.company_id, ["owner","admin","hr_admin","auditor"]);
    const { error } = await supabase.rpc("generate_compliance_alerts", { _company_id: data.company_id });
    if (error) throw new Error(error.message);
    // Return latest open alerts
    const { data: alerts } = await supabase
      .from("compliance_alerts")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("status", "open")
      .order("severity", { ascending: false })
      .limit(200);
    return { alerts: alerts ?? [] };
  });
