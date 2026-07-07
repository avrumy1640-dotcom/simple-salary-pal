// Server-only helper to decrypt a provider API key from `provider_secrets`.
// Never import this from client-reachable code — always load inside a
// server-function handler with `await import(...)`.

import type { ProviderId } from "@/lib/provider-integrations.functions";

function getKey(): Buffer {
  const raw = process.env.PII_VAULT_KEY;
  if (!raw) throw new Error("PII_VAULT_KEY missing");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PII_VAULT_KEY must decode to 32 bytes");
  return key;
}

function toBuf(v: unknown): Buffer {
  if (v && typeof v === "object" && "type" in (v as any) && (v as any).type === "Buffer") {
    return Buffer.from((v as any).data);
  }
  if (typeof v === "string") {
    if (v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
    return Buffer.from(v, "base64");
  }
  if (Buffer.isBuffer(v)) return v;
  throw new Error("Invalid ciphertext format");
}

/**
 * Load and decrypt the API key a company saved for a given provider.
 * Returns `null` when no key is on file. Also returns the non-secret
 * config JSON (e.g. base URL, org id) stored on `provider_integrations`.
 */
export async function readProviderCredentials(
  companyId: string,
  provider: ProviderId,
): Promise<{ apiKey: string; config: Record<string, unknown> } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: sec }, { data: integ }] = await Promise.all([
    supabaseAdmin
      .from("provider_secrets")
      .select("ciphertext, iv, auth_tag")
      .eq("company_id", companyId)
      .eq("provider", provider)
      .maybeSingle(),
    supabaseAdmin
      .from("provider_integrations")
      .select("config")
      .eq("company_id", companyId)
      .eq("provider", provider)
      .maybeSingle(),
  ]);
  if (!sec) return null;

  const { createDecipheriv } = await import("crypto");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), toBuf(sec.iv));
  decipher.setAuthTag(toBuf(sec.auth_tag));
  const apiKey = Buffer.concat([
    decipher.update(toBuf(sec.ciphertext)),
    decipher.final(),
  ]).toString("utf8");

  return { apiKey, config: (integ?.config as Record<string, unknown>) ?? {} };
}
