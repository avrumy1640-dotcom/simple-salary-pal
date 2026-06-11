import { createFileRoute, redirect } from "@tanstack/react-router";
import { EmployeeShell } from "@/components/EmployeeShell";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLES = new Set(["owner", "admin", "payroll_admin", "hr_admin", "recruiter", "benefits_admin", "accountant", "auditor", "manager", "supervisor"]);

export const Route = createFileRoute("/employee")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).limit(1);
    const role = roles?.[0]?.role;
    if (role && ADMIN_ROLES.has(role)) throw redirect({ to: "/app/dashboard" });
  },
  component: EmployeeShell,
});
