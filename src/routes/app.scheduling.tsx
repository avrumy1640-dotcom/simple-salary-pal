import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/scheduling")({
  head: () => ({ meta: [{ title: "Scheduling — Paylo" }] }),
  component: SchedulingPage,
});

function SchedulingPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("shifts").select("*, employees(full_name)").order("starts_at", { ascending: true }).limit(50)
      .then(({ data }) => setShifts(data ?? []));
  }, []);

  const week: { date: Date; key: string }[] = [];
  const start = new Date();
  start.setDate(start.getDate() - start.getDay());
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    week.push({ date: d, key: d.toISOString().slice(0, 10) });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduling"
        description="Build, publish, and manage weekly shift schedules."
        actions={
          <>
            <Button variant="outline" size="sm">Publish schedule</Button>
            <Button size="sm" className="gradient-brand text-primary-foreground"><Plus className="mr-1 h-4 w-4" />New shift</Button>
          </>
        }
      />

      <div className="rounded-xl border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border">
          {week.map((d) => (
            <div key={d.key} className="border-r border-border p-3 last:border-r-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {d.date.toLocaleDateString("en-US", { weekday: "short" })}
              </div>
              <div className="font-display text-lg font-bold text-slate-900">{d.date.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="grid min-h-[320px] grid-cols-7">
          {week.map((d) => {
            const day = shifts.filter((s) => s.starts_at?.slice(0, 10) === d.key);
            return (
              <div key={d.key} className="space-y-2 border-r border-border p-2 last:border-r-0">
                {day.length === 0 ? (
                  <div className="grid h-24 place-items-center text-[11px] text-slate-300">—</div>
                ) : day.map((s) => (
                  <div key={s.id} className="rounded-md border-l-2 border-primary bg-primary/5 px-2 py-1.5 text-xs">
                    <div className="font-semibold text-slate-900">{s.employees?.full_name ?? "Unassigned"}</div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(s.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {shifts.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No shifts scheduled"
          description="Create your first shift to start building the weekly schedule."
          action={<Button size="sm" className="gradient-brand text-primary-foreground">Create shift</Button>}
        />
      )}
    </div>
  );
}
