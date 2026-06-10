import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { Bell, CheckCheck } from "lucide-react";

interface Notif {
  id: string; kind: string; title: string; body: string | null;
  link_path: string | null; created_at: string; read_at: string | null;
}

export const Route = createFileRoute("/employee/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Paylo" }] }),
  component: EmployeeNotifications,
});

function EmployeeNotifications() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    const { data } = await supabase.from("notifications").select("*")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(100);
    setItems((data ?? []) as Notif[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    load();
  }
  async function markAll() {
    const ids = items.filter(i => !i.read_at).map(i => i.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    load();
  }
  const unread = items.filter(i => !i.read_at).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Your inbox of schedule updates and approvals."
        actions={unread > 0 ? (
          <Button size="sm" variant="outline" onClick={markAll}>
            <CheckCheck className="mr-1 h-4 w-4" /> Mark all read
          </Button>
        ) : null}
      />
      <div className="rounded-xl border border-border bg-card">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Bell className="mx-auto mb-2 h-6 w-6 text-slate-400" /> You're all caught up.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${!n.read_at ? "bg-primary/5" : ""}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary" />}
                    <span className="font-semibold text-slate-900">{n.title}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">{n.kind.replace(/_/g, " ")}</Badge>
                  </div>
                  {n.body && <div className="text-sm text-slate-600">{n.body}</div>}
                  <div className="mt-1 text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  {n.link_path && (
                    <Link to={n.link_path as any}><Button size="sm" variant="outline">Open</Button></Link>
                  )}
                  {!n.read_at && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
