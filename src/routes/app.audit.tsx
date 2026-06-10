import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/audit")({
  head: () => ({ meta: [{ title: "Audit log — Paylo" }] }),
  component: AuditPage,
});

interface AuditEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  occurred_at: string;
  actor_id: string | null;
  before: any;
  after: any;
}

function AuditPage() {
  const { current, hasRole } = useCompany();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("audit_events")
        .select("*")
        .eq("company_id", current.company_id)
        .order("occurred_at", { ascending: false })
        .limit(200);
      setEvents((data ?? []) as AuditEvent[]);
      setLoading(false);
    })();
  }, [current?.company_id]);

  if (!current) return <div className="p-6 text-sm text-white/60">Loading company…</div>;
  if (!hasRole("owner", "admin", "payroll_admin", "hr_admin")) {
    return <div className="p-6 text-sm text-white/60">You don't have permission to view the audit log.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-white/60">Every approval, lock, processing, and reversal — kept forever for compliance.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card">
        {loading ? (
          <div className="p-6 text-sm text-white/60">Loading…</div>
        ) : events.length === 0 ? (
          <div className="p-6 text-sm text-white/60">No audit events yet.</div>
        ) : (
          <ul className="divide-y divide-white/10">
            {events.map((e) => (
              <li key={e.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium capitalize">{e.action}</span>
                    <span className="text-white/40"> · {e.entity_type}</span>
                    {e.entity_id ? <span className="text-white/40"> · {e.entity_id.slice(0, 8)}</span> : null}
                  </div>
                  <time className="text-xs text-white/40">{new Date(e.occurred_at).toLocaleString()}</time>
                </div>
                {e.after ? (
                  <pre className="mt-1 max-w-full overflow-x-auto rounded bg-white/5 p-2 text-xs text-white/60">{JSON.stringify(e.after, null, 2)}</pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
