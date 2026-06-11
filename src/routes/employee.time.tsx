import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { loadMaps } from "@/components/GoogleMap";
import { Clock, MapPin, ShieldCheck, ShieldAlert, ShieldOff, RefreshCw, Check } from "lucide-react";
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
  id: string; name: string; address: string | null;
  latitude: number | null; longitude: number | null;
  geofence_radius_m: number; geofence_required: boolean;
}

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

import { friendlyGeoError } from "@/lib/geo";

function getPosition(): Promise<{ position: GeolocationPosition | null; error: string | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return resolve({ position: null, error: "Geolocation is not available on this device." });
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ position: p, error: null }),
      (e) => resolve({ position: null, error: friendlyGeoError(e) }),
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

interface Pos { lat: number; lng: number; accuracy: number }

function Page() {
  const { employee, loading } = useMyEmployee();
  const [recent, setRecent] = useState<Punch[]>([]);
  const [locations, setLocations] = useState<WorkLoc[]>([]);
  const [pos, setPos] = useState<Pos | null>(null);
  const [posErr, setPosErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);

  const lastPunch = recent[0];
  const clockedIn = lastPunch?.punch_type === "in";
  const sinceMs = clockedIn ? now - new Date(lastPunch.punched_at).getTime() : 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Preload Google Maps for reverse geocoding + mini map
  useEffect(() => { loadMaps().catch(() => {}); }, []);

  async function load() {
    if (!employee) return;
    const [pRes, lRes] = await Promise.all([
      supabase.from("time_clock_punches")
        .select("id, punched_at, punch_type, latitude, longitude, address, work_location_id, geofence_ok")
        .eq("employee_id", employee.id)
        .order("punched_at", { ascending: false }).limit(20),
      supabase.from("work_locations")
        .select("id, name, address, latitude, longitude, geofence_radius_m, geofence_required")
        .eq("company_id", employee.company_id)
        .eq("is_active", true)
        .order("name"),
    ]);
    setRecent((pRes.data ?? []) as Punch[]);
    setLocations((lRes.data ?? []) as WorkLoc[]);
  }
  useEffect(() => { load(); }, [employee?.id]);

  async function refreshGps() {
    setProbing(true);
    setPosErr(null);
    const { position, error } = await getPosition();
    setProbing(false);
    if (!position) { setPosErr(error ?? "Couldn't read your GPS. Please enable location services."); return; }
    setPos({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
  }
  useEffect(() => { refreshGps(); }, []);

  // Locations sorted by distance from user
  const sorted = useMemo(() => {
    const withCoords = locations.filter((l) => l.latitude != null && l.longitude != null);
    if (!pos) return withCoords.map((l) => ({ loc: l, distance: null as number | null }));
    return withCoords
      .map((l) => ({ loc: l, distance: haversineM(pos.lat, pos.lng, l.latitude!, l.longitude!) }))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  }, [locations, pos]);

  // Auto-select: prefer employee's assigned work_location, otherwise nearest
  useEffect(() => {
    if (selectedId) return;
    if (sorted.length === 0) return;
    const assigned = employee?.work_location_id;
    if (assigned && sorted.some((s) => s.loc.id === assigned)) {
      setSelectedId(assigned);
      return;
    }
    setSelectedId(sorted[0].loc.id);
  }, [sorted, selectedId, employee?.work_location_id]);

  const selected = useMemo(
    () => sorted.find((s) => s.loc.id === selectedId) ?? null,
    [sorted, selectedId],
  );
  const inside = selected && selected.distance != null
    ? selected.distance <= selected.loc.geofence_radius_m
    : null;

  // Realtime
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

    // Refresh GPS at punch time for accuracy
    const { position: p, error: perr } = await getPosition();
    if (!p) { toast.error(perr ?? "GPS required. Please enable location services."); return; }
    const lat = p.coords.latitude, lng = p.coords.longitude, accuracy = p.coords.accuracy;

    const loc = selected?.loc ?? null;
    const dist = loc?.latitude != null && loc?.longitude != null
      ? haversineM(lat, lng, loc.latitude, loc.longitude) : null;
    const isInside = loc && dist != null ? dist <= loc.geofence_radius_m : false;

    if (type === "in" && loc?.geofence_required && !isInside) {
      toast.error(`You're outside the required geofence for ${loc.name} (${Math.round(dist ?? 0)} m, limit ${loc.geofence_radius_m} m).`);
      return;
    }

    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }

    const address = await reverseGeocode(lat, lng);

    const { error } = await supabase.from("time_clock_punches").insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      user_id: user.id,
      punch_type: type,
      punched_at: new Date().toISOString(),
      latitude: lat, longitude: lng, accuracy_m: accuracy, address,
      work_location_id: loc?.id ?? null,
      geofence_required: loc?.geofence_required ?? false,
      notes: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(type === "in" ? "Clocked in" : "Clocked out");
    setPos({ lat, lng, accuracy });
    load();
  }

  const liveTime = useMemo(() => new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }), [now]);
  const liveDate = useMemo(() => new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }), [now]);

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-6 unit-in">
      {/* Hero clock */}
      <div className="rounded-3xl border border-border bg-gradient-to-br from-white to-surface p-8 sm:p-10 text-center">
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

        <StatusBadge posErr={posErr} probing={probing} selected={selected} inside={inside} hasLocations={locations.length > 0} />

        <button
          onClick={() => punch(clockedIn ? "out" : "in")}
          disabled={busy || !pos}
          className={`mt-6 w-full max-w-md mx-auto block rounded-3xl py-9 sm:py-12 text-3xl sm:text-4xl font-extrabold text-white shadow-float transition-all active:translate-y-px disabled:opacity-60 ${
            clockedIn
              ? "bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700"
              : "bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
          }`}
        >
          {busy ? "Saving…" : clockedIn ? "Clock Out" : "Clock In"}
        </button>

        <div className="mt-3 text-sm text-slate-500">
          {clockedIn ? "Tap the red button when you finish your shift." : "Confirm your work location below and tap to start your shift."}
        </div>
      </div>

      {/* Work location selector */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="h-4 w-4" /> Where are you clocking in?
          </div>
          <button onClick={refreshGps} disabled={probing} className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-3 w-3 ${probing ? "animate-spin" : ""}`} /> Refresh GPS
          </button>
        </div>

        {locations.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No approved work locations yet. Ask your admin to add one before you can clock in.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map(({ loc, distance }) => {
              const within = distance != null ? distance <= loc.geofence_radius_m : null;
              const checked = selectedId === loc.id;
              return (
                <li key={loc.id}>
                  <label className={`flex cursor-pointer items-start gap-3 px-5 py-3.5 transition-colors ${checked ? "bg-emerald-50/40" : "hover:bg-slate-50"}`}>
                    <input
                      type="radio"
                      name="worklocation"
                      checked={checked}
                      onChange={() => setSelectedId(loc.id)}
                      className="mt-1 h-4 w-4 accent-emerald-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{loc.name}</span>
                        {within === true && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            <Check className="h-3 w-3" /> In zone
                          </span>
                        )}
                        {within === false && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                            Outside
                          </span>
                        )}
                        {loc.geofence_required && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                            Geofence required
                          </span>
                        )}
                      </div>
                      {loc.address && <div className="mt-0.5 truncate text-xs text-slate-500">{loc.address}</div>}
                      <div className="mt-1 text-[11px] text-slate-500 unit-num">
                        {distance != null
                          ? <>~{Math.round(distance)} m away · allowed radius {loc.geofence_radius_m} m</>
                          : <>Allowed radius {loc.geofence_radius_m} m · enable GPS to see distance</>}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {selected && pos && (
          <MiniMap
            user={pos}
            loc={selected.loc}
          />
        )}
      </div>

      {/* Recent punches */}
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

function StatusBadge({ posErr, probing, selected, inside, hasLocations }: {
  posErr: string | null; probing: boolean;
  selected: { loc: WorkLoc; distance: number | null } | null;
  inside: boolean | null; hasLocations: boolean;
}) {
  if (probing) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-700">
        <RefreshCw className="h-4 w-4 animate-spin" /> Reading your GPS location…
      </div>
    );
  }
  if (posErr) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-sm font-semibold text-rose-700">
        <ShieldOff className="h-4 w-4" /> {posErr}
      </div>
    );
  }
  if (!hasLocations) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-700">
        <MapPin className="h-4 w-4" /> No work locations set — ask your admin to add one
      </div>
    );
  }
  if (selected && inside === true) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700">
        <ShieldCheck className="h-4 w-4" /> Approved · {selected.loc.name}{selected.distance != null ? ` · ${Math.round(selected.distance)} m away` : ""}
      </div>
    );
  }
  if (selected && inside === false) {
    return (
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-800">
        <ShieldAlert className="h-4 w-4" /> Outside geofence · {selected.loc.name} ({Math.round(selected.distance ?? 0)} m, allowed {selected.loc.geofence_radius_m} m)
      </div>
    );
  }
  return null;
}

function MiniMap({ user, loc }: { user: Pos; loc: WorkLoc }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const objsRef = useRef<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadMaps().then(() => {
      if (cancelled || !ref.current || !(window as any).google?.maps) return;
      const g = (window as any).google.maps;
      mapRef.current = new g.Map(ref.current, {
        center: { lat: user.lat, lng: user.lng }, zoom: 16,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const g = (window as any).google?.maps;
    if (!mapRef.current || !g) return;
    objsRef.current.forEach((o) => o.setMap(null));
    objsRef.current = [];

    // User pin (blue)
    objsRef.current.push(new g.Marker({
      position: { lat: user.lat, lng: user.lng }, map: mapRef.current, title: "You",
      icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
    }));

    // Geofence circle + center marker
    if (loc.latitude != null && loc.longitude != null) {
      objsRef.current.push(new g.Marker({
        position: { lat: loc.latitude, lng: loc.longitude }, map: mapRef.current, title: loc.name,
      }));
      objsRef.current.push(new g.Circle({
        center: { lat: loc.latitude, lng: loc.longitude },
        radius: loc.geofence_radius_m,
        strokeColor: "#059669", strokeOpacity: 0.8, strokeWeight: 2,
        fillColor: "#10b981", fillOpacity: 0.12,
        map: mapRef.current,
      }));
      const bounds = new g.LatLngBounds();
      bounds.extend({ lat: user.lat, lng: user.lng });
      bounds.extend({ lat: loc.latitude, lng: loc.longitude });
      mapRef.current.fitBounds(bounds, 80);
    }
  }, [user.lat, user.lng, loc.id, loc.latitude, loc.longitude, loc.geofence_radius_m]);

  return <div ref={ref} className="h-56 w-full border-t border-border bg-muted" />;
}
