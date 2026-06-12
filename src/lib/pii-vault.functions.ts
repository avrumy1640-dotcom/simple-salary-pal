import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * PII Vault server functions.
 *
 * All encryption uses AES-256-GCM with a 32-byte key sourced from the
 * PII_VAULT_KEY environment variable (base64-encoded). The key NEVER touches
 * the database. Every read, write, and denied attempt is recorded in
 * `pii_access_log`.
 *
 * Authorization model:
 *  - Read full plaintext: owner, admin, payroll_admin, hr_admin (audit-logged).
 *  - Write: same set.
 *  - Read last4: same set, plus the employee themself (self-read).
 *  - Auditors can read the access log but NOT the ciphertext or plaintext.
 */

const PII_KINDS = ["ssn", "bank_account", "bank_routing", "tax_id", "drivers_license", "passport"] as const;
type PiiKind = (typeof PII_KINDS)[number];

const PRIVILEGED_ROLES = ["owner", "admin", "payroll_admin", "hr_admin"] as const;

function getKey(): Buffer {
  const raw = process.env.PII_VAULT_KEY;
  if (!raw) throw new Error("PII vault is not configured (PII_VAULT_KEY missing).");
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("PII_VAULT_KEY is not valid base64.");
  }
  if (key.length !== 32) {
    throw new Error(`PII_VAULT_KEY must decode to 32 bytes (got ${key.length}).`);
  }
  return key;
}

async function encrypt(plaintext: string): Promise<{ ciphertext: Buffer; iv: Buffer; authTag: Buffer }> {
  const { createCipheriv, randomBytes } = await import("crypto");
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

async function decrypt(ciphertext: Buffer, iv: Buffer, authTag: Buffer): Promise<string> {
  const { createDecipheriv } = await import("crypto");
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

function last4(s: string): string {
  const digits = s.replace(/\D/g, "");
  return digits.slice(-4);
}

async function userHasPrivilegedRole(supabase: any, userId: string, companyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", PRIVILEGED_ROLES as unknown as string[])
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function logAccess(
  supabaseAdmin: any,
  args: {
    companyId: string;
    actorId: string | null;
    employeeId?: string | null;
    contractorId?: string | null;
    kind: PiiKind;
    action: "read" | "write" | "delete" | "attempt_denied";
    reason?: string;
    success: boolean;
    context?: Record<string, unknown>;
  },
) {
  await supabaseAdmin.from("pii_access_log").insert({
    company_id: args.companyId,
    actor_id: args.actorId,
    employee_id: args.employeeId ?? null,
    contractor_id: args.contractorId ?? null,
    kind: args.kind,
    action: args.action,
    reason: args.reason ?? null,
    success: args.success,
    context: args.context ?? null,
  });
}

// ---------------------------------------------------------------------------
// setEmployeePii — store/replace a PII secret for an employee
// ---------------------------------------------------------------------------
const setSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(PII_KINDS),
  plaintext: z.string().trim().min(1).max(64),
  reason: z.string().trim().max(200).optional(),
});

export const setEmployeePii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => setSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: employee, error: empErr } = await supabaseAdmin
      .from("employees")
      .select("id, company_id")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (empErr || !employee) throw new Error("Employee not found");

    const allowed = await userHasPrivilegedRole(context.supabase, context.userId, employee.company_id);
    if (!allowed) {
      await logAccess(supabaseAdmin, {
        companyId: employee.company_id,
        actorId: context.userId,
        employeeId: employee.id,
        kind: data.kind,
        action: "attempt_denied",
        reason: data.reason,
        success: false,
      });
      throw new Error("Forbidden: you do not have permission to write PII for this employee.");
    }

    const { ciphertext, iv, authTag } = await encrypt(data.plaintext);
    const hint = last4(data.plaintext);

    const { error: upsertErr } = await supabaseAdmin
      .from("pii_secrets")
      .upsert(
        {
          company_id: employee.company_id,
          employee_id: employee.id,
          kind: data.kind,
          ciphertext,
          iv,
          auth_tag: authTag,
          key_version: 1,
          last4_hint: hint,
          created_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "employee_id,kind" },
      );
    if (upsertErr) throw new Error(upsertErr.message);

    // Mirror last4 into employees for fast reads where applicable
    if (data.kind === "ssn") {
      await supabaseAdmin.from("employees").update({ ssn_last4: hint }).eq("id", employee.id);
    }

    await logAccess(supabaseAdmin, {
      companyId: employee.company_id,
      actorId: context.userId,
      employeeId: employee.id,
      kind: data.kind,
      action: "write",
      reason: data.reason,
      success: true,
    });

    return { ok: true, last4: hint };
  });

// ---------------------------------------------------------------------------
// revealEmployeePii — return plaintext (heavily audited)
// ---------------------------------------------------------------------------
const revealSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(PII_KINDS),
  reason: z.string().trim().min(3).max(200),
});

export const revealEmployeePii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => revealSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("id, company_id")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!employee) throw new Error("Employee not found");

    const allowed = await userHasPrivilegedRole(context.supabase, context.userId, employee.company_id);
    if (!allowed) {
      await logAccess(supabaseAdmin, {
        companyId: employee.company_id,
        actorId: context.userId,
        employeeId: employee.id,
        kind: data.kind,
        action: "attempt_denied",
        reason: data.reason,
        success: false,
      });
      throw new Error("Forbidden: you do not have permission to view this PII.");
    }

    const { data: row, error: readErr } = await supabaseAdmin
      .from("pii_secrets")
      .select("ciphertext, iv, auth_tag")
      .eq("employee_id", employee.id)
      .eq("kind", data.kind)
      .maybeSingle();

    if (readErr || !row) {
      await logAccess(supabaseAdmin, {
        companyId: employee.company_id,
        actorId: context.userId,
        employeeId: employee.id,
        kind: data.kind,
        action: "read",
        reason: data.reason,
        success: false,
      });
      throw new Error("PII not on file for this employee.");
    }

    // Supabase returns bytea as string ("\x...") OR base64; coerce to Buffer.
    const toBuf = (v: unknown): Buffer => {
      if (Buffer.isBuffer(v)) return v;
      if (typeof v === "string") {
        if (v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
        return Buffer.from(v, "base64");
      }
      throw new Error("Invalid PII storage format");
    };

    const plaintext = await decrypt(toBuf(row.ciphertext), toBuf(row.iv), toBuf(row.auth_tag));

    await logAccess(supabaseAdmin, {
      companyId: employee.company_id,
      actorId: context.userId,
      employeeId: employee.id,
      kind: data.kind,
      action: "read",
      reason: data.reason,
      success: true,
      context: { client_ip: null }, // can be filled from headers in future
    });

    return { plaintext };
  });

// ---------------------------------------------------------------------------
// listEmployeePiiKinds — list which kinds are on file (no plaintext)
// ---------------------------------------------------------------------------
const listSchema = z.object({ employeeId: z.string().uuid() });

export const listEmployeePiiKinds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("id, company_id, user_id")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!employee) throw new Error("Employee not found");

    const isSelf = employee.user_id === context.userId;
    const allowed =
      isSelf || (await userHasPrivilegedRole(context.supabase, context.userId, employee.company_id));
    if (!allowed) throw new Error("Forbidden");

    const { data: rows } = await supabaseAdmin
      .from("pii_secrets")
      .select("kind, last4_hint, updated_at")
      .eq("employee_id", employee.id);
    return { items: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// deleteEmployeePii — remove a stored secret (audited)
// ---------------------------------------------------------------------------
const deleteSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(PII_KINDS),
  reason: z.string().trim().min(3).max(200),
});

export const deleteEmployeePii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("id, company_id")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!employee) throw new Error("Employee not found");

    const allowed = await userHasPrivilegedRole(context.supabase, context.userId, employee.company_id);
    if (!allowed) {
      await logAccess(supabaseAdmin, {
        companyId: employee.company_id,
        actorId: context.userId,
        employeeId: employee.id,
        kind: data.kind,
        action: "attempt_denied",
        reason: data.reason,
        success: false,
      });
      throw new Error("Forbidden");
    }

    const { error } = await supabaseAdmin
      .from("pii_secrets")
      .delete()
      .eq("employee_id", employee.id)
      .eq("kind", data.kind);
    if (error) throw new Error(error.message);

    await logAccess(supabaseAdmin, {
      companyId: employee.company_id,
      actorId: context.userId,
      employeeId: employee.id,
      kind: data.kind,
      action: "delete",
      reason: data.reason,
      success: true,
    });

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// listPiiAccessLog — admin/auditor view of access events
// ---------------------------------------------------------------------------
const logQuerySchema = z.object({
  companyId: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const listPiiAccessLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => logQuerySchema.parse(data))
  .handler(async ({ data, context }) => {
    // RLS on pii_access_log already restricts to owner/admin/auditor.
    let q = context.supabase
      .from("pii_access_log")
      .select("id, actor_id, employee_id, kind, action, reason, success, occurred_at, context")
      .eq("company_id", data.companyId)
      .order("occurred_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.employeeId) q = q.eq("employee_id", data.employeeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });
