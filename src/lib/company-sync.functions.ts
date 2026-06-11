import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = ["owner", "admin"] as const;
const EMPLOYEE_PORTAL_ADMIN_ROLES = new Set(["owner", "admin", "payroll_admin", "hr_admin", "recruiter", "benefits_admin", "accountant", "auditor", "manager", "supervisor"]);

const settingsSchema = z.object({
  company_id: z.string().uuid(),
  legal_name: z.string().trim().max(160),
  ein: z.string().trim().max(40).nullable().optional(),
  state_tax_id: z.string().trim().max(80).nullable().optional(),
  business_address: z.string().trim().max(240).nullable().optional(),
  business_city: z.string().trim().max(120).nullable().optional(),
  business_state: z.string().trim().max(20).nullable().optional(),
  business_zip: z.string().trim().max(30).nullable().optional(),
  pay_frequency: z.string().trim().min(1).max(40),
  next_pay_date: z.string().nullable().optional(),
});

async function userCanManageCompany(supabase: any, userId: string, companyId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", ADMIN_ROLES as unknown as string[])
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

export const saveSyncedCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const canManage = await userCanManageCompany(supabase, userId, data.company_id);
    if (!canManage) throw new Error("You don't have permission to update this company.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const legalName = data.legal_name.trim();
    const payload = {
      owner_id: userId,
      company_id: data.company_id,
      legal_name: legalName,
      ein: data.ein || null,
      state_tax_id: data.state_tax_id || null,
      business_address: data.business_address || null,
      business_city: data.business_city || null,
      business_state: data.business_state || null,
      business_zip: data.business_zip || null,
      pay_frequency: data.pay_frequency,
      next_pay_date: data.next_pay_date || null,
      onboarding_complete: !!legalName && !!data.ein,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: settingsError } = await supabaseAdmin
      .from("company_settings")
      .upsert(payload, { onConflict: "company_id" })
      .select()
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);

    if (legalName) {
      const { error: companyError } = await supabaseAdmin
        .from("companies")
        .update({ legal_name: legalName, updated_at: new Date().toISOString() })
        .eq("id", data.company_id);
      if (companyError) throw new Error(companyError.message);

      await supabaseAdmin
        .from("profiles")
        .update({ company_name: legalName, updated_at: new Date().toISOString() })
        .eq("id", userId);
    }

    return { ok: true, settings: saved, legal_name: legalName };
  });

export const getEmployeePortalIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: authUser }, { data: profile }, { data: roles }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin.from("profiles").select("company_name, full_name, account_type").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role, company_id").eq("user_id", userId),
    ]);

    const email = authUser?.user?.email ?? "";
    const roleNames = (roles ?? []).map((r: any) => String(r.role));
    const isEmployee = roleNames.includes("employee") || (profile as any)?.account_type === "employee";
    const isAdmin = roleNames.some((role) => EMPLOYEE_PORTAL_ADMIN_ROLES.has(role));
    if (isAdmin && !isEmployee) {
      return { destination: "admin" as const, email, fullName: (profile as any)?.full_name ?? "", companyName: (profile as any)?.company_name ?? "" };
    }

    let { data: employee } = await supabaseAdmin
      .from("employees")
      .select("id, company_id, user_id, full_name, email")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!employee && email) {
      const match = await supabaseAdmin
        .from("employees")
        .select("id, company_id, user_id, full_name, email")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      employee = match.data;
    }

    if (employee && !employee.user_id) {
      await supabaseAdmin.from("employees").update({ user_id: userId }).eq("id", employee.id);
      await supabaseAdmin.from("company_users").upsert(
        { company_id: employee.company_id, user_id: userId, accepted_at: new Date().toISOString() },
        { onConflict: "company_id,user_id" },
      );
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userId, company_id: employee.company_id, role: "employee" },
        { onConflict: "user_id,company_id,role" },
      );
    }

    const { data: company } = employee
      ? await supabaseAdmin.from("companies").select("legal_name, dba").eq("id", employee.company_id).maybeSingle()
      : { data: null };

    return {
      destination: "employee" as const,
      email,
      fullName: employee?.full_name || (profile as any)?.full_name || email.split("@")[0] || "Employee",
      companyName: (company as any)?.dba || (company as any)?.legal_name || (profile as any)?.company_name || "Your workplace",
    };
  });