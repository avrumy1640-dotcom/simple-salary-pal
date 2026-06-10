import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole =
  | "owner" | "admin" | "payroll_admin" | "hr_admin" | "manager"
  | "employee" | "supervisor" | "recruiter" | "benefits_admin"
  | "accountant" | "auditor";

async function ensureAdmin(supabase: any, userId: string, companyId: string) {
  const { data, error } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _company_id: companyId,
    _roles: ["owner", "admin"],
  });
  if (error || !data) throw new Error("Forbidden");
}

export const listCompanyUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members } = await supabaseAdmin
      .from("company_users")
      .select("user_id, accepted_at, is_default")
      .eq("company_id", data.companyId);
    const ids = (members ?? []).map((m) => m.user_id);
    if (ids.length === 0) return { users: [] as any[] };
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").eq("company_id", data.companyId).in("user_id", ids),
    ]);
    const emails: Record<string, string> = {};
    for (const uid of ids) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (u?.user) emails[uid] = u.user.email ?? "";
    }
    const users = (members ?? []).map((m) => {
      const p = profiles?.find((x) => x.id === m.user_id);
      const r = roles?.find((x) => x.user_id === m.user_id);
      return {
        user_id: m.user_id,
        email: emails[m.user_id] ?? "",
        full_name: p?.full_name ?? "",
        role: (r?.role as AppRole) ?? "employee",
        accepted_at: m.accepted_at,
      };
    });
    return { users };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string; userId: string; role: AppRole }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("company_id", data.companyId);
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.userId,
      company_id: data.companyId,
      role: data.role,
      granted_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeCompanyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string; userId: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, data.companyId);
    if (data.userId === context.userId) throw new Error("Cannot remove yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("company_id", data.companyId);
    await supabaseAdmin.from("company_users").delete().eq("user_id", data.userId).eq("company_id", data.companyId);
    return { ok: true };
  });

export const inviteTeammate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string; email: string; role: AppRole }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Try to find existing user by email
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase());
    let targetId = existing?.id;
    if (!targetId) {
      const { data: inv, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
      if (error) throw new Error(error.message);
      targetId = inv.user?.id;
    }
    if (!targetId) throw new Error("Could not resolve user");
    await supabaseAdmin.from("company_users").upsert({
      company_id: data.companyId,
      user_id: targetId,
      invited_by: context.userId,
      accepted_at: existing ? new Date().toISOString() : null,
    }, { onConflict: "company_id,user_id" });
    await supabaseAdmin.from("user_roles").delete()
      .eq("user_id", targetId).eq("company_id", data.companyId);
    await supabaseAdmin.from("user_roles").insert({
      user_id: targetId, company_id: data.companyId, role: data.role, granted_by: context.userId,
    });
    return { ok: true, invited: !existing };
  });
