import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Clock, Wallet, FileText, LogOut, Menu, X,
  HeartHandshake, CalendarDays, Settings as SettingsIcon, FileBadge, Sparkles,
  Briefcase, Receipt, Landmark, FolderOpen, ClipboardCheck, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Run your payroll",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/payroll", label: "Run payroll", icon: Wallet },
      { to: "/app/time", label: "Time & attendance", icon: Clock },
      { to: "/app/tracking", label: "Location tracking", icon: MapPin },
      { to: "/app/paystubs", label: "Pay stubs & ACH", icon: Receipt },
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/auth" }); return; }
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
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between border-b border-white/10 surface-glass px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg gradient-brand text-primary-foreground text-sm font-bold ring-glow">P</div>
          <span className="text-sm font-semibold tracking-tight">{companyName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex">
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 transform surface-glass border-r border-white/10 transition-transform md:relative md:translate-x-0 flex flex-col",
          open ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="hidden items-center gap-3 border-b border-white/10 px-5 py-5 md:flex">
            <div className="grid h-10 w-10 place-items-center rounded-xl gradient-brand text-primary-foreground font-bold ring-glow">P</div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold leading-tight tracking-tight text-gradient">PAYLO</span>
              <span className="text-[11px] text-muted-foreground leading-tight truncate uppercase tracking-widest">{companyName}</span>
            </div>
          </div>

          <Link
            to="/app/getting-started"
            onClick={() => setOpen(false)}
            className={cn(
              "mx-3 mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
              path === "/app/getting-started"
                ? "gradient-brand text-primary-foreground ring-glow"
                : "border border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            )}
          >
            <Sparkles className="h-4 w-4" /> Getting started
          </Link>

          <nav className="flex-1 overflow-y-auto p-3 space-y-6 mt-3">
            {navGroups.map((g) => (
              <div key={g.label}>
                <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{g.label}</div>
                <div className="space-y-0.5">
                  {g.items.map((n) => {
                    const active = path === n.to || (n.to !== "/app/dashboard" && path.startsWith(n.to));
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                          active
                            ? "bg-white/10 text-foreground font-semibold shadow-soft"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                        )}
                      >
                        {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r gradient-brand" />}
                        <n.icon className={cn("h-4 w-4 transition-colors", active ? "text-primary" : "")} />
                        {n.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-white/10 p-3">
            <Button variant="ghost" className="w-full justify-start gap-2 rounded-lg hover:bg-white/5" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-6xl p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
