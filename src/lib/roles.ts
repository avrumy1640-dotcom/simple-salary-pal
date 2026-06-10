import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "owner" | "admin" | "payroll_admin" | "hr_admin" | "manager"
  | "employee" | "supervisor" | "recruiter" | "benefits_admin"
  | "accountant" | "auditor";

export const ADMIN_ROLES: AppRole[] = ["owner", "admin"];
export const PAYROLL_ROLES: AppRole[] = ["owner", "admin", "payroll_admin", "accountant"];
export const HR_ROLES: AppRole[] = ["owner", "admin", "hr_admin", "recruiter", "benefits_admin"];
export const MANAGER_ROLES: AppRole[] = ["owner", "admin", "manager", "supervisor", "hr_admin"];
export const ANY_ADMIN: AppRole[] = [
  "owner", "admin", "payroll_admin", "hr_admin",
  "recruiter", "benefits_admin", "accountant", "auditor",
];

export function isAdmin(role: AppRole | string | null | undefined) {
  return !!role && (ANY_ADMIN as string[]).includes(role);
}
export function isManager(role: AppRole | string | null | undefined) {
  return role === "manager" || role === "supervisor";
}
export function isEmployeeOnly(role: AppRole | string | null | undefined) {
  return role === "employee" || !role;
}

export function useRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) { setRole(null); setLoading(false); } return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .limit(1);
      if (!alive) return;
      setRole(((data && data[0]?.role) as AppRole) || "employee");
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);
  return { role, loading };
}
