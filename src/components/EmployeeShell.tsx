import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Home, Wallet, CalendarDays, Clock, HeartHandshake, FolderOpen,
  UserCircle2, LogOut, Menu, X, MapPin, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/employee/home", label: "Home", icon: Home },
  { to: "/employee/paystubs", label: "Pay stubs", icon: Wallet },
  { to: "/employee/pto", label: "Time off", icon: CalendarDays },
  { to: "/employee/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/employee/time", label: "Time clock", icon: Clock },
  { to: "/employee/punch", label: "Punch in/out", icon: MapPin },
  { to: "/employee/notifications", label: "Notifications", icon: Bell },
  { to: "/employee/benefits", label: "Benefits", icon: HeartHandshake },
  { to: "/employee/documents", label: "Documents", icon: FolderOpen },
  { to: "/employee/profile", label: "My profile", icon: UserCircle2 },
];

export function EmployeeShell() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/auth" }); return; }
      const uid = data.session.user.id;
      setEmail(data.session.user.email ?? "");
      const { data: prof } = await supabase.from("profiles").select("company_name").eq("id", uid).maybeSingle();
      setCompanyName(prof?.company_name || "Your workplace");
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
        <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-brand shadow-glow font-bold text-primary-foreground">P</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground bg-background">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-brand text-sm font-bold text-primary-foreground">P</div>
          <span className="font-display text-base font-bold">{companyName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex">
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-border bg-sidebar transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}>
          <div className="hidden items-center gap-3 border-b border-border px-4 py-4 md:flex">
            <div className="grid h-10 w-10 place-items-center rounded-xl gradient-brand font-bold text-primary-foreground">P</div>
            <div className="flex flex-col min-w-0">
              <span className="font-display text-base font-bold text-slate-900">My workplace</span>
              <span className="truncate text-xs text-slate-500">{companyName}</span>
            </div>
          </div>

          <nav className="mt-3 flex-1 space-y-0.5 px-2">
            {nav.map((n) => {
              const active = path === n.to || path.startsWith(n.to + "/");
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    active ? "bg-surface text-slate-900" : "text-slate-600 hover:bg-surface hover:text-slate-900",
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
                  <n.icon className={cn("h-[18px] w-[18px]", active ? "text-slate-900" : "text-slate-500")} />
                  <span className="flex-1 truncate">{n.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border p-3 space-y-2">
            <div className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full gradient-brand text-xs font-bold text-primary-foreground">
                {(email || "U").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-slate-900">{email.split("@")[0] || "Employee"}</div>
                <div className="truncate text-[11px] text-slate-500">Employee</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-slate-700" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={() => setOpen(false)} />}

        <main className="flex-1 min-w-0">
          <div key={path} className="page-in mx-auto max-w-5xl px-4 py-6 sm:p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
