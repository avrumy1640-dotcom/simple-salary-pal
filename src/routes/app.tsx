import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLES = new Set(["owner", "admin", "payroll_admin", "hr_admin", "recruiter", "benefits_admin", "accountant", "auditor", "manager", "supervisor"]);

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth" });

    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1),
      supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle(),
    ]);
    const role = roles?.[0]?.role;
    if ((role && ADMIN_ROLES.has(role)) || profile?.account_type === "employer") return;
    throw redirect({ to: "/employee/home" });
  },
  component: AppShell,
});
