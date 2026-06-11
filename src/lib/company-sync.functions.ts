import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_ROLES = ["owner", "admin"] as const;
const EMPLOYEE_PORTAL_ADMIN_ROLES = new Set([
  "owner",
  "admin",
  "payroll_admin",
  "hr_admin",
  "recruiter",
  "benefits_admin",
  "accountant",
  "auditor",
  "manager",
  "supervisor",
]);

type DbClient = SupabaseClient<Database>;
type ProfileSummary = {
  company_name: string | null;
  full_name: string | null;
  account_type: string | null;
} | null;
type RoleSummary = { role: string; company_id: string | null };
type EmployeeSummary = {
  id: string;
  company_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
} | null;
type CompanySummary = { legal_name: string | null; dba: string | null } | null;

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

async function userCanManageCompany(supabase: DbClient, userId: string, companyId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
      .in("role", ADMIN_ROLES)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

export const saveSyncedCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: DbClient; userId: string };
    const canManage = await userCanManageCompany(supabase, userId, data.company_id);
    if (!canManage) throw new Error("You don't have permission to update this company.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: company, error: companyReadError } = await supabaseAdmin
      .from("companies")
      .select("owner_id")
      .eq("id", data.company_id)
      .maybeSingle();
    if (companyReadError) throw new Error(companyReadError.message);

    const legalName = data.legal_name.trim();
    const payload = {
      owner_id: company?.owner_id ?? userId,
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
      supabaseAdmin
        .from("profiles")
        .select("company_name, full_name, account_type")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin.from("user_roles").select("role, company_id").eq("user_id", userId),
    ]);
    const userProfile = profile as ProfileSummary;
    const userRoles = (roles ?? []) as RoleSummary[];

    const email = authUser?.user?.email ?? "";
    const roleNames = userRoles.map((r) => String(r.role));
    const isEmployee = roleNames.includes("employee") || userProfile?.account_type === "employee";
    const isAdmin = roleNames.some((role) => EMPLOYEE_PORTAL_ADMIN_ROLES.has(role));
    if (isAdmin && !isEmployee) {
      return {
        destination: "admin" as const,
        email,
        fullName: userProfile?.full_name ?? "",
        companyName: userProfile?.company_name ?? "",
      };
    }

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("id, company_id, user_id, full_name, email")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    let employeeRecord = employee as EmployeeSummary;

    if (!employeeRecord && email) {
      const match = await supabaseAdmin
        .from("employees")
        .select("id, company_id, user_id, full_name, email")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      employeeRecord = match.data as EmployeeSummary;
    }

    if (employeeRecord && !employeeRecord.user_id) {
      await supabaseAdmin.from("employees").update({ user_id: userId }).eq("id", employeeRecord.id);
      await supabaseAdmin.from("company_users").upsert(
        {
          company_id: employeeRecord.company_id,
          user_id: userId,
          accepted_at: new Date().toISOString(),
        },
        { onConflict: "company_id,user_id" },
      );
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userId, company_id: employeeRecord.company_id, role: "employee" },
        { onConflict: "user_id,company_id,role" },
      );
    }

    const { data: company } = employeeRecord
      ? await supabaseAdmin
          .from("companies")
          .select("legal_name, dba")
          .eq("id", employeeRecord.company_id)
          .maybeSingle()
      : { data: null };
    const companyRecord = company as CompanySummary;

    return {
      destination: "employee" as const,
      email,
      fullName: employeeRecord?.full_name || userProfile?.full_name || email.split("@")[0] || "Employee",
      companyName: companyRecord?.dba || companyRecord?.legal_name || userProfile?.company_name || "Your workplace",
    };
  });