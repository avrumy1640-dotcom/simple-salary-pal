import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Clock, MapPin, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/time")({
  head: () => ({ meta: [{ title: "Time clock — Paylo" }] }),
  component: Page,
});

interface Punch {
  id: string;
  punched_at: string;
  punch_type: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  work_location_id: string | null;
  geofence_ok: boolean | null;
}
interface WorkLoc {
  id: string; name: string;
  latitude: number | null; longitude: number | null;
  geofence_radius_m: number; geofence_required: boolean;
}
type GeoState =
  | { kind: "idle" }
  | { kind: "unavailable" }
  | { kind: "approved"; loc: WorkLoc; distance: number; lat: number; lng: number; accuracy: number }
  | { kind: "outside"; loc: WorkLoc; distance: number; lat: number; lng: number; accuracy: number }
  | { kind: "no_location"; lat: number; lng: number; accuracy: number };

function fmtElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  });
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const g = (window as any).google?.maps;
    if (!g) return null;
    return await new Promise((resolve) => {
      new g.Geocoder().geocode({ location: { lat, lng } }, (results: any, status: any) => {
        resolve(status === "OK" && results?.[0] ? results[0].formatted_address : null);
      });
    });
  } catch { return null; }
}

function Page() {
  const { employee, loading } = useMyEmployee();
  const [recent, setRecent] = useState<Punch[]>([]);
  const [locations, setLocations] = useState<WorkLoc[]>([]);
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });
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
    const [pRes, lRes] = await Promise.all([
      supabase.from("time_clock_punches")
        .select("id, punched_at, punch_type, latitude, longitude, address, work_location_id, geofence_ok")
        .eq("employee_id", employee.id)
        .order("punched_at", { ascending: false }).limit(20),
      supabase.from("work_locations")
        .select("id, name, latitude, longitude, geofence_radius_m, geofence_required")
        .eq("company_id", employee.company_id)
        .eq("is_active", true),
    ]);
    setRecent((pRes.data ?? []) as Punch[]);
    setLocations((lRes.data ?? []) as WorkLoc[]);
  }
  useEffect(() => { load(); }, [employee?.id]);

  // Auto-check GPS + geofence on mount so user sees status before tapping
  async function probeGeofence() {
    const pos = await getPosition();
    if (!pos) { setGeo({ kind: "unavailable" }); return null; }
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const candidates = locations.filter((l) => l.latitude != null && l.longitude != null);
    if (candidates.length === 0) {
      setGeo({ kind: "no_location", lat, lng, accuracy });
      return { lat, lng, accuracy, loc: null as WorkLoc | null, inside: false, dist: 0 };
    }
    let best = candidates[0]; let bestDist = Infinity;
    for (const l of candidates) {
      const d = haversineM(lat, lng, l.latitude!, l.longitude!);
      if (d < bestDist) { bestDist = d; best = l; }
    }
    const inside = bestDist <= best.geofence_radius_m;
    setGeo(inside
      ? { kind: "approved", loc: best, distance: bestDist, lat, lng, accuracy }
      : { kind: "outside", loc: best, distance: bestDist, lat, lng, accuracy });
    return { lat, lng, accuracy, loc: best, inside, dist: bestDist };
  }

  useEffect(() => {
    if (locations.length === 0 && !employee) return;
    probeGeofence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations.length, employee?.id]);

  useEffect(() => {
    if (!employee?.id) return;
    const ch = supabase
      .channel(`punches-self-${employee.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_clock_punches", filter: `employee_id=eq.${employee.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [employee?.id]);

  async function punch(type: "in" | "out") {
    if (!employee || busy) return;
    if (type === "in" && clockedIn) { toast.error("You're already clocked in."); return; }
    if (type === "out" && !clockedIn) { toast.error("You need to clock in first."); return; }

    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }

    const result = await probeGeofence();
    if (!result) {
      setBusy(false);
      toast.error("Couldn't read your GPS location. Please enable location services and try again.");
      return;
    }
    const { lat, lng, accuracy, loc, inside } = result;

    // Block clock-in when the matched location requires geofence and user is outside
    if (type === "in" && loc?.geofence_required && !inside) {
      setBusy(false);
      toast.error(`You're outside the required geofence for ${loc.name}. Move closer to clock in.`);
      return;
    }

    const address = lat != null && lng != null ? await reverseGeocode(lat, lng) : null;

    const { error } = await supabase.from("time_clock_punches").insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      user_id: user.id,
      punch_type: type,
      punched_at: new Date().toISOString(),
      latitude: lat,
      longitude: lng,
      accuracy_m: accuracy,
      address,
      work_location_id: loc?.id ?? null,
      geofence_required: loc?.geofence_required ?? false,
      notes: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
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

        <GeofenceBadge geo={geo} />

        <button
          onClick={() => punch(clockedIn ? "out" : "in")}
          disabled={busy}
          className={`mt-6 w-full max-w-md mx-auto block rounded-3xl py-10 sm:py-12 text-3xl sm:text-4xl font-extrabold text-white shadow-float transition-all active:translate-y-px disabled:opacity-60 ${
            clockedIn
              ? "bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700"
              : "bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
          }`}
        >
          {busy ? "Saving…" : clockedIn ? "Clock Out" : "Clock In"}
        </button>

        <div className="mt-4 text-sm text-slate-500">
          {clockedIn ? "Tap the red button when you finish your shift." : "Tap the green button to start tracking your time."}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-semibold text-slate-900">
          <Clock className="h-4 w-4" /> Recent punches
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No punches yet — your first one will show up here.</div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((p) => {
              const locName = locations.find((l) => l.id === p.work_location_id)?.name;
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                    p.punch_type === "in" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}>{p.punch_type}</span>
                  <div className="flex-1 text-slate-700">
                    <div className="unit-num">{new Date(p.punched_at).toLocaleString()}</div>
                    {(p.address || locName) && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3 w-3" /> {locName ? `${locName} · ` : ""}{p.address}
                      </div>
                    )}
                  </div>
                  {p.geofence_ok === true && <span className="text-[11px] font-semibold text-emerald-700">✓ in zone</span>}
                  {p.geofence_ok === false && <span className="text-[11px] font-semibold text-amber-700">outside</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function GeofenceBadge({ geo }: { geo: GeoState }) {
  if (geo.kind === "idle") return null;
  if (geo.kind === "unavailable") {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-sm font-semibold text-rose-700">
        <ShieldOff className="h-4 w-4" /> Location not available — enable GPS to clock in
      </div>
    );
  }
  if (geo.kind === "no_location") {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-700">
        <MapPin className="h-4 w-4" /> No work locations set — ask your admin to add one
      </div>
    );
  }
  if (geo.kind === "approved") {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700">
        <ShieldCheck className="h-4 w-4" /> Approved · {geo.loc.name} · {Math.round(geo.distance)} m away
      </div>
    );
  }
  return (
    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-800">
      <ShieldAlert className="h-4 w-4" /> Outside geofence · nearest is {geo.loc.name} ({Math.round(geo.distance)} m, allowed {geo.loc.geofence_radius_m} m)
    </div>
  );
}
