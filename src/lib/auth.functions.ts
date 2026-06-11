import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const setupSchema = z.object({
  accountType: z.enum(["employer", "employee"]),
  fullName: z.string().trim().min(1).max(120),
  companyName: z.string().trim().max(120).optional(),
});

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

export const completeAccountSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => setupSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { firstName, lastName } = splitName(data.fullName);
    const companyName = data.accountType === "employer" ? (data.companyName?.trim() || "My Company") : undefined;

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: context.userId,
      full_name: data.fullName.trim(),
      first_name: firstName,
      last_name: lastName,
      company_name: companyName ?? null,
      account_type: data.accountType,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) throw new Error(profileError.message);

    if (data.accountType === "employer") {
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("company_id")
        .eq("user_id", context.userId)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();

      let companyId = existingRole?.company_id as string | undefined;
      if (companyId) {
        await supabaseAdmin.from("companies").update({ legal_name: companyName }).eq("id", companyId);
      } else {
        const { data: company, error: companyError } = await supabaseAdmin
          .from("companies")
          .insert({ owner_id: context.userId, legal_name: companyName })
          .select("id")
          .single();
        if (companyError) throw new Error(companyError.message);
        companyId = company.id;

        const { error: membershipError } = await supabaseAdmin.from("company_users").upsert({
          company_id: companyId,
          user_id: context.userId,
          is_default: true,
          accepted_at: new Date().toISOString(),
        }, { onConflict: "company_id,user_id" });
        if (membershipError) throw new Error(membershipError.message);

        const { error: roleError } = await supabaseAdmin.from("user_roles").upsert({
          user_id: context.userId,
          company_id: companyId,
          role: "owner",
        }, { onConflict: "user_id,company_id,role" });
        if (roleError) throw new Error(roleError.message);
      }
    }

    return { ok: true, destination: data.accountType };
  });