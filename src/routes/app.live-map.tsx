import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleMap } from "@/components/GoogleMap";
import { useCompany } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app/live-map")({
  head: () => ({ meta: [{ title: "Live Map — Paylo" }] }),
  component: LiveMapPage,
});

interface LiveRow {
  employee_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  heading: number | null;
  speed_mps: number | null;
  is_clocked_in: boolean;
  updated_at: string;
}
interface EmpRow { id: string; full_name: string; job_title: string | null; }

function ageLabel(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function LiveMapPage() {
  const { currentId } = useCompany();
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [emps, setEmps] = useState<Record<string, EmpRow>>({});
  const [tick, setTick] = useState(0);

  async function load() {
    if (!currentId) return;
    const { data: liveRows } = await supabase
      .from("employee_live_locations")
      .select("employee_id, latitude, longitude, accuracy_m, heading, speed_mps, is_clocked_in, updated_at")
      .eq("company_id", currentId)
      .eq("is_clocked_in", true)
      .order("updated_at", { ascending: false });
    const list = (liveRows ?? []) as LiveRow[];
    setRows(list);
    if (list.length) {
      const { data: e } = await supabase
        .from("employees").select("id, full_name, job_title").in("id", list.map((r) => r.employee_id));
      setEmps(Object.fromEntries((e ?? []).map((x: any) => [x.id, x])));
    } else {
      setEmps({});
    }
  }

  useEffect(() => { load(); }, [currentId]);
  useEffect(() => {
    const t = setInterval(() => { load(); setTick((n) => n + 1); }, 15_000);
    return () => clearInterval(t);
  }, [currentId]);
  useRealtimeRefresh(["employee_live_locations"], () => { load(); }, { companyId: currentId });

  const markers = useMemo(() => rows.map((r) => {
    const ageMin = (Date.now() - new Date(r.updated_at).getTime()) / 60000;
    const stale = ageMin > 5;
    return {
      lat: r.latitude, lng: r.longitude,
      title: `${emps[r.employee_id]?.full_name ?? "Employee"} · ${ageLabel(r.updated_at)}`,
      color: stale ? "#94A3B8" : "#10B981",
    };
  }), [rows, emps, tick]);

  return (
    <div className="space-y-6 unit-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">Live Map</h1>
          <p className="mt-2 text-base text-slate-600">Real-time location of employees currently clocked in. Updates every ~15 seconds.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {rows.length === 0 ? (
            <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card text-sm text-slate-500">
              <div className="text-center">
                <MapPin className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                No employees are currently clocked in with live tracking enabled.
              </div>
            </div>
          ) : (
            <GoogleMap markers={markers} />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 font-display text-sm font-semibold text-slate-900">
            On the clock ({rows.length})
          </div>
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Nobody is clocked in right now.</div>
          ) : (
            <ul className="divide-y divide-border text-sm max-h-[480px] overflow-y-auto">
              {rows.map((r) => {
                const e = emps[r.employee_id];
                const ageMin = (Date.now() - new Date(r.updated_at).getTime()) / 60000;
                const stale = ageMin > 5;
                return (
                  <li key={r.employee_id} className="flex items-start gap-3 px-4 py-3">
                    <Navigation className={`mt-0.5 h-4 w-4 ${stale ? "text-slate-400" : "text-emerald-600"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 truncate">{e?.full_name || "Employee"}</span>
                        <Badge variant={stale ? "secondary" : "outline"}>{ageLabel(r.updated_at)}</Badge>
                      </div>
                      <div className="text-xs text-slate-500">
                        {e?.job_title || "—"}{r.accuracy_m ? ` · ±${Math.round(r.accuracy_m)}m` : ""}
                        {r.speed_mps && r.speed_mps > 0.5 ? ` · ${(r.speed_mps * 2.237).toFixed(0)} mph` : ""}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                        <a className="ml-2 underline" href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer">Open</a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
