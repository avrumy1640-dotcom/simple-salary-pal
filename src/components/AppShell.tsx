import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Clock, Wallet, FileText, LogOut, Menu, X,
  CalendarDays, Settings as SettingsIcon, UserPlus, Target, ShieldCheck,
  BarChart3, FolderOpen, Megaphone, Plug, HeartHandshake, ChevronLeft,
  ChevronRight, Building2, Sparkles, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { ADMIN_ROLES, PAYROLL_ROLES, HR_ROLES, MANAGER_ROLES, ANY_ADMIN, isAdmin, isManager, type AppRole } from "@/lib/roles";

type NavItem = { to: string; label: string; icon: typeof Users; roles: readonly AppRole[] };
const nav: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ANY_ADMIN },
  { to: "/app/employees", label: "Employees", icon: Users, roles: HR_ROLES },
  { to: "/app/payroll", label: "Payroll", icon: Wallet, roles: PAYROLL_ROLES },
  { to: "/app/time", label: "Time tracking", icon: Clock, roles: [...MANAGER_ROLES] },
  { to: "/app/tracking", label: "Location & field", icon: MapPin, roles: [...MANAGER_ROLES] },
  { to: "/app/scheduling", label: "Scheduling", icon: CalendarDays, roles: [...MANAGER_ROLES] },
  { to: "/app/recruiting", label: "Recruiting", icon: UserPlus, roles: HR_ROLES },
  { to: "/app/onboarding", label: "Onboarding", icon: ShieldCheck, roles: HR_ROLES },
  { to: "/app/onboarding-templates", label: "Onboarding templates", icon: ShieldCheck, roles: HR_ROLES },
  { to: "/app/benefits", label: "Benefits", icon: HeartHandshake, roles: HR_ROLES },
  { to: "/app/performance", label: "Performance", icon: Target, roles: [...HR_ROLES, "manager", "supervisor"] },
  { to: "/app/compliance", label: "Compliance", icon: ShieldCheck, roles: HR_ROLES },
  { to: "/app/reports", label: "Reports", icon: BarChart3, roles: ANY_ADMIN },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3, roles: ANY_ADMIN },
  { to: "/app/tax-filing", label: "Tax filing", icon: FileText, roles: PAYROLL_ROLES },
  { to: "/app/documents", label: "Documents", icon: FolderOpen, roles: HR_ROLES },
  { to: "/app/announcements", label: "Announcements", icon: Megaphone, roles: HR_ROLES },
  { to: "/app/ai-assistant", label: "AI Assistant", icon: Sparkles, roles: ANY_ADMIN },
  { to: "/app/integrations", label: "Integrations", icon: Plug, roles: ADMIN_ROLES },
  { to: "/app/users", label: "Users & roles", icon: Users, roles: ADMIN_ROLES },
  { to: "/app/audit", label: "Audit log", icon: ShieldCheck, roles: ADMIN_ROLES },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, roles: ADMIN_ROLES },
];

export function AppShell() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [checking, setChecking] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState<string>("employee");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("paylo_sidebar_collapsed") === "1";
  });
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("paylo_sidebar_collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/auth" }); return; }
      const uid = data.session.user.id;
      setUserEmail(data.session.user.email ?? "");
      const [{ data: prof }, { data: roles }, { count: ptoCount }, { count: draftRuns }] = await Promise.all([
        supabase.from("profiles").select("company_name").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid).limit(1),
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payroll_runs").select("*", { count: "exact", head: true }).eq("status", "draft"),
      ]);
      setCompanyName(prof?.company_name || "Your company");
      setRole((roles && roles[0]?.role) || "employee");
      setBadges({ "/app/payroll": draftRuns ?? 0 });
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) navigate({ to: "/auth" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-brand shadow-glow font-bold text-primary-foreground">P</div>
          <div className="skeleton h-3 w-32" />
        </div>
      </div>
    );
  }

  const roleLabel = role.replace(/_/g, " ");

  return (
    <div className="min-h-screen text-foreground bg-background">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-brand text-sm font-bold text-primary-foreground">P</div>
          <span className="font-display text-base font-bold tracking-tight text-foreground">{companyName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex">
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 flex transform flex-col border-r border-border bg-sidebar transition-all duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0",
          collapsed ? "w-16" : "w-64",
          open ? "translate-x-0 w-64" : "-translate-x-full",
        )}>
          <div className={cn("hidden items-center border-b border-border py-4 md:flex", collapsed ? "px-2 justify-center" : "gap-3 px-4")}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-brand font-bold text-primary-foreground">P</div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-display text-base font-bold leading-tight text-slate-900">Paylo</span>
                <span className="truncate text-xs leading-tight text-slate-500">{companyName}</span>
              </div>
            )}
          </div>

          <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {nav.map((n) => {
              const active = path === n.to || (n.to !== "/app/dashboard" && path.startsWith(n.to));
              const badge = badges[n.to] ?? 0;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  title={collapsed ? n.label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    collapsed && "justify-center px-2",
                    active
                      ? "bg-surface text-slate-900"
                      : "text-slate-600 hover:bg-surface hover:text-slate-900",
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
                  <n.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-slate-900" : "text-slate-500 group-hover:text-slate-700")} />
                  {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
                  {badge > 0 && (
                    <span className={cn(
                      "grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground",
                      collapsed && "absolute -right-1 -top-1",
                    )}>
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
            <div className="my-3 border-t border-border" />
            <Link
              to="/app/companies"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-surface hover:text-slate-900",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? "Companies" : undefined}
            >
              <Building2 className="h-[18px] w-[18px] shrink-0 text-slate-500" />
              {!collapsed && <span>Companies</span>}
            </Link>
            <Link
              to="/app/audit"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-surface hover:text-slate-900",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? "Audit log" : undefined}
            >
              <FileText className="h-[18px] w-[18px] shrink-0 text-slate-500" />
              {!collapsed && <span>Audit log</span>}
            </Link>
          </nav>

          <div className="border-t border-border p-3 space-y-2">
            {!collapsed && (
              <div className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full gradient-brand text-xs font-bold text-primary-foreground">
                  {(userEmail || "U").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-slate-900">{userEmail.split("@")[0] || "User"}</div>
                  <div className="truncate text-[11px] capitalize text-slate-500">{roleLabel}</div>
                </div>
              </div>
            )}
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn("gap-2 text-slate-700 hover:bg-surface", collapsed ? "w-full justify-center px-2" : "flex-1 justify-start")}
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" /> {!collapsed && "Sign out"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={collapsed ? "Expand" : "Collapse"}
                className="hidden md:grid h-8 w-8 shrink-0 text-slate-500"
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={() => setOpen(false)} />}

        <main className="flex-1 min-w-0">
          <TopBar companyName={companyName} userEmail={userEmail} />
          <div key={path} className="page-in mx-auto max-w-7xl px-4 py-6 sm:p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
