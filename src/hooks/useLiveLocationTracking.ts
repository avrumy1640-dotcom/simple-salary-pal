import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const CONSENT_KEY = "paylo_live_tracking_consent";

export function hasLiveTrackingConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CONSENT_KEY) === "1";
}
export function setLiveTrackingConsent(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, v ? "1" : "0");
}

/**
 * While `active` is true, watch GPS and upsert the employee's row in
 * employee_live_locations every ~20s (or on significant movement).
 * On stop, marks is_clocked_in=false.
 */
export function useLiveLocationTracking(opts: {
  active: boolean;
  employeeId: string | null;
  companyId: string | null;
  userId: string | null;
}) {
  const { active, employeeId, companyId, userId } = opts;
  const watchIdRef = useRef<number | null>(null);
  const lastPushRef = useRef<number>(0);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!active || !employeeId || !companyId || !userId) {
      // If we have valid IDs but became inactive → mark clocked-out
      if (employeeId && companyId && userId && !active) {
        supabase.from("employee_live_locations")
          .update({ is_clocked_in: false, updated_at: new Date().toISOString() })
          .eq("employee_id", employeeId)
          .then(() => undefined, () => undefined);
      }
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (!("geolocation" in navigator) || !hasLiveTrackingConsent()) return;

    async function push(p: GeolocationPosition) {
      const now = Date.now();
      const prev = lastCoordsRef.current;
      const movedFar = !prev || hav(prev.lat, prev.lng, p.coords.latitude, p.coords.longitude) > 30;
      if (now - lastPushRef.current < 20_000 && !movedFar) return;
      lastPushRef.current = now;
      lastCoordsRef.current = { lat: p.coords.latitude, lng: p.coords.longitude };
      await supabase.from("employee_live_locations").upsert({
        employee_id: employeeId!,
        company_id: companyId!,
        user_id: userId!,
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy_m: p.coords.accuracy ?? null,
        heading: Number.isFinite(p.coords.heading ?? NaN) ? p.coords.heading : null,
        speed_mps: Number.isFinite(p.coords.speed ?? NaN) ? p.coords.speed : null,
        is_clocked_in: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "employee_id" });
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => { void push(p); },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );

    return () => {
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [active, employeeId, companyId, userId]);
}

function hav(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
