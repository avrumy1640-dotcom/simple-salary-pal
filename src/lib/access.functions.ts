import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Server-side guard: returns the caller's role for whatever company they
// are a member of. Used by /app route `beforeLoad` to gate the admin shell
// before any admin page renders — RLS still protects data, but this keeps
// admin UI from rendering for plain employees who navigate directly.
export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .limit(1);
    if (error) throw new Error(error.message);
    const role = (data?.[0]?.role as string | undefined) ?? null;
    const adminRoles = new Set([
      "owner","admin","payroll_admin","hr_admin","recruiter",
      "benefits_admin","accountant","auditor","manager","supervisor",
    ]);
    return { role, hasAccess: !!role && adminRoles.has(role) };
  });
