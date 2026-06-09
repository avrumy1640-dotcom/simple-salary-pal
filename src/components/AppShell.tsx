import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Clock, Wallet, FileText, LogOut, Menu, X,
  HeartHandshake, CalendarDays, Settings as SettingsIcon, FileBadge, Sparkles,
  Briefcase, Receipt, Landmark, FolderOpen, ClipboardCheck, MapPin,
  History as HistoryIcon, UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";

const navGroups = [
  {
    label: "Run your payroll",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/payroll", label: "Run payroll", icon: Wallet },
      { to: "/app/time", label: "Time & attendance", icon: Clock },
      { to: "/app/tracking", label: "Location tracking", icon: MapPin },
      { to: "/app/paystubs", label: "Pay stubs & ACH", icon: Receipt },
      { to: "/app/pay-history", label: "Pay history", icon: HistoryIcon },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/app/employees", label: "Employees (W-2)", icon: Users },
      { to: "/app/contractors", label: "Contractors (1099)", icon: Briefcase },
      { to: "/app/onboarding", label: "Onboarding checklist", icon: ClipboardCheck },
      { to: "/app/documents", label: "HR documents", icon: FolderOpen },
      { to: "/app/pto", label: "Time off (PTO)", icon: CalendarDays },
      { to: "/app/benefits", label: "Benefits & deductions", icon: HeartHandshake },
    ],
  },
  {
    label: "Compliance",
    items: [
      { to: "/app/taxes", label: "Taxes & forms", icon: FileBadge },
      { to: "/app/form-1099", label: "1099-NEC preview", icon: FileBadge },
      { to: "/app/tax-filing", label: "Tax filing", icon: Landmark },
      { to: "/app/reports", label: "Reports", icon: FileText },
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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/auth" }); return; }
      setUserEmail(data.session.user.email ?? "");
      const { data: prof } = await supabase.from("profiles").select("company_name").eq("id", data.session.user.id).maybeSingle();
      setCompanyName(prof?.company_name || "Your company");
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
          <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-brand shadow-glow font-bold text-white">P</div>
          <div className="skeleton h-3 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-[#C2F5FF]/60 bg-white/80 px-4 py-3 backdrop-blur-2xl md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-brand text-sm font-bold text-[#07142A] shadow-glow">P</div>
          <span className="font-display text-base font-bold tracking-tight">{companyName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex">
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 transform flex-col border-r border-[#C2F5FF]/60 bg-white/85 shadow-float backdrop-blur-2xl transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="hidden items-center gap-3 border-b border-[#C2F5FF]/50 px-5 py-5 md:flex">
            <div className="grid h-11 w-11 place-items-center rounded-2xl gradient-brand font-bold text-[#07142A] shadow-glow">P</div>
            <div className="flex flex-col min-w-0">
              <span className="font-display text-lg font-bold leading-tight tracking-tight text-[#07142A]">Paylo</span>
              <span className="truncate text-xs font-medium leading-tight text-[#4A6079]">{companyName}</span>
            </div>
          </div>

          <Link
            to="/app/getting-started"
            onClick={() => setOpen(false)}
            className={cn(
              "mx-3 mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300",
              path === "/app/getting-started"
                ? "gradient-brand text-[#07142A] shadow-glow"
                : "surface-glass text-[#07142A] hover:-translate-y-0.5 hover:shadow-glow"
            )}
          >
            <Sparkles className="h-4 w-4" /> Getting started
          </Link>

          <nav className="mt-4 flex-1 space-y-6 overflow-y-auto px-3 pb-3">
            {navGroups.map((g) => (
              <div key={g.label}>
                <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#4A6079]">{g.label}</div>
                <div className="space-y-1">
                  {g.items.map((n) => {
                    const active = path === n.to || (n.to !== "/app/dashboard" && path.startsWith(n.to));
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300",
                          active
                            ? "bg-[#C2F5FF] text-[#07142A] shadow-soft translate-x-1"
                            : "text-[#4A6079] hover:bg-[#ECFAFF] hover:text-[#07142A] hover:translate-x-1"
                        )}
                      >
                        {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[#07142A]" />}
                        <n.icon className={cn("h-4 w-4 transition-colors", active ? "text-[#07142A]" : "text-[#4A6079] group-hover:text-[#07142A]")} />
                        {n.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-[#C2F5FF]/50 p-3">
            <Button variant="ghost" className="w-full justify-start gap-2 rounded-xl font-semibold text-[#07142A] hover:bg-[#ECFAFF]" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-[#07142A]/40 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />}

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
