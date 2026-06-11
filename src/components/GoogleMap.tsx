import { useEffect, useRef, useState } from "react";

type Marker = {
  lat: number;
  lng: number;
  title?: string;
  color?: string;
};

declare global {
  interface Window {
    google?: any;
    __gmapsInitCb?: () => void;
    __gmapsLoading?: Promise<void>;
  }
}

export function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__gmapsLoading) return window.__gmapsLoading;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Maps key missing"));
  window.__gmapsLoading = new Promise<void>((resolve, reject) => {
    window.__gmapsInitCb = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__gmapsInitCb${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return window.__gmapsLoading;
}

export function GoogleMap({
  markers,
  center,
  zoom = 11,
  className = "h-[420px] w-full rounded-2xl overflow-hidden",
}: {
  markers: Marker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const fallback = center ?? markers[0] ?? { lat: 39.5, lng: -98.35 };
        mapRef.current = new window.google.maps.Map(ref.current, {
          center: fallback,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
        });
      })
      .catch((e) => setErr(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new window.google.maps.LatLngBounds();
    markers.forEach((m) => {
      const marker = new window.google.maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        map: mapRef.current,
        title: m.title,
        icon: m.color
          ? {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: m.color,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            }
          : undefined,
      });
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition()!);
    });
    if (markers.length > 1) mapRef.current.fitBounds(bounds, 60);
    else if (markers.length === 1) {
      mapRef.current.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
      mapRef.current.setZoom(14);
    }
  }, [markers]);

  if (err) {
    return (
      <div className={`${className} grid place-items-center border bg-muted text-sm text-muted-foreground`}>
        Map unavailable: {err}
      </div>
    );
  }
  return <div ref={ref} className={`${className} border bg-muted`} />;
}

export function wazeUrl(lat: number, lng: number) {
  return `https://www.waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
}

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
