import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Home, Wallet, CalendarDays, User, HeartHandshake, LogOut, HelpCircle,
  Receipt, MessageSquare, Sparkles, Menu, X, ChevronLeft, ChevronRight, Bell, ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeNotificationBanner } from "@/components/EmployeeNotificationBanner";

type NavItem = { to: string; label: string; icon: typeof Home };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { to: "/employee/home", label: "Home", icon: Home },
      { to: "/employee/paystubs", label: "Pay Stubs", icon: Wallet },
      { to: "/employee/pto", label: "Time Off", icon: CalendarDays },
    ],
  },
  {
    label: "Requests",
    items: [
      { to: "/employee/expenses", label: "Expenses", icon: Receipt },
      { to: "/employee/requests", label: "Requests", icon: MessageSquare },
      { to: "/employee/help", label: "Assistant", icon: Sparkles },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/employee/profile", label: "My Info", icon: User },
      { to: "/employee/benefits", label: "Benefits", icon: HeartHandshake },
      { to: "/employee/onboarding", label: "Get Started", icon: ClipboardCheck },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/employee/home": "Home",
  "/employee/paystubs": "Pay Stubs",
  "/employee/pto": "Time Off",
  "/employee/expenses": "Expenses",
  "/employee/requests": "Requests",
  "/employee/help": "Assistant",
  "/employee/profile": "My Info",
  "/employee/benefits": "Benefits",
  "/employee/onboarding": "Get Started",
  "/employee/notifications": "Notifications",
  "/employee/documents": "Documents",
  "/employee/punch": "Clock in / out",
  "/employee/schedule": "Schedule",
  "/employee/time": "Time",
  "/employee/pay-on-demand": "Pay On-Demand",
};

export function EmployeeShell() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("paylo_emp_sidebar_collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("paylo_emp_sidebar_collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/auth" }); return; }
      const uid = data.session.user.id;
      const userEmail = data.session.user.email ?? "";
      setEmail(userEmail);
      const [{ data: prof }, { data: emp }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("company_name").eq("id", uid).maybeSingle(),
        userEmail
          ? supabase
              .from("employees")
              .select("full_name, company_id, companies:company_id(legal_name)")
              .ilike("email", userEmail)
              .maybeSingle()
          : Promise.resolve({ data: null as any }),
        supabase.from("user_roles").select("role").eq("user_id", uid).limit(1),
      ]);
      const role = roles?.[0]?.role;
      if (role && role !== "employee") {
        navigate({ to: "/app/dashboard", replace: true });
        return;
      }
      const companyFromEmployee = (emp as any)?.companies?.legal_name as string | undefined;
      setCompanyName(companyFromEmployee || prof?.company_name || "Your workplace");
      setFullName(emp?.full_name || userEmail.split("@")[0] || "Employee");
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
        <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-brand shadow-glow font-bold text-primary-foreground">P</div>
      </div>
    );
  }

  const initials = fullName.split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";
  const companyInitials = (companyName || "C").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const isActive = (to: string) => path === to || path.startsWith(to + "/");
  const currentTitle = PAGE_TITLES[path] ||
    Object.entries(PAGE_TITLES).find(([k]) => path.startsWith(k))?.[1] ||
    "Employee Portal";

  const renderNavItem = (n: NavItem) => {
    const active = isActive(n.to);
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
      </Link>
    );
  };

  // Mobile bottom tabs — 4 primary + More
  const mobileTabs = [
    { to: "/employee/home", label: "Home", icon: Home },
    { to: "/employee/paystubs", label: "Pay", icon: Wallet },
    { to: "/employee/pto", label: "Time Off", icon: CalendarDays },
    { to: "/employee/profile", label: "Me", icon: User },
  ];

  return (
    <div className="min-h-screen text-foreground bg-surface">
      <EmployeeNotificationBanner />

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
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full gradient-brand text-[11px] font-bold text-primary-foreground">{companyInitials}</div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-tight text-foreground">{currentTitle}</div>
            <div className="truncate text-[11px] leading-tight text-slate-500">{companyName}</div>
          </div>
        </div>
        <Link
          to="/employee/notifications"
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
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full gradient-brand text-sm font-bold text-primary-foreground ring-1 ring-primary/20">
              {companyInitials}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[15px] font-bold leading-tight text-foreground truncate">{companyName}</span>
                <span className="text-[11px] uppercase tracking-wider leading-tight text-slate-400">Employee</span>
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
            {navGroups.map((group) => (
              <div key={group.label}>
                {!collapsed && (
                  <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {group.label}
                  </div>
                )}
                {collapsed && <div className="mx-2 mb-2 border-t border-border" />}
                <div className="space-y-0.5">{group.items.map(renderNavItem)}</div>
              </div>
            ))}
          </nav>

          {/* Bottom pinned */}
          <div className="border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] space-y-1">
            <Link
              to="/help/access-denied"
              onClick={() => setOpen(false)}
              title={collapsed ? "Access help" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-slate-600 hover:bg-slate-50 hover:text-foreground transition",
                collapsed && "justify-center px-2",
              )}
            >
              <HelpCircle className="h-[18px] w-[18px] shrink-0 text-slate-400" />
              {!collapsed && <span>Access help</span>}
            </Link>

            {!collapsed && (
              <div className="mt-2 flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-brand text-xs font-bold text-primary-foreground">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-foreground">{fullName}</div>
                  <div className="truncate text-[11px] text-slate-500">{email}</div>
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

        <main className="flex-1 min-w-0">
          <div key={path} className="page-in mx-auto max-w-6xl px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:p-6 md:p-8 md:pb-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 pb-[max(env(safe-area-inset-bottom),0px)] md:hidden">
        <div className="grid grid-cols-5">
          {mobileTabs.map((t) => {
            const active = isActive(t.to);
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
