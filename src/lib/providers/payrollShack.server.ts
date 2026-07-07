// Payroll Shack adapter.
//
// Payroll Shack is a white-label payroll infrastructure provider. Each
// company that connects supplies (a) an API key stored in the encrypted
// `provider_secrets` vault, and (b) optional non-secret config on
// `provider_integrations.config`:
//
//   - base_url:  API base URL (defaults to https://api.payrollshack.com/v1)
//   - workspace_id: Payroll Shack workspace / tenant id, if the account uses one
//
// All requests use bearer auth. Every method returns a discriminated
// { ok: true, ... } | { ok: false, reason } result — provider status and
// body are surfaced verbatim so callers can log the exact failure.
//
// Endpoints below follow REST conventions Payroll Shack publishes; if their
// actual path shape differs, only the `path` argument on each request needs
// to change — auth, error handling, and retry semantics stay the same.

import { readProviderCredentials } from "./vault.server";

const DEFAULT_BASE_URL = "https://api.payrollshack.com/v1";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; status?: number; reason: string; body?: string };

async function request<T>(
  companyId: string,
  init: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  },
): Promise<Ok<T> | Err> {
  const creds = await readProviderCredentials(companyId, "payroll_shack");
  if (!creds) return { ok: false, reason: "Payroll Shack is not connected for this company." };

  const baseUrl = (creds.config.base_url as string | undefined) ?? DEFAULT_BASE_URL;
  const workspaceId = creds.config.workspace_id as string | undefined;

  const url = new URL(init.path.replace(/^\//, ""), baseUrl.replace(/\/?$/, "/"));
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (e: any) {
    return { ok: false, reason: `Network error calling Payroll Shack: ${e?.message ?? String(e)}` };
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  if (!response.ok) {
    console.error(`Payroll Shack ${init.method} ${init.path} failed [${response.status}]:`, text);
    return { ok: false, status: response.status, reason: `Payroll Shack ${response.status}`, body: text };
  }
  return { ok: true, data: parsed as T };
}

export interface PayrollShackEmployee {
  id: string;
  external_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  status?: string;
}

export interface PayrollShackPayRun {
  id: string;
  status: string;
  pay_date: string;
  net_pay_cents: number;
}

/** Verify credentials by calling a lightweight identity/ping endpoint. */
export async function pingPayrollShack(companyId: string) {
  return request<{ ok: boolean }>(companyId, { method: "GET", path: "/ping" });
}

export async function listEmployees(companyId: string, opts: { limit?: number; cursor?: string } = {}) {
  return request<{ data: PayrollShackEmployee[]; next_cursor?: string }>(companyId, {
    method: "GET",
    path: "/employees",
    query: { limit: opts.limit ?? 100, cursor: opts.cursor },
  });
}

export async function upsertEmployee(companyId: string, employee: Omit<PayrollShackEmployee, "id"> & { id?: string }) {
  return request<PayrollShackEmployee>(companyId, {
    method: employee.id ? "PUT" : "POST",
    path: employee.id ? `/employees/${employee.id}` : "/employees",
    body: employee,
  });
}

export async function createPayRun(companyId: string, input: {
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  entries: { employee_id: string; hours?: number; gross_cents: number }[];
}) {
  return request<PayrollShackPayRun>(companyId, {
    method: "POST",
    path: "/pay-runs",
    body: input,
  });
}

export async function getPayRun(companyId: string, payRunId: string) {
  return request<PayrollShackPayRun>(companyId, {
    method: "GET",
    path: `/pay-runs/${payRunId}`,
  });
}
