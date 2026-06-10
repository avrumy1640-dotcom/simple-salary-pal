import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Bell, CalendarDays, Wallet, HeartHandshake, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Banner {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link_path: string | null;
}

const iconFor = (kind: string) => {
  if (kind.includes("pto") || kind.includes("schedule") || kind.includes("shift")) return CalendarDays;
  if (kind.includes("pay") || kind.includes("payroll")) return Wallet;
  if (kind.includes("benefit")) return HeartHandshake;
  return Bell;
};

const HIDE_AFTER_MS = 4500;

export function EmployeeNotificationBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid || cancelled) return;

      channel = supabase
        .channel(`employee-notifs-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload) => {
            const n = payload.new as Banner;
            setBanner({ id: n.id, kind: n.kind, title: n.title, body: n.body ?? null, link_path: n.link_path ?? null });
            setVisible(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (!banner) return null;
  const Icon = iconFor(banner.kind);

  function open() {
    setVisible(false);
    if (banner?.link_path) {
      navigate({ to: banner.link_path as never });
    } else {
      navigate({ to: "/employee/notifications" });
    }
  }
  function dismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setVisible(false);
  }

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(env(safe-area-inset-top),0.5rem)] transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0",
      )}
    >
      <button
        onClick={open}
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 text-left shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-slate-900">{banner.title}</span>
          {banner.body && (
            <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-slate-600">{banner.body}</span>
          )}
        </span>
        <span
          onClick={dismiss}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-surface hover:text-slate-700"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
