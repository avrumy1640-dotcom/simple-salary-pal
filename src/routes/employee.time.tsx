import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/time")({
  head: () => ({ meta: [{ title: "Time clock — Paylo" }] }),
  component: Page,
});

interface Punch { id: string; punched_at: string; punch_type: string; }

function fmtElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

function Page() {
  const { employee, loading } = useMyEmployee();
  const [recent, setRecent] = useState<Punch[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const lastPunch = recent[0];
  const clockedIn = lastPunch?.punch_type === "in";
  const sinceMs = clockedIn ? now - new Date(lastPunch.punched_at).getTime() : 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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
    if (!employee || busy) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = await supabase.from("time_clock_punches").insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      user_id: user.id,
      punch_type: type,
      punched_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(type === "in" ? "Clocked in" : "Clocked out");
    load();
  }

  const liveTime = useMemo(() => new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }), [now]);
  const liveDate = useMemo(() => new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }), [now]);

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-8 unit-in">
      {/* HERO CLOCK */}
      <div className="rounded-3xl border border-border bg-gradient-to-br from-white to-surface p-8 sm:p-12 text-center">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{liveDate}</div>
        <div className="mt-3 font-display text-6xl sm:text-7xl font-extrabold tracking-tight text-slate-900 unit-num">{liveTime}</div>

        {clockedIn && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            <span className="text-sm font-semibold text-emerald-700 unit-num">On the clock · {fmtElapsed(sinceMs)}</span>
          </div>
        )}

        <button
          onClick={() => punch(clockedIn ? "out" : "in")}
          disabled={busy}
          className={`mt-8 w-full max-w-md mx-auto block rounded-3xl py-10 sm:py-12 text-3xl sm:text-4xl font-extrabold text-white shadow-float transition-all active:translate-y-px disabled:opacity-60 ${
            clockedIn
              ? "bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700"
              : "bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
          }`}
        >
          {clockedIn ? "Clock Out" : "Clock In"}
        </button>

        <div className="mt-4 text-sm text-slate-500">
          {clockedIn
            ? "Tap the red button when you finish your shift."
            : "Tap the green button to start tracking your time."}
        </div>
      </div>

      {/* RECENT PUNCHES */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-semibold text-slate-900">
          <Clock className="h-4 w-4" /> Recent punches
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No punches yet — your first one will show up here.</div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                  p.punch_type === "in" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}>{p.punch_type}</span>
                <div className="flex-1 text-slate-700 unit-num">{new Date(p.punched_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
