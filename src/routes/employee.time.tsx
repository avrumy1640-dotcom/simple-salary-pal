import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Clock, Play, Square } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/time")({
  head: () => ({ meta: [{ title: "Time clock — Paylo" }] }),
  component: Page,
});

interface Punch { id: string; punch_in: string; punch_out: string | null; }

function Page() {
  const { employee, loading } = useMyEmployee();
  const [open, setOpen] = useState<Punch | null>(null);
  const [recent, setRecent] = useState<Punch[]>([]);

  async function load() {
    if (!employee) return;
    const { data } = await supabase
      .from("time_clock_punches")
      .select("id, punch_in, punch_out")
      .eq("employee_id", employee.id)
      .order("punch_in", { ascending: false })
      .limit(20);
    const list = (data ?? []) as Punch[];
    setRecent(list);
    setOpen(list.find((p) => !p.punch_out) ?? null);
  }
  useEffect(() => { load(); }, [employee?.id]);

  async function clockIn() {
    if (!employee) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("time_clock_punches").insert({
      employee_id: employee.id, owner_id: user.id, punch_in: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Clocked in"); load();
  }
  async function clockOut() {
    if (!open) return;
    const { error } = await supabase.from("time_clock_punches")
      .update({ punch_out: new Date().toISOString() })
      .eq("id", open.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Clocked out"); load();
  }

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Time clock</h1></div>

      <div className="rounded-2xl border bg-card p-6">
        {open ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">You're clocked in since</div>
              <div className="text-2xl font-semibold">{new Date(open.punch_in).toLocaleString()}</div>
            </div>
            <Button onClick={clockOut} className="gap-2"><Square className="h-4 w-4" /> Clock out</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Ready to start your shift?</div>
              <div className="text-2xl font-semibold">You're clocked out</div>
            </div>
            <Button onClick={clockIn} className="gap-2"><Play className="h-4 w-4" /> Clock in</Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-3 text-sm font-medium">
          <Clock className="h-4 w-4" /> Recent punches
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No punches yet.</div>
        ) : (
          <ul className="divide-y">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{new Date(p.punch_in).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.punch_out ? `→ ${new Date(p.punch_out).toLocaleString()}` : "in progress"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
