import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HELP_SYSTEM_PROMPT = `You are Paylo Helper — a friendly virtual assistant for employees inside the Paylo HR app.

You help employees with everyday questions:
- How to clock in/out, view their schedule, request time off, or swap shifts
- How to read their pay stubs, request early access to earned wages (Pay On-Demand), or update direct deposit details
- How to enroll in or check their benefits, file an expense, or submit a general request to HR/IT
- Company policies and self-service tasks they can do from the employee app

Style:
- Be warm, concise, and supportive. Use short paragraphs and bullet points.
- Offer step-by-step instructions naming the exact menu item (e.g. "open My Info → Direct Deposit").
- If something requires manager/HR action, tell the employee to submit a Request from the Requests page.
- Never invent policies, dollar amounts, dates, or legal advice. If unsure, say so and suggest contacting HR.
- Output clean markdown.`;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const chatWithHelpAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      messages: z.array(MessageSchema).min(1),
    })
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service not configured");
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: cu } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    const companyId = cu?.company_id as string | undefined;
    if (!companyId) throw new Error("No company context");

    // Single conversation per user with kind='help'
    let convoId: string | null = null;
    const { data: existing } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "help")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    convoId = existing?.id ?? null;

    if (!convoId) {
      const { data: created, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: userId, company_id: companyId, title: "Virtual Assistant", kind: "help" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      convoId = created.id as string;
    }

    const last = data.messages[data.messages.length - 1];
    if (last.role === "user") {
      await supabase.from("ai_messages").insert({
        conversation_id: convoId,
        user_id: userId,
        role: "user",
        content: last.content,
      });
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: HELP_SYSTEM_PROMPT }, ...data.messages],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const payload = await res.json();
    const reply: string = payload?.choices?.[0]?.message?.content ?? "I couldn't generate a response.";

    await supabase.from("ai_messages").insert({
      conversation_id: convoId,
      user_id: userId,
      role: "assistant",
      content: reply,
    });
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);

    return { conversationId: convoId, reply };
  });

export const clearHelpConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: convos } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "help");
    const ids = (convos ?? []).map((c: any) => c.id);
    if (ids.length) {
      await supabase.from("ai_messages").delete().in("conversation_id", ids);
      await supabase.from("ai_conversations").delete().in("id", ids);
    }
    return { ok: true };
  });
