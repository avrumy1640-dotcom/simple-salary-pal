// Friendly, browser-aware geolocation helpers.
// The browser only prompts once. If the user (or the iframe's permission
// policy) denied location, getCurrentPosition fails immediately with
// PERMISSION_DENIED — we surface that with actionable copy instead of the
// raw "User denied Geolocation" string.

export function friendlyGeoError(e: GeolocationPositionError): string {
  switch (e.code) {
    case 1: // PERMISSION_DENIED
      if (typeof window !== "undefined" && window.self !== window.top) {
        return "Location is blocked in the preview frame. Open the app in a new tab, then allow location for this site.";
      }
      return "Location permission is blocked. Click the 🔒 icon in the address bar → Site settings → Location → Allow, then reload.";
    case 2: // POSITION_UNAVAILABLE
      return "Couldn't determine your position. Check that Location Services are on for your device, then try again.";
    case 3: // TIMEOUT
      return "Getting your location took too long. Move to a spot with better GPS signal and try again.";
    default:
      return e.message || "Unable to get your location.";
  }
}

export function getCurrentPositionSafe(
  opts: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
): Promise<{ position: GeolocationPosition | null; error: string | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return resolve({ position: null, error: "Geolocation is not available on this device." });
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ position: p, error: null }),
      (e) => resolve({ position: null, error: friendlyGeoError(e) }),
      opts,
    );
  });
}
