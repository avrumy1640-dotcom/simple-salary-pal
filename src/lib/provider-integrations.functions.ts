import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Payroll provider API-key vault.
 *
 * Keys (Symmetry, Modern Treasury, Plaid, etc.) are encrypted with AES-256-GCM
 * using PII_VAULT_KEY (same key as the PII vault) and stored in the
 * `provider_secrets` table. That table has RLS enabled with NO policies —
 * only these server functions (running under service_role) can read/write.
 *
 * Authorization: only owner/admin/payroll_admin of the company may
 * connect, rotate, or disconnect a provider.
 */

const PROVIDERS = [
  "symmetry",
  "modern_treasury",
  "plaid",
  "quickbooks",
  "xero",
  "slack",
  "google_workspace",
  "guideline_401k",
  "gusto_benefits",
  "payroll_shack",
] as const;
export type ProviderId = (typeof PROVIDERS)[number];

const PRIVILEGED = ["owner", "admin", "payroll_admin"] as const;

function getKey(): Buffer {
  const raw = process.env.PII_VAULT_KEY;
  if (!raw) throw new Error("Secrets vault is not configured (PII_VAULT_KEY missing).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PII_VAULT_KEY must decode to 32 bytes.");
  return key;
}

async function encrypt(plaintext: string) {
  const { createCipheriv, randomBytes } = await import("crypto");
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function last4(s: string): string {
  const cleaned = s.replace(/\s+/g, "");
  return cleaned.slice(-4);
}

async function assertPrivileged(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", PRIVILEGED as unknown as string[])
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: only owners, admins, or payroll admins can manage integrations.");
}

// ---------------------------------------------------------------------------
// listProviderIntegrations — returns status metadata for all providers in a company
// ---------------------------------------------------------------------------
const listSchema = z.object({ companyId: z.string().uuid() });

export const listProviderIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPrivileged(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: integrations }, { data: secrets }] = await Promise.all([
      supabaseAdmin
        .from("provider_integrations")
        .select("provider, status, config, last_synced_at, updated_at")
        .eq("company_id", data.companyId),
      supabaseAdmin
        .from("provider_secrets")
        .select("provider, last4_hint, updated_at")
        .eq("company_id", data.companyId),
    ]);

    const byProvider = new Map<string, any>();
    for (const row of integrations ?? []) byProvider.set(row.provider, { ...row, has_key: false, last4: null, key_updated_at: null });
    for (const s of secrets ?? []) {
      const existing = byProvider.get(s.provider) ?? { provider: s.provider, status: "connected", config: {}, last_synced_at: null, updated_at: s.updated_at };
      existing.has_key = true;
      existing.last4 = s.last4_hint;
      existing.key_updated_at = s.updated_at;
      byProvider.set(s.provider, existing);
    }
    return { items: Array.from(byProvider.values()) };
  });

// ---------------------------------------------------------------------------
// setProviderApiKey — encrypt + store an API key for a provider
// ---------------------------------------------------------------------------
const setSchema = z.object({
  companyId: z.string().uuid(),
  provider: z.enum(PROVIDERS),
  apiKey: z.string().trim().min(8, "API key looks too short").max(4096),
  extraConfig: z.record(z.string(), z.string().max(500)).optional(),
});

export const setProviderApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPrivileged(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { ciphertext, iv, authTag } = await encrypt(data.apiKey);
    const hint = last4(data.apiKey);

    const { error: secErr } = await supabaseAdmin.from("provider_secrets").upsert(
      {
        company_id: data.companyId,
        provider: data.provider,
        ciphertext: `\\x${ciphertext.toString("hex")}`,
        iv: `\\x${iv.toString("hex")}`,
        auth_tag: `\\x${authTag.toString("hex")}`,
        key_version: 1,
        last4_hint: hint,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,provider" },
    );
    if (secErr) throw new Error(secErr.message);

    // Upsert the integration record too (config is non-secret metadata only).
    const { error: intErr } = await supabaseAdmin.from("provider_integrations").upsert(
      {
        company_id: data.companyId,
        provider: data.provider,
        status: "connected",
        config: data.extraConfig ?? {},
        secret_ref: `provider_secrets:${data.companyId}:${data.provider}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,provider" },
    );
    if (intErr) throw new Error(intErr.message);

    return { ok: true, last4: hint };
  });

// ---------------------------------------------------------------------------
// deleteProviderApiKey — remove a stored key and mark integration disconnected
// ---------------------------------------------------------------------------
const delSchema = z.object({
  companyId: z.string().uuid(),
  provider: z.enum(PROVIDERS),
});

export const deleteProviderApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => delSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPrivileged(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: sErr } = await supabaseAdmin
      .from("provider_secrets")
      .delete()
      .eq("company_id", data.companyId)
      .eq("provider", data.provider);
    if (sErr) throw new Error(sErr.message);

    await supabaseAdmin
      .from("provider_integrations")
      .update({ status: "disconnected", updated_at: new Date().toISOString() })
      .eq("company_id", data.companyId)
      .eq("provider", data.provider);

    return { ok: true };
  });
