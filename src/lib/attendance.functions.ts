import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAttendanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; weekStart: string; weeks?: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ok } = await supabase.rpc("has_any_role", {
      _user_id: userId,
      _company_id: data.companyId,
      _roles: ["owner", "admin", "hr_admin", "manager", "payroll_admin"],
    });
    if (!ok) throw new Error("Forbidden");

    const weeks = Math.max(1, Math.min(data.weeks ?? 4, 26));
    const start = new Date(data.weekStart);
    const end = new Date(start.getTime() + weeks * 7 * 86400_000);

    const [report, employees] = await Promise.all([
      supabase.from("attendance_report_v" as any).select("*")
        .eq("company_id", data.companyId)
        .gte("week_start", start.toISOString().slice(0, 10))
        .lt("week_start", end.toISOString().slice(0, 10))
        .order("week_start", { ascending: false }),
      supabase.from("employees").select("id, full_name")
        .eq("company_id", data.companyId).order("full_name"),
    ]);

    if (report.error) throw new Error(report.error.message);
    const empMap = new Map((employees.data ?? []).map((e: any) => [e.id, e.full_name]));
    const rows = (report.data ?? []).map((r: any) => ({
      ...r,
      employee_name: empMap.get(r.employee_id) ?? "Unknown",
    }));
    return { rows };
  });
