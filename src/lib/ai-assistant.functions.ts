import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `You are Paylo HR — an expert AI assistant for HR, payroll, compliance, and people operations.

You help administrators, managers, and employees with:
- Payroll questions (gross-to-net, taxes, deductions, garnishments)
- Compliance (I-9, W-4, FLSA, ACA, FMLA, state-specific labor law)
- Benefits (health, 401(k), PTO, leave)
- Performance reviews, goals, and feedback
- Hiring, onboarding, terminations
- Tax filings (940, 941, W-2, 1099)

Style:
- Be concise, practical, and cite the relevant regulation or form when applicable.
- Use short paragraphs and bullet points.
- When the user describes a specific situation, ask a clarifying question only if essential.
- Never invent regulations. If unsure, say so and recommend consulting counsel.
- Output in clean markdown.`;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const chatWithAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid().nullable(),
      messages: z.array(MessageSchema).min(1),
    })
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service not configured");
    const { supabase, userId } = context as { supabase: any; userId: string };

    // Resolve company
    const { data: cu } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    const companyId = cu?.company_id as string | undefined;
    if (!companyId) throw new Error("No company context");

    // Ensure conversation
    let convoId = data.conversationId;
    if (!convoId) {
      const firstUserMsg = data.messages.find((m) => m.role === "user")?.content ?? "New conversation";
      const title = firstUserMsg.slice(0, 60);
      const { data: convo, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: userId, company_id: companyId, title })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      convoId = convo.id as string;
    }

    // Save the latest user message
    const last = data.messages[data.messages.length - 1];
    if (last.role === "user") {
      await supabase.from("ai_messages").insert({
        conversation_id: convoId,
        user_id: userId,
        role: "user",
        content: last.content,
      });
    }

    // Call Lovable AI Gateway (non-streaming, OpenAI-compatible)
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...data.messages,
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
      throw new Error(`AI error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const payload = await res.json();
    const reply: string =
      payload?.choices?.[0]?.message?.content ?? "I couldn't generate a response.";

    await supabase.from("ai_messages").insert({
      conversation_id: convoId,
      user_id: userId,
      role: "assistant",
      content: reply,
    });
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);

    return { conversationId: convoId, reply };
  });
