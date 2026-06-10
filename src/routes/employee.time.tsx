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

interface Punch { id: string; punched_at: string; punch_type: string; }

function Page() {
  const { employee, loading } = useMyEmployee();
  const [recent, setRecent] = useState<Punch[]>([]);
  const lastPunch = recent[0];
  const clockedIn = lastPunch?.punch_type === "in";

  async function load() {
    if (!employee) return;
    const { data } = await supabase
      .from("time_clock_punches")
      .select("id, punched_at, punch_type")
      .eq("employee_id", employee.id)
      .order("punched_at", { ascending: false })
      .limit(20);
    setRecent(((data ?? []) as Punch[]));
  }
  useEffect(() => { load(); }, [employee?.id]);

  async function punch(type: "in" | "out") {
    if (!employee) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("time_clock_punches").insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      user_id: user.id,
      punch_type: type,
      punched_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success(type === "in" ? "Clocked in" : "Clocked out");
    load();
  }

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Time clock</h1></div>

      <div className="rounded-2xl border bg-card p-6">
        {clockedIn ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">You're clocked in since</div>
              <div className="text-2xl font-semibold">{new Date(lastPunch.punched_at).toLocaleString()}</div>
            </div>
            <Button onClick={() => punch("out")} className="gap-2"><Square className="h-4 w-4" /> Clock out</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Ready to start?</div>
              <div className="text-2xl font-semibold">You're clocked out</div>
            </div>
            <Button onClick={() => punch("in")} className="gap-2"><Play className="h-4 w-4" /> Clock in</Button>
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
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  p.punch_type === "in" ? "bg-[oklch(0.94_0.05_155)] text-[oklch(0.4_0.16_155)]" : "bg-muted text-muted-foreground"
                }`}>{p.punch_type}</span>
                <div className="flex-1">{new Date(p.punched_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
