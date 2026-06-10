import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Home, Wallet, CalendarDays, User, HeartHandshake, LogOut, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/employee/home", label: "Home", icon: Home },
  { to: "/employee/paystubs", label: "Pay Stubs", icon: Wallet },
  { to: "/employee/pto", label: "Time Off", icon: CalendarDays },
  { to: "/employee/profile", label: "My Info", icon: User },
  { to: "/employee/benefits", label: "Benefits", icon: HeartHandshake },
];

export function EmployeeShell() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/auth" }); return; }
      const uid = data.session.user.id;
      const userEmail = data.session.user.email ?? "";
      setEmail(userEmail);
      const [{ data: prof }, { data: emp }] = await Promise.all([
        supabase.from("profiles").select("company_name").eq("id", uid).maybeSingle(),
        userEmail
          ? supabase.from("employees").select("full_name").ilike("email", userEmail).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setCompanyName(prof?.company_name || "Your workplace");
      setFullName(emp?.full_name || userEmail.split("@")[0] || "Employee");
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) navigate({ to: "/auth" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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

  const first = fullName.split(" ")[0];
  const initials = fullName.split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";
  const isActive = (to: string) => path === to || path.startsWith(to + "/");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar — desktop & mobile */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/employee/home" className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-brand text-sm font-bold text-primary-foreground">P</div>
            <div className="min-w-0">
              <div className="truncate font-display text-[15px] font-bold leading-tight text-slate-900">{companyName}</div>
              <div className="hidden text-[11px] uppercase tracking-wider text-slate-400 sm:block">Employee Portal</div>
            </div>
          </Link>

          {/* Desktop tabs */}
          <nav className="hidden md:flex items-center gap-1">
            {nav.map(n => {
              const active = isActive(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "relative px-3 py-2 text-sm font-semibold transition-colors",
                    active ? "text-slate-900" : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  {n.label}
                  {active && <span className="absolute inset-x-3 -bottom-[17px] h-[3px] rounded-full bg-primary" />}
                </Link>
              );
            })}
          </nav>

          {/* Avatar dropdown */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2.5 py-1 transition hover:bg-surface"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full gradient-brand text-xs font-bold text-primary-foreground">
                {initials}
              </span>
              <span className="hidden sm:inline text-sm font-semibold text-slate-900 max-w-[140px] truncate">{first}</span>
              <ChevronDown className="hidden sm:block h-4 w-4 text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                <div className="border-b border-border px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900 truncate">{fullName}</div>
                  <div className="text-xs text-slate-500 truncate">{email}</div>
                </div>
                <Link
                  to="/employee/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-surface"
                >
                  <User className="h-4 w-4" /> Profile
                </Link>
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-surface"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main key={path} className="page-in mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pb-8 md:pt-8">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {nav.map(n => {
            const active = isActive(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-slate-500",
                )}
              >
                <n.icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
