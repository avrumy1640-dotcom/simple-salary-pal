import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, Sparkles,
  LayoutDashboard, Wallet, Users, Clock, Receipt, FileText, History as HistoryIcon,
  Briefcase, ClipboardCheck, FolderOpen, CalendarDays, HeartHandshake, FileBadge,
  Landmark, MapPin,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";

const searchTargets = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/payroll", label: "Run payroll", icon: Wallet },
  { to: "/app/pay-history", label: "Pay history", icon: HistoryIcon },
  { to: "/app/paystubs", label: "Pay stubs & ACH", icon: Receipt },
  { to: "/app/time", label: "Time & attendance", icon: Clock },
  { to: "/app/tracking", label: "Location tracking", icon: MapPin },
  { to: "/app/employees", label: "Employees", icon: Users },
  { to: "/app/contractors", label: "Contractors", icon: Briefcase },
  { to: "/app/onboarding", label: "Onboarding", icon: ClipboardCheck },
  { to: "/app/documents", label: "HR documents", icon: FolderOpen },
  { to: "/app/pto", label: "Time off", icon: CalendarDays },
  { to: "/app/benefits", label: "Benefits", icon: HeartHandshake },
  { to: "/app/taxes", label: "Taxes & forms", icon: FileBadge },
  { to: "/app/form-1099", label: "1099-NEC preview", icon: FileBadge },
  { to: "/app/tax-filing", label: "Tax filing", icon: Landmark },
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/settings", label: "Company settings", icon: SettingsIcon },
  { to: "/app/getting-started", label: "Getting started", icon: Sparkles },
] as const;

interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

export function TopBar({ companyName, userEmail }: { companyName: string; userEmail: string }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // ⌘K to open search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Build a quick activity-based notification feed
  useEffect(() => {
    (async () => {
      const out: Notification[] = [];
      const { data: ptos } = await supabase
        .from("pto_entries")
        .select("id, hours, type, status, created_at, employees(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(3);
      (ptos ?? []).forEach((p: any) => {
        out.push({
          id: p.id,
          title: "Time-off request",
          body: `${p.employees?.full_name ?? "An employee"} requested ${p.hours}h of ${p.type}`,
          time: new Date(p.created_at).toLocaleDateString(),
          unread: true,
        });
      });
      const { data: runs } = await supabase
        .from("payroll_runs")
        .select("id, pay_date, status, net_total")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(2);
      (runs ?? []).forEach((r: any) => {
        out.push({
          id: r.id,
          title: "Payroll in draft",
          body: `A run for ${new Date(r.pay_date).toLocaleDateString()} is waiting for approval`,
          time: new Date(r.pay_date).toLocaleDateString(),
          unread: true,
        });
      });
      setNotifications(out);
    })();
  }, [path]);

  const unread = notifications.filter((n) => n.unread).length;

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const initials = (userEmail || "U").slice(0, 2).toUpperCase();

  return (
    <>
      <div className="hidden md:flex sticky top-0 z-30 items-center gap-3 border-b border-[#C2F5FF]/60 bg-white/80 backdrop-blur-2xl px-6 py-3">
        <button
          onClick={() => setSearchOpen(true)}
          className="group flex flex-1 max-w-xl items-center gap-2.5 rounded-full border border-[#C2F5FF]/80 bg-white/70 px-4 py-2 text-sm text-[#4A6079] transition hover:border-[#07142A]/30 hover:shadow-soft"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search pages, employees, payrolls…</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="relative grid h-10 w-10 place-items-center rounded-full border border-[#C2F5FF]/80 bg-white/70 text-[#07142A] transition hover:shadow-soft">
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-[#2563EB] px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="border-b px-4 py-3">
                <div className="font-semibold text-sm">Notifications</div>
                <div className="text-xs text-muted-foreground">{unread} unread</div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">You're all caught up 🎉</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="border-b last:border-b-0 px-4 py-3 hover:bg-muted/30">
                      <div className="flex items-start gap-2">
                        {n.unread && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{n.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">{n.time}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full border border-[#C2F5FF]/80 bg-white/70 py-1 pl-1 pr-3 transition hover:shadow-soft">
                <span className="grid h-8 w-8 place-items-center rounded-full gradient-brand text-xs font-bold text-[#07142A]">
                  {initials}
                </span>
                <span className="hidden lg:inline text-sm font-medium text-[#07142A] max-w-[140px] truncate">{companyName}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#4A6079]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-semibold text-sm">{companyName}</div>
                <div className="text-xs font-normal text-muted-foreground truncate">{userEmail}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/settings" className="cursor-pointer">
                  <SettingsIcon className="h-4 w-4 mr-2" /> Company settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/app/getting-started" className="cursor-pointer">
                  <Sparkles className="h-4 w-4 mr-2" /> Getting started
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive cursor-pointer">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Type to navigate anywhere…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {searchTargets.map((t) => (
              <CommandItem
                key={t.to}
                onSelect={() => { setSearchOpen(false); navigate({ to: t.to }); }}
              >
                <t.icon className="h-4 w-4 mr-2" /> {t.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
