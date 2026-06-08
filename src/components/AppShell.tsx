import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, Clock, Wallet, FileText, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/time", label: "Time", icon: Clock },
  { to: "/payroll", label: "Payroll", icon: Wallet },
  { to: "/reports", label: "Reports", icon: FileText },
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
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b bg-sidebar px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground text-sm font-bold">P</div>
          <span className="text-sm font-semibold">{companyName}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-sidebar transition-transform md:relative md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="hidden items-center gap-2 border-b px-5 py-4 md:flex">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">P</div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">Paylo</span>
              <span className="text-xs text-muted-foreground leading-tight truncate max-w-[10rem]">{companyName}</span>
            </div>
          </div>
          <nav className="flex flex-col gap-1 p-3">
            {nav.map((n) => {
              const active = path === n.to || (n.to !== "/dashboard" && path.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute inset-x-0 bottom-0 border-t p-3">
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={signOut}>
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
