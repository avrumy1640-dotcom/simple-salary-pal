import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============================================================================
// EMERGENCY CONTACTS
// ============================================================================

const contactInput = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  relationship: z.string().trim().max(60).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(160).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  is_primary: z.boolean().optional(),
});

export const listEmergencyContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employee_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("emergency_contacts")
      .select("*")
      .eq("employee_id", data.employee_id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const upsertEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: emp, error: empErr } = await context.supabase
      .from("employees")
      .select("id, company_id")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (empErr || !emp) throw new Error("Employee not found");

    if (data.is_primary) {
      // Clear other primaries first
      await context.supabase
        .from("emergency_contacts")
        .update({ is_primary: false })
        .eq("employee_id", data.employee_id)
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }

    const payload = {
      id: data.id,
      company_id: emp.company_id,
      employee_id: data.employee_id,
      name: data.name,
      relationship: data.relationship ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      is_primary: !!data.is_primary,
    };
    const { data: row, error } = data.id
      ? await context.supabase.from("emergency_contacts").update(payload).eq("id", data.id).select().single()
      : await context.supabase.from("emergency_contacts").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return { contact: row };
  });

export const deleteEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("emergency_contacts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// DIRECT DEPOSIT ACCOUNTS (split deposits)
// ============================================================================

const PRIVILEGED = ["owner", "admin", "payroll_admin", "hr_admin"] as const;

async function isPrivileged(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("role", PRIVILEGED as unknown as string[])
    .limit(1)
    .maybeSingle();
  return !!data;
}

export const listDirectDepositAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employee_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("direct_deposit_accounts")
      .select("id, nickname, account_type, bank_name, routing_last4, account_last4, split_type, split_value, priority, active, verified_at, created_at")
      .eq("employee_id", data.employee_id)
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

const ddInput = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  nickname: z.string().trim().max(60).optional().nullable(),
  account_type: z.enum(["checking", "savings"]),
  bank_name: z.string().trim().max(120).optional().nullable(),
  routing_number: z.string().regex(/^\d{9}$/).optional(),
  account_number: z.string().regex(/^\d{4,17}$/).optional(),
  split_type: z.enum(["percent", "fixed", "remainder"]),
  split_value: z.number().positive().nullable().optional(),
  priority: z.number().int().min(1).max(10).optional(),
  active: z.boolean().optional(),
});

export const upsertDirectDepositAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ddInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: emp } = await context.supabase
      .from("employees")
      .select("id, company_id")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (!emp) throw new Error("Employee not found");

    const privileged = await isPrivileged(context.supabase, context.userId, emp.company_id);
    if (!privileged) throw new Error("Direct deposit changes must be made by HR or payroll admin.");

    // For 'remainder' force split_value null; for 'percent'/'fixed' require it
    let splitValue: number | null = data.split_value ?? null;
    if (data.split_type === "remainder") splitValue = null;
    if (data.split_type !== "remainder" && (splitValue == null || splitValue <= 0)) {
      throw new Error("Split value is required for percent or fixed splits.");
    }
    if (data.split_type === "percent" && splitValue! > 100) {
      throw new Error("Percent split cannot exceed 100.");
    }

    const routingLast4 = data.routing_number ? data.routing_number.slice(-4) : undefined;
    const accountLast4 = data.account_number ? data.account_number.slice(-4) : undefined;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: Record<string, unknown> = {
      company_id: emp.company_id,
      employee_id: emp.id,
      nickname: data.nickname ?? null,
      account_type: data.account_type,
      bank_name: data.bank_name ?? null,
      split_type: data.split_type,
      split_value: splitValue,
      priority: data.priority ?? 1,
      active: data.active ?? true,
    };
    if (routingLast4) payload.routing_last4 = routingLast4;
    if (accountLast4) payload.account_last4 = accountLast4;

    const { data: row, error } = data.id
      ? await supabaseAdmin.from("direct_deposit_accounts").update(payload).eq("id", data.id).select().single()
      : await supabaseAdmin.from("direct_deposit_accounts").insert(payload).select().single();
    if (error) throw new Error(error.message);

    // Store full account/routing in PII vault (encrypted)
    if (data.routing_number || data.account_number) {
      const { createCipheriv, randomBytes } = await import("crypto");
      const keyRaw = process.env.PII_VAULT_KEY;
      if (keyRaw) {
        const key = Buffer.from(keyRaw, "base64");
        if (key.length === 32) {
          const encryptFn = (pt: string) => {
            const iv = randomBytes(12);
            const c = createCipheriv("aes-256-gcm", key, iv);
            const ct = Buffer.concat([c.update(pt, "utf8"), c.final()]);
            return { ciphertext: `\\x${ct.toString("hex")}`, iv: `\\x${iv.toString("hex")}`, auth_tag: `\\x${c.getAuthTag().toString("hex")}` };
          };
          if (data.account_number) {
            const enc = encryptFn(data.account_number);
            await supabaseAdmin.from("pii_secrets").upsert(
              {
                company_id: emp.company_id,
                employee_id: emp.id,
                dd_account_id: row.id,
                kind: "bank_account",
                ...enc,
                last4_hint: accountLast4,
                created_by: context.userId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "dd_account_id,kind" },
            );
          }
          if (data.routing_number) {
            const enc = encryptFn(data.routing_number);
            await supabaseAdmin.from("pii_secrets").upsert(
              {
                company_id: emp.company_id,
                employee_id: emp.id,
                dd_account_id: row.id,
                kind: "bank_routing",
                ...enc,
                last4_hint: routingLast4,
                created_by: context.userId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "dd_account_id,kind" },
            );
          }
          await supabaseAdmin.from("pii_access_log").insert({
            company_id: emp.company_id,
            actor_id: context.userId,
            employee_id: emp.id,
            kind: "bank_account",
            action: "write",
            reason: "Direct deposit account updated",
            success: true,
          });
        }
      }
    }

    return { account: row };
  });

export const deleteDirectDepositAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Look up company so RLS works AND we can authorize
    const { data: acct } = await context.supabase
      .from("direct_deposit_accounts")
      .select("id, company_id, employee_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!acct) throw new Error("Account not found");
    const privileged = await isPrivileged(context.supabase, context.userId, acct.company_id);
    if (!privileged) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("pii_secrets").delete().eq("dd_account_id", data.id);
    await supabaseAdmin.from("direct_deposit_accounts").delete().eq("id", data.id);
    await supabaseAdmin.from("pii_access_log").insert({
      company_id: acct.company_id,
      actor_id: context.userId,
      employee_id: acct.employee_id,
      kind: "bank_account",
      action: "delete",
      reason: "Direct deposit account removed",
      success: true,
    });
    return { ok: true };
  });
