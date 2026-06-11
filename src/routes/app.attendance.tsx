import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Clock, MapPin, RefreshCw, Users, Activity } from "lucide-react";

export const Route = createFileRoute("/app/attendance")({
  head: () => ({ meta: [{ title: "Live Attendance — Paylo" }] }),
  component: AttendancePage,
});

interface Employee {
  id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
}
interface Punch {
  id: string;
  employee_id: string;
  punch_type: string;
  punched_at: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  work_location_id: string | null;
  geofence_ok: boolean | null;
  geofence_required: boolean;
}
interface WorkLoc { id: string; name: string; latitude: number | null; longitude: number | null; geofence_radius_m: number; }
interface Row {
  employee: Employee;
  lastIn: Punch | null;
  lastOut: Punch | null;
  status: "in" | "out";
  todayHours: number;
  history: Punch[];
}

function startOfDayIso(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString();
}
function fmt(ts: string) { return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function fmtDur(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function computeTodayHours(punches: Punch[]): number {
  // punches ordered DESC; pair in/out chronologically
  const todayStart = startOfDayIso();
  const todays = punches.filter((p) => p.punched_at >= todayStart).slice().reverse();
  let ms = 0;
  let inAt: number | null = null;
  for (const p of todays) {
    if (p.punch_type === "in") inAt = new Date(p.punched_at).getTime();
    else if (p.punch_type === "out" && inAt != null) {
      ms += new Date(p.punched_at).getTime() - inAt;
      inAt = null;
    }
  }
  if (inAt != null) ms += Date.now() - inAt;
  return ms / 3_600_000;
}

function AttendancePage() {
  const { currentId } = useCompany();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [locations, setLocations] = useState<WorkLoc[]>([]);
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll() {
    if (!currentId) return;
    setLoading(true);
    setErr(null);
    try {
      // Sequential — parallel fetches occasionally get dropped in the preview sandbox.
      const empRes = await supabase.from("employees")
        .select("id, full_name, job_title, department")
        .eq("company_id", currentId)
        .neq("lifecycle_status", "terminated")
        .order("full_name");
      if (empRes.error) throw new Error(`Employees: ${empRes.error.message}`);

      const pRes = await supabase.from("time_clock_punches")
        .select("id, employee_id, punch_type, punched_at, latitude, longitude, address, work_location_id, geofence_ok, geofence_required")
        .eq("company_id", currentId)
        .gte("punched_at", new Date(Date.now() - 14 * 86400_000).toISOString())
        .order("punched_at", { ascending: false })
        .limit(500);
      if (pRes.error) throw new Error(`Punches: ${pRes.error.message}`);

      const lRes = await supabase.from("work_locations")
        .select("id, name, latitude, longitude, geofence_radius_m")
        .eq("company_id", currentId);

      setEmployees((empRes.data ?? []) as Employee[]);
      setPunches((pRes.data ?? []) as Punch[]);
      setLocations((lRes.data ?? []) as WorkLoc[]);
    } catch (e: any) {
      console.error("[attendance] load failed", e);
      setErr(e?.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [currentId]);

  // Realtime: update on any new/updated punch
  useEffect(() => {
    if (!currentId) return;
    const ch = supabase
      .channel(`attendance-${currentId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "time_clock_punches", filter: `company_id=eq.${currentId}` },
        (payload) => {
          setPunches((prev) => {
            const next = prev.slice();
            const row = (payload.new ?? payload.old) as any;
            if (!row) return prev;
            if (payload.eventType === "DELETE") return next.filter((p) => p.id !== row.id);
            const i = next.findIndex((p) => p.id === row.id);
            const norm: Punch = {
              id: row.id, employee_id: row.employee_id, punch_type: row.punch_type,
              punched_at: row.punched_at, latitude: row.latitude ?? null,
              longitude: row.longitude ?? null, address: row.address ?? null,
            };
            if (i >= 0) next[i] = norm; else next.unshift(norm);
            next.sort((a, b) => b.punched_at.localeCompare(a.punched_at));
            return next;
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentId]);

  // Refresh "today hours" while clocked in
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const rows: Row[] = useMemo(() => {
    void tick;
    const byEmp = new Map<string, Punch[]>();
    for (const p of punches) {
      if (!p.employee_id) continue;
      const list = byEmp.get(p.employee_id) ?? [];
      list.push(p);
      byEmp.set(p.employee_id, list);
    }
    return employees.map((e) => {
      const list = byEmp.get(e.id) ?? [];
      const lastIn = list.find((p) => p.punch_type === "in") ?? null;
      const lastOut = list.find((p) => p.punch_type === "out") ?? null;
      const last = list[0];
      const status: "in" | "out" = last?.punch_type === "in" ? "in" : "out";
      return {
        employee: e,
        lastIn, lastOut, status,
        todayHours: computeTodayHours(list),
        history: list.slice(0, 8),
      };
    });
  }, [employees, punches, tick]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      r.employee.full_name.toLowerCase().includes(term) ||
      (r.employee.job_title ?? "").toLowerCase().includes(term) ||
      (r.employee.department ?? "").toLowerCase().includes(term),
    );
  }, [rows, q]);

  const inCount = rows.filter((r) => r.status === "in").length;
  const outCount = rows.length - inCount;

  return (
    <div className="space-y-6 unit-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">Live Attendance</h1>
          <p className="mt-2 text-base text-slate-600">Real-time clock in/out status across your workforce. Updates instantly.</p>
        </div>
        <button onClick={loadAll} className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Clocked in now" value={inCount} icon={<Activity className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Clocked out" value={outCount} icon={<Clock className="h-4 w-4" />} tone="slate" />
        <StatCard label="Active employees" value={rows.length} icon={<Users className="h-4 w-4" />} tone="indigo" />
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Employees</h2>
          <Input placeholder="Search name, title, department…" value={q} onChange={(e) => setQ(e.target.value)} className="ml-auto h-9 max-w-xs" />
        </div>

        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading attendance…</div>
        ) : err ? (
          <div className="p-8 text-sm text-rose-600">
            Couldn't load attendance: {err}
            <button onClick={loadAll} className="ml-3 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"><RefreshCw className="h-3 w-3" /> Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">No employees match.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <li key={r.employee.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{r.employee.full_name}</span>
                      {r.status === "in" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
                          Clocked in
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Clocked out</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {r.employee.job_title ?? "—"} {r.employee.department ? `· ${r.employee.department}` : ""} · ID {r.employee.id.slice(0, 8)}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-slate-500">Today</div>
                    <div className="font-display text-xl font-bold text-slate-900 unit-num">{fmtDur(r.todayHours * 3_600_000)}</div>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <PunchCell label="Last clock-in" punch={r.lastIn} live={r.status === "in"} accent="emerald" />
                  <PunchCell label="Last clock-out" punch={r.lastOut} accent="slate" />
                </div>

                {r.history.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900">View recent history ({r.history.length})</summary>
                    <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                      {r.history.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${p.punch_type === "in" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{p.punch_type}</span>
                          <span className="unit-num text-slate-700">{new Date(p.punched_at).toLocaleString()}</span>
                          {p.address && <span className="flex items-center gap-1 truncate text-slate-500"><MapPin className="h-3 w-3" />{p.address}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "emerald" | "slate" | "indigo" }) {
  const toneCls = tone === "emerald" ? "from-emerald-50 to-white text-emerald-700" : tone === "indigo" ? "from-indigo-50 to-white text-indigo-700" : "from-slate-50 to-white text-slate-700";
  return (
    <div className={`rounded-2xl border border-border bg-gradient-to-br ${toneCls} p-4`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">{icon}{label}</div>
      <div className="mt-2 font-display text-3xl font-extrabold text-slate-900 unit-num">{value}</div>
    </div>
  );
}

function PunchCell({ label, punch, live, accent }: { label: string; punch: Punch | null; live?: boolean; accent: "emerald" | "slate" }) {
  const accentCls = accent === "emerald" ? "border-emerald-200 bg-emerald-50/40" : "border-border bg-surface";
  return (
    <div className={`rounded-xl border ${accentCls} p-3`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      {punch ? (
        <>
          <div className="mt-1 unit-num text-sm font-semibold text-slate-900">
            {fmt(punch.punched_at)} <span className="text-xs font-normal text-slate-500">· {new Date(punch.punched_at).toLocaleDateString()}</span>
            {live && <span className="ml-2 text-xs font-semibold text-emerald-700">· live</span>}
          </div>
          {punch.address && (
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-600">
              <MapPin className="h-3 w-3" /> <span className="truncate">{punch.address}</span>
            </div>
          )}
          {punch.latitude != null && punch.longitude != null && (
            <div className="mt-0.5 text-[11px] text-slate-400 unit-num">
              {punch.latitude.toFixed(5)}, {punch.longitude.toFixed(5)}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1 text-sm text-slate-400">—</div>
      )}
    </div>
  );
}
