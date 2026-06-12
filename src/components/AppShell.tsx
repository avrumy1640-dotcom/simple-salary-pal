import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Clock, Wallet, FileText, LogOut, Menu, X,
  CalendarDays, Settings as SettingsIcon, UserPlus, Target, ShieldCheck,
  BarChart3, FolderOpen, ChevronLeft, ChevronRight, HelpCircle,
  HeartHandshake, LineChart, Landmark, ListChecks, Bell, ArrowLeftRight, MapPin, Receipt, MessageSquare, Inbox, Building2, ClipboardCheck, UsersRound, UserMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { ADMIN_ROLES, PAYROLL_ROLES, HR_ROLES, MANAGER_ROLES, ANY_ADMIN, isAdmin, isManager, type AppRole } from "@/lib/roles";

type NavItem = { to: string; label: string; icon: typeof Users; roles: readonly AppRole[] };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ANY_ADMIN },
      { to: "/app/approvals", label: "Inbox", icon: Inbox, roles: [...MANAGER_ROLES] },
      { to: "/app/employees", label: "Employees", icon: Users, roles: HR_ROLES },
      { to: "/app/payroll", label: "Payroll", icon: Wallet, roles: PAYROLL_ROLES },
      { to: "/app/pay-on-demand", label: "Pay On-Demand", icon: Wallet, roles: PAYROLL_ROLES },
      { to: "/app/expense-requests", label: "Expenses", icon: Receipt, roles: [...MANAGER_ROLES] },
      { to: "/app/time", label: "Time Tracking", icon: Clock, roles: [...MANAGER_ROLES] },
      { to: "/app/attendance", label: "Live Attendance", icon: Clock, roles: [...MANAGER_ROLES] },
      { to: "/app/live-map", label: "Live Map", icon: MapPin, roles: [...MANAGER_ROLES] },
      { to: "/app/locations", label: "Work Locations", icon: MapPin, roles: [...MANAGER_ROLES] },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/app/departments", label: "Departments", icon: Building2, roles: HR_ROLES },
      { to: "/app/teams", label: "Teams", icon: UsersRound, roles: [...MANAGER_ROLES] },
      { to: "/app/scheduling", label: "Scheduling", icon: CalendarDays, roles: [...MANAGER_ROLES] },
      { to: "/app/shift-swaps", label: "Shift Swaps", icon: ArrowLeftRight, roles: [...MANAGER_ROLES] },
      { to: "/app/recruiting", label: "Recruiting", icon: UserPlus, roles: HR_ROLES },
      { to: "/app/onboarding", label: "Onboarding", icon: ListChecks, roles: HR_ROLES },
      { to: "/app/offboarding", label: "Offboarding", icon: UserMinus, roles: HR_ROLES },
      { to: "/app/benefits", label: "Benefits", icon: HeartHandshake, roles: HR_ROLES },
      { to: "/app/performance", label: "Performance", icon: Target, roles: [...HR_ROLES, "manager", "supervisor"] },
    ],
  },
  {
    label: "Company",
    items: [
      { to: "/app/compliance", label: "Compliance", icon: ShieldCheck, roles: HR_ROLES },
      { to: "/app/form-review", label: "Form Review", icon: ClipboardCheck, roles: HR_ROLES },
      { to: "/app/policies", label: "Policies", icon: FolderOpen, roles: HR_ROLES },
      { to: "/app/tax-filing", label: "Tax Filing", icon: Landmark, roles: PAYROLL_ROLES },
      { to: "/app/tax-tables", label: "Tax Tables", icon: Landmark, roles: PAYROLL_ROLES },
      { to: "/app/tax-year", label: "Year-end W-2 / 1099", icon: Landmark, roles: PAYROLL_ROLES },
      { to: "/app/tax-reconciliation", label: "Tax Reconciliation", icon: Landmark, roles: PAYROLL_ROLES },
      { to: "/app/reports", label: "Reports", icon: BarChart3, roles: ANY_ADMIN },
      { to: "/app/analytics", label: "Analytics", icon: LineChart, roles: ANY_ADMIN },
      { to: "/app/documents", label: "Documents", icon: FolderOpen, roles: HR_ROLES },
    ],
  },
];

const ALL_NAV_LABELS: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/employees": "Employees",
  "/app/payroll": "Payroll",
  "/app/time": "Time Tracking",
  "/app/tracking": "Location & Field",
  "/app/scheduling": "Scheduling",
  "/app/recruiting": "Recruiting",
  "/app/onboarding": "Onboarding",
  "/app/offboarding": "Offboarding",
  "/app/onboarding-templates": "Onboarding Templates",
  "/app/teams": "Teams",
  "/app/benefits": "Benefits",
  "/app/performance": "Performance",
  "/app/compliance": "Compliance",
  "/app/form-review": "Form Review",
  "/app/tax-filing": "Tax Filing",
  "/app/tax-tables": "Tax Tables",
  "/app/tax-year": "Year-end W-2 / 1099",
  "/app/tax-reconciliation": "Tax Reconciliation",
  "/app/reports": "Reports",
  "/app/analytics": "Analytics",
  "/app/documents": "Documents",
  "/app/announcements": "Announcements",
  "/app/notifications": "Notifications",
  "/app/ai-assistant": "AI Assistant",
  "/app/users": "Users & Roles",
  "/app/audit": "Audit Log",
  "/app/settings": "Settings",
  "/app/companies": "Companies",
  "/app/pay-history": "Pay History",
  "/app/paystubs": "Pay Stubs",
  "/app/pto": "Time Off",
  "/app/locations": "Work Locations",
  "/app/auth-debug": "Auth Debug",
  "/app/pay-on-demand": "Pay On-Demand",
  "/app/shift-swaps": "Shift Swaps",
  "/app/live-map": "Live Map",
  "/app/attendance": "Live Attendance",
  "/app/expense-requests": "Expenses",
  "/app/requests": "Requests",
  "/app/approvals": "Approvals",
  "/app/departments": "Departments",
  "/app/policies": "Policies",
};

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
      const [{ data: prof }, { data: roles }, { count: draftRuns }, ptoP, expP, swapP] = await Promise.all([
        supabase.from("profiles").select("company_name").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid).limit(1),
        supabase.from("payroll_runs").select("*", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("expense_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("shift_swap_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      setCompanyName(prof?.company_name || "Your company");
      const r = (roles && roles[0]?.role) || "employee";
      setRole(r);
      if (!isAdmin(r) && !isManager(r)) {
        navigate({ to: "/employee/home", replace: true });
        return;
      }
      const pendingTotal = (ptoP.count ?? 0) + (expP.count ?? 0) + (swapP.count ?? 0);
      setBadges({ "/app/payroll": draftRuns ?? 0, "/app/approvals": pendingTotal });
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) navigate({ to: "/auth" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary font-bold">P</div>
          <div className="skeleton h-3 w-32" />
        </div>
      </div>
    );
  }

  const roleLabel = role.replace(/_/g, " ");
  const initials = (companyName || "C").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const userInitials = (userEmail || "U").slice(0, 2).toUpperCase();
  const currentPageTitle = ALL_NAV_LABELS[path] ||
    Object.entries(ALL_NAV_LABELS).find(([k]) => k !== "/app/dashboard" && path.startsWith(k))?.[1] ||
    "Dashboard";

  const renderNavItem = (n: NavItem) => {
    const active = path === n.to || (n.to !== "/app/dashboard" && path.startsWith(n.to));
    const badge = badges[n.to] ?? 0;
    return (
      <Link
        key={n.to}
        to={n.to}
        onClick={() => setOpen(false)}
        title={collapsed ? n.label : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-all",
          collapsed && "justify-center px-2",
          active
            ? "bg-primary/10 text-foreground"
            : "text-slate-600 hover:bg-slate-50 hover:text-foreground",
        )}
      >
        {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
        <n.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-slate-400 group-hover:text-slate-600")} />
        {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
        {badge > 0 && !collapsed && (
          <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  // Mobile bottom tab bar — 4 primary + More
  const mobileTabs = [
    { to: "/app/dashboard", label: "Home", icon: LayoutDashboard },
    { to: "/app/employees", label: "People", icon: Users },
    { to: "/app/payroll", label: "Payroll", icon: Wallet },
    { to: "/app/time", label: "Time", icon: Clock },
  ];
  const isTabActive = (to: string) => path === to || (to !== "/app/dashboard" && path.startsWith(to));

  return (
    <div className="min-h-screen text-foreground bg-surface">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-border bg-white px-4 pt-[max(env(safe-area-inset-top),0.25rem)] pb-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid h-10 w-10 -ml-1 place-items-center rounded-xl text-slate-600 hover:bg-surface active:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary text-[11px] font-bold">{initials}</div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-tight text-foreground">{currentPageTitle}</div>
            <div className="truncate text-[11px] leading-tight text-slate-500">{companyName}</div>
          </div>
        </div>
        <Link
          to="/app/notifications"
          aria-label="Notifications"
          className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-surface active:bg-slate-100"
        >
          <Bell className="h-5 w-5" />
        </Link>
      </div>

      <div className="flex">
        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 flex transform flex-col border-r border-border bg-white transition-all duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0 md:z-40",
          collapsed ? "w-[72px]" : "w-72 md:w-64",
          open ? "translate-x-0 w-[86vw] max-w-[320px]" : "-translate-x-full",
        )}>
          {/* Logo header */}
          <div className={cn(
            "flex items-center border-b border-border py-4 pt-[max(env(safe-area-inset-top),1rem)]",
            collapsed ? "px-3 justify-center" : "gap-3 px-5",
          )}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary text-sm font-bold ring-1 ring-primary/20">
              {initials}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[15px] font-bold leading-tight text-foreground truncate">{companyName}</span>
                <span className="text-[11px] uppercase tracking-wider leading-tight text-slate-400">Admin</span>
              </div>
            )}
            <button
              onClick={() => setOpen(false)}
              className="md:hidden grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-surface"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Grouped nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            {navGroups.map((group) => {
              const items = group.items.filter((n) => (n.roles as readonly string[]).includes(role));
              if (items.length === 0) return null;
              return (
                <div key={group.label}>
                  {!collapsed && (
                    <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {group.label}
                    </div>
                  )}
                  {collapsed && <div className="mx-2 mb-2 border-t border-border" />}
                  <div className="space-y-0.5">{items.map(renderNavItem)}</div>
                </div>
              );
            })}
          </nav>

          {/* Bottom pinned */}
          <div className="border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] space-y-1">
            {(ADMIN_ROLES as readonly string[]).includes(role) && (
              <Link
                to="/app/settings"
                onClick={() => setOpen(false)}
                title={collapsed ? "Settings" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-foreground transition",
                  collapsed && "justify-center px-2",
                  path.startsWith("/app/settings") && "bg-primary/10 text-foreground",
                )}
              >
                <SettingsIcon className="h-[18px] w-[18px] shrink-0 text-slate-400" />
                {!collapsed && <span>Settings</span>}
              </Link>
            )}
            <Link
              to="/app/getting-started"
              onClick={() => setOpen(false)}
              title={collapsed ? "Help Center" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-foreground transition",
                collapsed && "justify-center px-2",
              )}
            >
              <HelpCircle className="h-[18px] w-[18px] shrink-0 text-slate-400" />
              {!collapsed && <span>Help Center</span>}
            </Link>
            <Link
              to="/help/access-denied"
              onClick={() => setOpen(false)}
              title={collapsed ? "Access help" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-foreground transition",
                collapsed && "justify-center px-2",
              )}
            >
              <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-slate-400" />
              {!collapsed && <span>Access help</span>}
            </Link>

            {!collapsed && (
              <div className="mt-2 flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-foreground">{userEmail.split("@")[0] || "User"}</div>
                  <div className="truncate text-[11px] capitalize text-slate-500">{roleLabel}</div>
                </div>
                <button onClick={signOut} title="Sign out" className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-destructive transition">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
            {collapsed && (
              <button
                onClick={signOut}
                title="Sign out"
                className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 hover:text-destructive transition"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            )}

            <button
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand" : "Collapse"}
              className="hidden md:flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50 hover:text-foreground transition"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : (<><ChevronLeft className="h-4 w-4" /> Collapse</>)}
            </button>
          </div>
        </aside>

        {open && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden animate-in fade-in"
            onClick={() => setOpen(false)}
          />
        )}

        <main className="flex-1 min-w-0 max-w-full overflow-x-hidden">
          <TopBar companyName={companyName} userEmail={userEmail} pageTitle={currentPageTitle} />
          <div key={path} className="admin-main page-in mx-auto max-w-[1400px] px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:px-4 sm:py-6 md:p-8 md:pb-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 pb-[max(env(safe-area-inset-bottom),0px)] md:hidden">
        <div className="grid grid-cols-5">
          {mobileTabs.map((t) => {
            const active = isTabActive(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                  active ? "text-primary" : "text-slate-500",
                )}
              >
                <t.icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                <span>{t.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
              open ? "text-primary" : "text-slate-500",
            )}
          >
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
