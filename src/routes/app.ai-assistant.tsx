import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { chatWithAssistant } from "@/lib/ai-assistant.functions";
import { Bot, Plus, Send, Trash2, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ai-assistant")({
  head: () => ({ meta: [{ title: "AI HR Assistant — Paylo" }] }),
  component: AIAssistantPage,
});

type Convo = { id: string; title: string; updated_at: string; pinned: boolean };
type Msg = { id: string; role: "user" | "assistant" | "system"; content: string; created_at: string };

const SUGGESTIONS = [
  "How do I run a final paycheck for a terminated employee in California?",
  "Draft a PTO policy for a 25-person SaaS startup.",
  "Explain Form 941 vs Form 940 in plain English.",
  "Generate an onboarding checklist for a new remote engineer.",
  "What's the FLSA overtime rule for salaried non-exempt employees?",
];

function AIAssistantPage() {
  const chat = useServerFn(chatWithAssistant);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadConvos() {
    const { data } = await supabase
      .from("ai_conversations")
      .select("id,title,updated_at,pinned")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);
    setConvos((data as Convo[]) ?? []);
  }

  async function loadMessages(id: string) {
    const { data } = await supabase
      .from("ai_messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    setMessages((data as Msg[]) ?? []);
  }

  useEffect(() => {
    loadConvos();
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
    else setMessages([]);
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);

    const optimisticUser: Msg = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    const history = [...messages, optimisticUser];
    setMessages(history);

    try {
      const result = await chat({
        data: {
          conversationId: activeId,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (!activeId) {
        setActiveId(result.conversationId);
        await loadConvos();
      } else {
        loadConvos();
      }
      await loadMessages(result.conversationId);
    } catch (e: any) {
      toast.error(e?.message || "Failed to reach AI assistant");
      setMessages((m) => m.filter((x) => x.id !== optimisticUser.id));
    } finally {
      setSending(false);
    }
  }

  async function deleteConvo(id: string) {
    await supabase.from("ai_conversations").delete().eq("id", id);
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    loadConvos();
  }

  function newConvo() {
    setActiveId(null);
    setMessages([]);
    setInput("");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI HR Assistant"
        description="Ask anything about payroll, compliance, benefits, and people operations. Trained on US HR best practices."
        actions={
          <Button size="sm" variant="outline" onClick={newConvo}>
            <Plus className="mr-1 h-4 w-4" /> New chat
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Conversations
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {convos.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-slate-500">
                Your chats will appear here.
              </div>
            ) : (
              convos.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer",
                    activeId === c.id ? "bg-primary/10 text-slate-900" : "hover:bg-slate-50 text-slate-700"
                  )}
                  onClick={() => setActiveId(c.id)}
                >
                  <span className="truncate">{c.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConvo(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-destructive"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chat area */}
        <section className="flex h-[68vh] flex-col rounded-xl border border-border bg-card">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl gradient-brand text-primary-foreground shadow-lg">
                  <Bot className="h-7 w-7" />
                </div>
                <h2 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
                  How can I help you today?
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  I can answer payroll, compliance, and HR questions for your team.
                </p>
                <div className="mx-auto mt-6 grid max-w-xl gap-2 text-left">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-700 hover:border-primary hover:bg-primary/5 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-5">
                {messages.map((m) => (
                  <div key={m.id} className="flex gap-3">
                    <div
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                        m.role === "user"
                          ? "bg-slate-200 text-slate-700"
                          : "gradient-brand text-primary-foreground"
                      )}
                    >
                      {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-500 mb-1">
                        {m.role === "user" ? "You" : "Paylo HR"}
                      </div>
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-800">
                        {m.content}
                      </div>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-lg gradient-brand text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking…
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about payroll, taxes, compliance, benefits…"
                rows={1}
                className="min-h-[44px] max-h-40 resize-none"
                disabled={sending}
              />
              <Button onClick={() => send()} disabled={sending || !input.trim()} size="icon" className="h-11 w-11 gradient-brand text-primary-foreground">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-slate-400">
              AI responses can be inaccurate. Verify regulatory advice with qualified counsel.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
