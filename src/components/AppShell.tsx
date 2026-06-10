import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Clock, Wallet, FileText, LogOut, Menu, X,
  HeartHandshake, CalendarDays, Settings as SettingsIcon, FileBadge, Sparkles,
  Briefcase, Receipt, Landmark, FolderOpen, ClipboardCheck, MapPin,
  History as HistoryIcon, UserCircle2, ChevronLeft, ChevronRight,
  ShieldCheck, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";

const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Payroll",
    items: [
      { to: "/app/payroll", label: "Run payroll", icon: Wallet },
      { to: "/app/pay-history", label: "Pay history", icon: HistoryIcon },
      { to: "/app/paystubs", label: "Pay stubs & ACH", icon: Receipt },
    ],
  },
  {
    label: "Time",
    items: [
      { to: "/app/time", label: "Time & attendance", icon: Clock },
      { to: "/app/pto", label: "Time off (PTO)", icon: CalendarDays },
      { to: "/app/tracking", label: "Location tracking", icon: MapPin },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/app/employees", label: "Employees (W-2)", icon: Users },
      { to: "/app/contractors", label: "Contractors (1099)", icon: Briefcase },
      { to: "/app/onboarding", label: "Onboarding checklist", icon: ClipboardCheck },
      { to: "/app/self-service", label: "Self-service portal", icon: UserCircle2 },
      { to: "/app/benefits", label: "Benefits & deductions", icon: HeartHandshake },
      { to: "/app/documents", label: "HR documents", icon: FolderOpen },
    ],
  },
  {
    label: "Compliance",
    items: [
      { to: "/app/taxes", label: "Taxes & forms", icon: FileBadge },
      { to: "/app/form-1099", label: "1099-NEC preview", icon: FileBadge },
      { to: "/app/tax-filing", label: "Tax filing", icon: Landmark },
      { to: "/app/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/app/companies", label: "Companies", icon: Building2 },
      { to: "/app/audit", label: "Audit log", icon: ShieldCheck },
      { to: "/app/settings", label: "Company settings", icon: SettingsIcon },
    ],
  },
] as const;

export function AppShell() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [checking, setChecking] = useState(true);
  const [companyName, setCompanyName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
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
      setUserEmail(data.session.user.email ?? "");
      const { data: prof } = await supabase.from("profiles").select("company_name").eq("id", data.session.user.id).maybeSingle();
      setCompanyName(prof?.company_name || "Your company");
      // Attention badges
      const [{ count: ptoCount }, { count: draftRuns }] = await Promise.all([
        supabase.from("pto_entries").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payroll_runs").select("*", { count: "exact", head: true }).eq("status", "draft"),
      ]);
      setBadges({
        "/app/pto": ptoCount ?? 0,
        "/app/payroll": draftRuns ?? 0,
      });
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
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-brand shadow-glow font-bold text-primary-foreground">P</div>
          <div className="skeleton h-3 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur-2xl md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-brand text-sm font-bold text-primary-foreground shadow-glow">P</div>
          <span className="font-display text-base font-bold tracking-tight text-foreground">{companyName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex">
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 flex transform flex-col border-r border-primary/15 bg-sidebar shadow-float backdrop-blur-2xl transition-all duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0",
          collapsed ? "w-20" : "w-72",
          open ? "translate-x-0 w-72" : "-translate-x-full",
        )}>
          <div className={cn("hidden items-center border-b border-primary/15 py-5 md:flex", collapsed ? "px-3 justify-center" : "gap-3 px-5")}>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl gradient-brand font-bold text-primary-foreground shadow-glow">P</div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-display text-lg font-bold leading-tight tracking-tight text-white">Paylo</span>
                <span className="truncate text-xs font-medium leading-tight text-slate-500">{companyName}</span>
              </div>
            )}
          </div>

          <Link
            to="/app/getting-started"
            onClick={() => setOpen(false)}
            className={cn(
              "mx-3 mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300",
              collapsed && "justify-center px-2",
              path === "/app/getting-started"
                ? "gradient-brand text-primary-foreground shadow-glow"
                : "surface-glass text-slate-900 hover:-translate-y-0.5 hover:shadow-glow",
            )}
          >
            <Sparkles className="h-4 w-4 shrink-0" /> {!collapsed && "Getting started"}
          </Link>

          <nav className="mt-4 flex-1 space-y-6 overflow-y-auto px-3 pb-3">
            {navGroups.map((g) => (
              <div key={g.label}>
                {!collapsed && <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{g.label}</div>}
                <div className="space-y-1">
                  {g.items.map((n) => {
                    const active = path === n.to || (n.to !== "/app/dashboard" && path.startsWith(n.to));
                    const badge = badges[n.to] ?? 0;
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        onClick={() => setOpen(false)}
                        title={collapsed ? n.label : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
                          collapsed && "justify-center px-2",
                          active
                            ? "bg-primary/15 text-primary border border-primary/40 shadow-[0_0_20px_-6px_rgba(61,255,255,0.5)]"
                            : "text-slate-600 hover:bg-primary/10 hover:text-slate-900 hover:translate-x-1",
                        )}
                      >
                        {active && <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_8px_rgba(61,255,255,0.8)]" />}
                        <n.icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-primary" : "text-slate-500 group-hover:text-slate-900")} />
                        {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
                        {badge > 0 && (
                          <span className={cn(
                            "grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-primary-foreground shadow-[0_0_10px_rgba(61,255,255,0.6)]",
                            collapsed && "absolute -right-1 -top-1",
                          )}>
                            {badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-primary/15 p-3 space-y-2">
            {/* User profile */}
            {!collapsed && (
              <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-card/40 px-3 py-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-brand text-xs font-bold text-primary-foreground">
                  {(userEmail || "U").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{companyName}</div>
                  <div className="truncate text-[10px] text-slate-500">{userEmail}</div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className={cn("gap-2 rounded-xl font-semibold text-slate-700 hover:bg-primary/10 hover:text-slate-900", collapsed ? "w-full justify-center px-2" : "flex-1 justify-start")}
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" /> {!collapsed && "Sign out"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="hidden md:grid h-9 w-9 shrink-0 rounded-xl text-primary hover:bg-primary/10"
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />}

        <main className="flex-1 min-w-0">
          <TopBar companyName={companyName} userEmail={userEmail} />
          <div key={path} className="page-in mx-auto max-w-7xl px-4 py-5 sm:p-6 md:p-8 lg:p-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
