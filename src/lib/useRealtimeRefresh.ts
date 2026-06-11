import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to Postgres CDC events on one or more tables and run `onChange`
 * (debounced) whenever any of them emit. Use in admin/employee pages so
 * lists, KPIs, and approvals stay live without manual refresh.
 *
 * Pass a stable `companyId` filter when applicable to scope subscriptions.
 */
export function useRealtimeRefresh(
  tables: string[],
  onChange: () => void,
  opts?: { companyId?: string | null; debounceMs?: number; enabled?: boolean }
) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const { companyId, debounceMs = 300, enabled = true } = opts ?? {};

  useEffect(() => {
    if (!enabled) return;
    if (!tables.length) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cbRef.current?.(), debounceMs);
    };

    const channelName = `rt:${tables.join(",")}:${companyId ?? "all"}`;
    const channel = supabase.channel(channelName);
    for (const table of tables) {
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table,
          ...(companyId ? { filter: `company_id=eq.${companyId}` } : {}),
        },
        fire
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tables.join("|"), companyId, debounceMs, enabled]);
}
