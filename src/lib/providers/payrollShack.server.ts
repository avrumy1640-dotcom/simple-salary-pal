/**
 * Payroll provider client — server-only.
 *
 * Authenticates every outbound call with a single platform-level API key
 * (`PAYROLL_SHACK_API_KEY`) stored as a backend secret. There is intentionally
 * NO per-company key entry, no admin settings surface, and no reference to
 * the provider name in any customer-facing UI. Consumers only see generic
 * "payroll" operations.
 */

const DEFAULT_BASE_URL = "https://api.payrollshack.com";

function getConfig() {
  const apiKey = process.env.PAYROLL_SHACK_API_KEY;
  if (!apiKey) {
    throw new Error("Payroll provider is not configured on the backend.");
  }
  const baseUrl = (process.env.PAYROLL_SHACK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

export type PayrollRequestInit = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
};

/**
 * Call the payroll provider. The API key is injected server-side; callers
 * never see it. Returns parsed JSON, or throws with a redacted error message
 * (never includes the key or upstream branding in user-visible output).
 */
export async function callPayrollProvider<T = unknown>(
  path: string,
  init: PayrollRequestInit = {},
): Promise<T> {
  const { apiKey, baseUrl } = getConfig();
  const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    ...(init.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] ??= "application/json";
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }

  const res = await fetch(url.toString(), {
    ...init,
    headers,
    body,
  });

  const text = await res.text();
  const parsed = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (parsed && (parsed as any).message) || `Payroll request failed (${res.status})`;
    throw new Error(msg);
  }
  return parsed as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
