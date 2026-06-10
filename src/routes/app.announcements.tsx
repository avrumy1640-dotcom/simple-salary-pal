import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Megaphone, Plus, Pin, Trash2, Send, AlertTriangle, Sparkles, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/app/announcements")({
  head: () => ({ meta: [{ title: "Announcements — Paylo" }] }),
  component: AnnouncementsPage,
});

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  priority: "normal" | "important" | "urgent";
  status: "draft" | "scheduled" | "published" | "archived";
  pinned: boolean;
  publish_at: string | null;
  published_at: string | null;
  created_at: string;
  author_id: string;
};

function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [reads, setReads] = useState<Record<string, number>>({});
  const [totalEmployees, setTotalEmployees] = useState(0);

  async function load() {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    const { data: cu } = await supabase
      .from("company_users").select("company_id").eq("user_id", uid)
      .order("is_default", { ascending: false }).limit(1).maybeSingle();
    const cid = cu?.company_id as string | undefined;
    if (!cid) { setLoading(false); return; }
    setCompanyId(cid);

    const [{ data, error }, { count }] = await Promise.all([
      supabase.from("announcements").select("*").eq("company_id", cid).order("pinned", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("employees").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("status", "active"),
    ]);
    if (error) toast.error(error.message);
    setItems((data as Announcement[]) ?? []);
    setTotalEmployees(count ?? 0);

    // read counts
    const ids = (data ?? []).map((a: any) => a.id);
    if (ids.length) {
      const counts: Record<string, number> = {};
      for (const id of ids) {
        const { count: c } = await supabase
          .from("announcement_reads").select("*", { count: "exact", head: true })
          .eq("announcement_id", id);
        counts[id] = c ?? 0;
      }
      setReads(counts);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  async function togglePin(a: Announcement) {
    await supabase.from("announcements").update({ pinned: !a.pinned }).eq("id", a.id);
    load();
  }
  async function publish(a: Announcement) {
    await supabase.from("announcements").update({ status: "published", published_at: new Date().toISOString() }).eq("id", a.id);
    toast.success("Announcement published");
    load();
  }
  async function archive(a: Announcement) {
    await supabase.from("announcements").update({ status: "archived" }).eq("id", a.id);
    load();
  }
  async function remove(a: Announcement) {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("announcements").delete().eq("id", a.id);
    load();
  }

  const published = items.filter((i) => i.status === "published").length;
  const drafts = items.filter((i) => i.status === "draft").length;
  const urgent = items.filter((i) => i.priority === "urgent" && i.status === "published").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Broadcast updates, policy changes, and reminders across your workforce."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-brand text-primary-foreground">
                <Plus className="mr-1 h-4 w-4" /> New announcement
              </Button>
            </DialogTrigger>
            <ComposerDialog companyId={companyId} onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        }
      />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: items.length, icon: Megaphone, tone: "default" },
          { label: "Published", value: published, icon: Send, tone: "success" },
          { label: "Drafts", value: drafts, icon: Sparkles, tone: "default" },
          { label: "Urgent live", value: urgent, icon: AlertTriangle, tone: urgent > 0 ? "destructive" : "default" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</span>
              <s.icon className={cn("h-4 w-4",
                s.tone === "success" && "text-success",
                s.tone === "destructive" && "text-destructive",
                s.tone === "default" && "text-slate-400")} />
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {(["all", "published", "draft"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 text-xs font-semibold rounded-md capitalize",
              filter === f ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-100")}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Send your first company-wide update — payroll changes, holiday hours, new benefits — and reach every employee in seconds."
          action={
            <Button size="sm" className="gradient-brand text-primary-foreground" onClick={() => setOpen(true)}>
              Create announcement
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <article key={a.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                    <h3 className="font-display text-base font-bold text-slate-900">{a.title}</h3>
                    <Badge variant="secondary" className={cn(
                      a.priority === "urgent" && "bg-destructive/15 text-destructive hover:bg-destructive/15",
                      a.priority === "important" && "bg-warning/15 text-warning hover:bg-warning/15",
                      a.priority === "normal" && "bg-slate-100 text-slate-600 hover:bg-slate-100",
                    )}>
                      {a.priority}
                    </Badge>
                    <Badge variant="outline" className="capitalize">{a.status}</Badge>
                    <Badge variant="outline" className="capitalize">{a.audience}</Badge>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>{a.published_at ? `Published ${format(new Date(a.published_at), "MMM d, yyyy")}` : `Created ${format(new Date(a.created_at), "MMM d, yyyy")}`}</span>
                    {a.status === "published" && totalEmployees > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {reads[a.id] ?? 0} / {totalEmployees} read
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => togglePin(a)} title="Pin">
                      <Pin className={cn("h-4 w-4", a.pinned && "fill-primary text-primary")} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a)} title="Delete">
                      <Trash2 className="h-4 w-4 text-slate-400 hover:text-destructive" />
                    </Button>
                  </div>
                  {a.status === "draft" && (
                    <Button size="sm" onClick={() => publish(a)} className="gradient-brand text-primary-foreground">
                      <Send className="mr-1 h-3.5 w-3.5" /> Publish
                    </Button>
                  )}
                  {a.status === "published" && (
                    <Button size="sm" variant="outline" onClick={() => archive(a)}>Archive</Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ComposerDialog({ companyId, onSaved }: { companyId: string | null; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "urgent">("normal");
  const [audience, setAudience] = useState<"all" | "department" | "role">("all");
  const [saving, setSaving] = useState(false);

  async function save(status: "draft" | "published") {
    if (!companyId) return;
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setSaving(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session!.user.id;
    const { error } = await supabase.from("announcements").insert({
      company_id: companyId,
      author_id: uid,
      title: title.trim(),
      body: body.trim(),
      priority,
      audience,
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "published" ? "Published" : "Saved as draft");
    setTitle(""); setBody(""); setPriority("normal"); setAudience("all");
    onSaved();
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>New announcement</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Holiday schedule update" />
        </div>
        <div>
          <Label htmlFor="body">Message</Label>
          <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Hi team — we'll be closed Monday…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="important">Important</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v: any) => setAudience(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole company</SelectItem>
                <SelectItem value="department">By department</SelectItem>
                <SelectItem value="role">By role</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => save("draft")} disabled={saving}>Save draft</Button>
        <Button onClick={() => save("published")} disabled={saving} className="gradient-brand text-primary-foreground">
          <Send className="mr-1 h-4 w-4" /> Publish now
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
