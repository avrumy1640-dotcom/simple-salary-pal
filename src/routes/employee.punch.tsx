import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Play, Square, MapPin, AlertCircle, ShieldCheck, Coffee, Loader2, Navigation } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLiveLocationTracking, hasLiveTrackingConsent, setLiveTrackingConsent } from "@/hooks/useLiveLocationTracking";

export const Route = createFileRoute("/employee/punch")({
  head: () => ({ meta: [{ title: "Punch in / out — Paylo" }] }),
  component: PunchPage,
});

interface Punch {
  id: string; punched_at: string; punch_type: string;
  geofence_ok: boolean | null; geofence_required: boolean;
  work_location_id: string | null; shift_id: string | null;
}
interface WorkLocation {
  id: string; name: string;
  latitude: number | null; longitude: number | null;
  geofence_radius_m: number; geofence_required: boolean;
}
interface Shift {
  id: string; start_at: string; end_at: string;
  role: string | null; location: string | null;
  work_location_id: string | null; status: string;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function PunchPage() {
  const { employee, loading } = useMyEmployee();
  const [recent, setRecent] = useState<Punch[]>([]);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<Shift[]>([]);
  const [chosenLoc, setChosenLoc] = useState<string>("");
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingPunchIn, setPendingPunchIn] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);

  const lastPunch = recent[0];
  const clockedIn = lastPunch?.punch_type === "in" || lastPunch?.punch_type === "break_end";
  const onBreak = lastPunch?.punch_type === "break_start";

  const selectedLoc = useMemo(() => locations.find((l) => l.id === chosenLoc) ?? null, [locations, chosenLoc]);
  const distance = useMemo(() => {
    if (!coords || !selectedLoc?.latitude || !selectedLoc?.longitude) return null;
    return haversineM(coords.lat, coords.lng, selectedLoc.latitude, selectedLoc.longitude);
  }, [coords, selectedLoc]);
  const insideGeofence = distance !== null && selectedLoc ? distance <= selectedLoc.geofence_radius_m : null;

  // Auto-suggest shift now
  const activeShift = useMemo(() => {
    const now = Date.now();
    return upcomingShifts.find((s) => {
      const start = new Date(s.start_at).getTime() - 30 * 60_000;
      const end = new Date(s.end_at).getTime() + 30 * 60_000;
      return now >= start && now <= end;
    });
  }, [upcomingShifts]);

  async function load() {
    if (!employee) return;
    const [r, l, sh] = await Promise.all([
      supabase.from("time_clock_punches")
        .select("id, punched_at, punch_type, geofence_ok, geofence_required, work_location_id, shift_id")
        .eq("employee_id", employee.id).order("punched_at", { ascending: false }).limit(15),
      supabase.from("work_locations").select("id, name, latitude, longitude, geofence_radius_m, geofence_required")
        .eq("company_id", employee.company_id).eq("is_active", true).order("name"),
      supabase.from("shifts").select("id, start_at, end_at, role, location, work_location_id, status")
        .eq("company_id", employee.company_id).eq("employee_id", employee.id).eq("status", "published")
        .gte("end_at", new Date(Date.now() - 2 * 3600_000).toISOString())
        .lte("start_at", new Date(Date.now() + 24 * 3600_000).toISOString())
        .order("start_at"),
    ]);
    setRecent((r.data ?? []) as Punch[]);
    setLocations((l.data ?? []) as WorkLocation[]);
    setUpcomingShifts((sh.data ?? []) as Shift[]);
  }
  useEffect(() => { load(); }, [employee?.id]);

  // Auto-select shift's location
  useEffect(() => {
    if (activeShift?.work_location_id && !chosenLoc) setChosenLoc(activeShift.work_location_id);
  }, [activeShift?.id]);

  function captureLocation() {
    setGeoError(null);
    if (!("geolocation" in navigator)) { setGeoError("Geolocation is not available on this device."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => setGeoError(e.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  useEffect(() => { captureLocation(); }, []);

  async function punch(type: "in" | "out" | "break_start" | "break_end") {
    if (!employee) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const loc = selectedLoc;
    if (loc?.geofence_required && !coords) {
      toast.error("Location is required to punch in at this worksite");
      return;
    }
    if (loc?.geofence_required && type === "in" && insideGeofence === false) {
      toast.error(`You are ${Math.round(distance!)} m from ${loc.name} (limit ${loc.geofence_radius_m} m)`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("time_clock_punches").insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      user_id: user.id,
      punch_type: type,
      punched_at: new Date().toISOString(),
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      accuracy_m: coords?.acc ?? null,
      work_location_id: chosenLoc || null,
      shift_id: activeShift?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Punched ${type.replace("_", " ")}`);
    load();
  }

  // Live elapsed timer since last clock-in / break-end
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!clockedIn) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [clockedIn]);
  const elapsedMs = clockedIn && lastPunch ? now - new Date(lastPunch.punched_at).getTime() : 0;
  const elapsed = (() => {
    const s = Math.max(0, Math.floor(elapsedMs / 1000));
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  })();

  const status: "in" | "out" | "break" = onBreak ? "break" : clockedIn ? "in" : "out";
  const statusMeta = {
    in:    { label: "On the clock",    dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50",  ring: "ring-emerald-200" },
    out:   { label: "Off the clock",   dot: "bg-slate-400",   text: "text-slate-600",  bg: "bg-slate-50",    ring: "ring-slate-200" },
    break: { label: "On break",        dot: "bg-amber-500",   text: "text-amber-700",  bg: "bg-amber-50",    ring: "ring-amber-200" },
  }[status];

  const geofenceBlocked = !!(selectedLoc?.geofence_required && insideGeofence === false);
  const geofenceAcquiring = !!(selectedLoc?.geofence_required && !coords && !geoError);

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;


  return (
    <div className="space-y-8 unit-in">
      <div>
        <h1 className="font-display text-[32px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">Punch in / out</h1>
        <p className="mt-2 text-base text-slate-600">Confirm your worksite, then punch in.</p>
      </div>

      {/* Live status hero */}
      <div className={`rounded-3xl border border-border ${statusMeta.bg} p-6 shadow-soft`}>
        <div className="flex items-center gap-2">
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusMeta.dot}`}>
            {status === "in" && <span className={`absolute inset-0 animate-ping rounded-full ${statusMeta.dot} opacity-60`} />}
          </span>
          <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${statusMeta.text}`}>{statusMeta.label}</span>
        </div>
        <div className="mt-3 font-display text-5xl sm:text-6xl font-extrabold tabular text-slate-900">
          {clockedIn ? elapsed : "00:00:00"}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {clockedIn
            ? `Since ${new Date(lastPunch!.punched_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Ready when you are."}
        </div>
      </div>

      {activeShift && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Clock className="h-3.5 w-3.5" /> Scheduled shift
          </div>
          <div className="mt-1 font-semibold text-slate-900">
            {new Date(activeShift.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – {new Date(activeShift.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </div>
          {(activeShift.role || activeShift.location) && (
            <div className="text-xs text-slate-600">{[activeShift.role, activeShift.location].filter(Boolean).join(" · ")}</div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Worksite</div>
          <Select value={chosenLoc} onValueChange={setChosenLoc}>
            <SelectTrigger><SelectValue placeholder={locations.length ? "Select worksite (optional)" : "No worksites configured"} /></SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} {l.geofence_required && "· geofenced"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Geofence status */}
        <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-700 min-w-0">
              <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
              {coords ? (
                <span className="truncate">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}{" "}
                  <span className="text-slate-400">±{Math.round(coords.acc)}m</span>
                </span>
              ) : geoError ? (
                <span className="text-rose-600">Couldn't get location: {geoError}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding your location…
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={captureLocation}>Refresh</Button>
          </div>

          {selectedLoc?.geofence_required && (
            <div className="mt-3">
              {geofenceAcquiring ? (
                <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Waiting for location to verify you're at {selectedLoc.name}…
                </div>
              ) : distance === null ? (
                <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  This worksite requires location to punch in.
                </div>
              ) : insideGeofence ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  <ShieldCheck className="h-4 w-4" />
                  You're at {selectedLoc.name} — {Math.round(distance)} m from center (within {selectedLoc.geofence_radius_m} m).
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    You're <strong>{Math.round(distance)} m</strong> from {selectedLoc.name} — must be within {selectedLoc.geofence_radius_m} m to punch in. Move closer, then tap Refresh.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Giant action buttons */}
        <div className="space-y-2">
          {!clockedIn && !onBreak && (
            <Button
              onClick={() => punch("in")}
              disabled={busy || geofenceBlocked || geofenceAcquiring}
              className="h-20 w-full rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <Play className="mr-2 h-6 w-6" />}
              Clock in
            </Button>
          )}
          {clockedIn && !onBreak && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => punch("break_start")}
                variant="outline"
                disabled={busy}
                className="h-16 rounded-2xl border-amber-300 bg-amber-50 text-base font-semibold text-amber-900 hover:bg-amber-100"
              >
                <Coffee className="mr-2 h-5 w-5" /> Start break
              </Button>
              <Button
                onClick={() => punch("out")}
                disabled={busy}
                className="h-16 rounded-2xl bg-rose-600 text-base font-bold text-white shadow-lg shadow-rose-600/25 hover:bg-rose-700"
              >
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Square className="mr-2 h-5 w-5" />}
                Clock out
              </Button>
            </div>
          )}
          {onBreak && (
            <Button
              onClick={() => punch("break_end")}
              disabled={busy}
              className="h-20 w-full rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700"
            >
              {busy ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <Play className="mr-2 h-6 w-6" />}
              End break & resume
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 font-display text-sm font-semibold text-slate-900">
          <Clock className="h-4 w-4" /> Recent punches
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No punches yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((p) => {
              const isIn = p.punch_type === "in" || p.punch_type === "break_end";
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex h-2 w-2 rounded-full ${isIn ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <Badge variant="outline" className="capitalize">{p.punch_type.replace("_", " ")}</Badge>
                    <span className="truncate text-slate-700">{new Date(p.punched_at).toLocaleString()}</span>
                  </div>
                  {p.geofence_required && (
                    p.geofence_ok
                      ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      : <AlertCircle className="h-4 w-4 text-rose-600" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
