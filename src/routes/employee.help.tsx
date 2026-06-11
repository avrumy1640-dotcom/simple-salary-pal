import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { chatWithHelpAssistant, clearHelpConversation } from "@/lib/help-assistant.functions";
import { Sparkles, Send, Loader2, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/employee/help")({
  head: () => ({ meta: [{ title: "Virtual Assistant — Paylo" }] }),
  component: EmployeeHelpPage,
});

type Msg = { id: string; role: "user" | "assistant" | "system"; content: string; created_at: string };

const SUGGESTIONS = [
  "How do I request time off?",
  "When is my next payday?",
  "How do I update my direct deposit?",
  "How do I swap a shift with a coworker?",
  "How do I file an expense for reimbursement?",
];

function EmployeeHelpPage() {
  const chat = useServerFn(chatWithHelpAssistant);
  const clear = useServerFn(clearHelpConversation);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function loadMessages() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: convo } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "help")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!convo) { setMessages([]); setLoading(false); return; }
    const { data } = await supabase
      .from("ai_messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", convo.id)
      .order("created_at", { ascending: true });
    setMessages((data as Msg[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadMessages(); }, []);
  useEffect(() => { inputRef.current?.focus(); }, [sending]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    const nextMessages = [...messages, optimistic];
    setMessages(nextMessages);
    setSending(true);
    try {
      const res = await chat({
        data: { messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) },
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.reply,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    if (!confirm("Clear this conversation?")) return;
    try {
      await clear({ data: undefined });
      setMessages([]);
      toast.success("Conversation cleared");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to clear");
    }
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col unit-in">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-soft">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-[24px] sm:text-[32px] font-extrabold tracking-tight text-slate-900">
              Virtual Assistant
            </h1>
            <p className="text-sm text-slate-500">Ask anything about your pay, schedule, benefits, or requests.</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={reset}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-soft flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-6">
              <div className="text-center mb-6">
                <div className="font-display text-xl font-bold text-slate-900">Hi! I'm your Paylo helper.</div>
                <p className="mt-1 text-sm text-slate-500">Try one of these to get started:</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left rounded-xl border border-border bg-slate-50 hover:bg-white hover:border-primary/40 transition p-3 text-sm text-slate-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-slate-50 text-slate-800",
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-headings:my-2">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-slate-600" />
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="rounded-2xl px-4 py-2.5 bg-slate-50 text-slate-500 text-sm flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 sm:p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex gap-2 items-end"
          >
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask anything about your job, pay, or schedule…"
              className="flex-1 resize-none min-h-[44px] max-h-[160px]"
              disabled={sending}
            />
            <Button type="submit" disabled={!input.trim() || sending} className="h-11">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <div className="mt-2 text-xs text-slate-400 text-center">
            Powered by Paylo AI. Responses may need verification.
          </div>
        </div>
      </div>
    </div>
  );
}
