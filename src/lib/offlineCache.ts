// Lightweight offline-friendly cache for employee read paths.
// Strategy: network-first with localStorage fallback.
//   - On successful read: serialize and store under a versioned key.
//   - On error (or when offline): return last cached value if present.
// Cached payloads are small JSON shapes (paystubs, punches, work locations).

const PREFIX = "paylo_offline_v1:";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

type Entry<T> = { t: number; v: T };

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function readCache<T>(key: string): { value: T; age: number } | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    const age = Date.now() - parsed.t;
    if (age > MAX_AGE_MS) {
      s.removeItem(PREFIX + key);
      return null;
    }
    return { value: parsed.v, age };
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value } satisfies Entry<T>));
  } catch {
    // storage full — best effort
  }
}

/**
 * Run a network read with a localStorage fallback.
 * - Returns fresh data on success and updates the cache.
 * - Returns cached data with `fromCache: true` if the read throws or is offline.
 * - Returns `null` value if neither network nor cache succeed.
 */
export async function withOfflineCache<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<{ value: T | null; fromCache: boolean; age: number | null }> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) {
    const cached = readCache<T>(key);
    if (cached) return { value: cached.value, fromCache: true, age: cached.age };
  }
  try {
    const v = await loader();
    writeCache(key, v);
    return { value: v, fromCache: false, age: 0 };
  } catch (err) {
    const cached = readCache<T>(key);
    if (cached) return { value: cached.value, fromCache: true, age: cached.age };
    throw err;
  }
}

export function useOnlineStatus(): boolean {
  // Static helper for non-React contexts: not a hook — see OfflineBanner for the React version.
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}
