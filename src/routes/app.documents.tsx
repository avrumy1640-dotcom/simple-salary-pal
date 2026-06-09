import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Download, CheckCircle2, Search, History, PenLine, XCircle, Eye } from "lucide-react";

export const Route = createFileRoute("/app/documents")({
  head: () => ({ meta: [{ title: "HR documents — Paylo" }] }),
  component: DocumentsPage,
});

interface Person { id: string; full_name: string; kind: "employee" | "contractor" }
interface Doc {
  id: string; title: string; category: string; storage_path: string | null;
  file_name: string | null; file_size: number | null; mime_type: string | null;
  notes: string | null; employee_id: string | null; contractor_id: string | null;
  uploaded_at: string;
  signed_by_name: string | null; signed_by_email: string | null;
  signature_status: string; signature_requested_at: string | null; signature_ip: string | null;
}
interface SigEvent {
  id: string; document_id: string; status: string;
  signed_by_name: string | null; signed_by_email: string | null;
  signature_ip: string | null; note: string | null; event_at: string;
}

const CATEGORIES = [
  { value: "offer_letter", label: "Offer letter" },
  { value: "i9", label: "I-9" },
  { value: "w4", label: "W-4" },
  { value: "w9", label: "W-9" },
  { value: "handbook", label: "Handbook acknowledgment" },
  { value: "id", label: "ID / verification" },
  { value: "contract", label: "Contract / agreement" },
  { value: "other", label: "Other" },
];

const STATUS_STYLES: Record<string, string> = {
  unsigned: "bg-muted text-muted-foreground",
  requested: "bg-amber-100 text-amber-900",
  viewed: "bg-sky-100 text-sky-900",
  signed: "bg-emerald-100 text-emerald-900",
  declined: "bg-rose-100 text-rose-900",
  voided: "bg-zinc-200 text-zinc-700",
};

function bytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ person: "", title: "", category: "other", notes: "" });
  const [signOpen, setSignOpen] = useState<Doc | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Doc | null>(null);
  const [history, setHistory] = useState<SigEvent[]>([]);
  const [signForm, setSignForm] = useState({ name: "", email: "", note: "" });

  async function refresh() {
    const [{ data: emps }, { data: cons }, { data: d }] = await Promise.all([
      supabase.from("employees").select("id, full_name").order("full_name"),
      supabase.from("contractors").select("id, full_name").order("full_name"),
      supabase.from("hr_documents").select("*").order("uploaded_at", { ascending: false }),
    ]);
    setPeople([
      ...((emps ?? []) as any[]).map((e) => ({ id: e.id, full_name: e.full_name, kind: "employee" as const })),
      ...((cons ?? []) as any[]).map((c) => ({ id: c.id, full_name: c.full_name, kind: "contractor" as const })),
    ]);
    setDocs((d ?? []) as Doc[]);
  }
  useEffect(() => { refresh(); }, []);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Choose a file to upload"); return; }
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error("Max file size is 25 MB"); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Please sign in again"); return; }
      const person = people.find((p) => p.id === form.person);
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${form.category}/${Date.now()}_${cleanName}`;
      const { error: upErr } = await supabase.storage.from("hr-documents").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || undefined,
      });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("hr_documents").insert({
        owner_id: user.id,
        employee_id: person?.kind === "employee" ? person.id : null,
        contractor_id: person?.kind === "contractor" ? person.id : null,
        title: form.title.trim(),
        category: form.category,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        notes: form.notes.trim() || null,
      });
      if (insErr) throw insErr;
      toast.success("Document uploaded");
      setOpen(false);
      setForm({ person: "", title: "", category: "other", notes: "" });
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally { setBusy(false); }
  }

  async function download(d: Doc) {
    if (!d.storage_path) { toast.error("No file attached"); return; }
    const { data, error } = await supabase.storage.from("hr-documents").createSignedUrl(d.storage_path, 60);
    if (error || !data) { toast.error(error?.message || "Could not get link"); return; }
    // Log a 'viewed' event
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("hr_document_signatures").insert({
        document_id: d.id, user_id: user.id, status: "viewed", note: "Document downloaded",
      });
    }
    window.open(data.signedUrl, "_blank");
  }

  async function remove(d: Doc) {
    if (!confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    if (d.storage_path) await supabase.storage.from("hr-documents").remove([d.storage_path]);
    await supabase.from("hr_documents").delete().eq("id", d.id);
    toast.success("Deleted");
    refresh();
  }

  async function requestSignature(d: Doc) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const now = new Date().toISOString();
    await supabase.from("hr_documents").update({
      signature_status: "requested",
      signature_requested_at: now,
    }).eq("id", d.id);
    await supabase.from("hr_document_signatures").insert({
      document_id: d.id, user_id: user.id, status: "requested", note: "Signature requested",
    });
    toast.success("Signature requested");
    refresh();
  }

  async function submitSignature() {
    if (!signOpen) return;
    if (!signForm.name.trim()) { toast.error("Signer name is required"); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Best-effort IP capture
      let ip: string | null = null;
      try {
        const r = await fetch("https://api.ipify.org?format=json");
        if (r.ok) ip = (await r.json()).ip ?? null;
      } catch {}
      const now = new Date().toISOString();
      const { error: upErr } = await supabase.from("hr_documents").update({
        signature_status: "signed",
        signed_by_name: signForm.name.trim(),
        signed_by_email: signForm.email.trim() || null,
        signed_by_user_id: user.id,
        signature_ip: ip,
      }).eq("id", signOpen.id);
      if (upErr) throw upErr;
      const { error: hErr } = await supabase.from("hr_document_signatures").insert({
        document_id: signOpen.id, user_id: user.id, status: "signed",
        signed_by_name: signForm.name.trim(), signed_by_email: signForm.email.trim() || null,
        signed_by_user_id: user.id,
        signature_ip: ip,
        signature_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
        note: signForm.note.trim() || null,
      });
      if (hErr) throw hErr;
      toast.success(`Signed at ${new Date(now).toLocaleString()}`);
      setSignOpen(null);
      setSignForm({ name: "", email: "", note: "" });
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function voidSignature(d: Doc) {
    if (!confirm(`Void signature on "${d.title}"?`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("hr_documents").update({
      signature_status: "voided", signed_by_name: null, signed_by_email: null, signed_by_user_id: null,
    }).eq("id", d.id);
    await supabase.from("hr_document_signatures").insert({
      document_id: d.id, user_id: user.id, status: "voided", note: "Signature voided",
    });
    toast.success("Signature voided");
    refresh();
  }

  async function openHistory(d: Doc) {
    setHistoryOpen(d);
    const { data } = await supabase.from("hr_document_signatures")
      .select("*").eq("document_id", d.id).order("event_at", { ascending: false });
    setHistory((data ?? []) as SigEvent[]);
  }

  const filtered = docs.filter((d) => {
    if (filter !== "all" && d.category !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      const personName = people.find((p) => p.id === (d.employee_id || d.contractor_id))?.full_name ?? "";
      if (!d.title.toLowerCase().includes(q) && !personName.toLowerCase().includes(q) && !(d.signed_by_name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">HR documents</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Request signatures, capture signer name, email, IP, and timestamp, and keep a full audit history for every document.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full bg-foreground text-white hover:opacity-90"><Upload className="h-4 w-4" /> Upload</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload HR document</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Offer letter — Jamie Chen" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Person (optional)</Label>
                  <Select value={form.person || "none"} onValueChange={(v) => setForm({ ...form, person: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} · {p.kind === "employee" ? "W-2" : "1099"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>File</Label>
                <Input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt" />
                <p className="mt-1 text-xs text-muted-foreground">PDF, image, or Word doc. Max 25 MB.</p>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={upload} disabled={busy}>{busy ? "Uploading…" : "Upload"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, person, or signer" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No documents yet. Upload your first HR document to get started.</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <ul className="divide-y">
            {filtered.map((d) => {
              const person = people.find((p) => p.id === (d.employee_id || d.contractor_id));
              const cat = CATEGORIES.find((c) => c.value === d.category);
              const status = d.signature_status ?? "unsigned";
              const isSigned = status === "signed";
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent flex-shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{d.title}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{cat?.label ?? d.category}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.unsigned}`}>{status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {person ? `${person.full_name} · ` : ""}{d.file_name ?? "—"} · {bytes(d.file_size)} · {new Date(d.uploaded_at).toLocaleDateString()}
                    </div>
                    {isSigned && d.signed_by_name && (
                      <div className="mt-1 text-xs text-emerald-800">
                        <CheckCircle2 className="inline h-3 w-3" /> Signed by <b>{d.signed_by_name}</b>
                        {d.signed_by_email ? ` (${d.signed_by_email})` : ""} {d.signature_ip ? `· IP ${d.signature_ip}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {!isSigned && status !== "requested" && (
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => requestSignature(d)}><Eye className="h-4 w-4" />Request</Button>
                    )}
                    {!isSigned && (
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSignOpen(d)}><PenLine className="h-4 w-4" />Sign</Button>
                    )}
                    {isSigned && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-rose-700" onClick={() => voidSignature(d)}><XCircle className="h-4 w-4" />Void</Button>
                    )}
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openHistory(d)}><History className="h-4 w-4" />History</Button>
                    <Button variant="ghost" size="icon" onClick={() => download(d)} title="Download"><Download className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(d)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Sign dialog */}
      <Dialog open={!!signOpen} onOpenChange={(o) => !o && setSignOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sign document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">By typing your name below you electronically sign <b>{signOpen?.title}</b>. We record name, email, IP, browser, and the exact timestamp.</p>
            <div><Label>Full legal name</Label><Input value={signForm.name} onChange={(e) => setSignForm({ ...signForm, name: e.target.value })} placeholder="Jamie Chen" /></div>
            <div><Label>Email</Label><Input type="email" value={signForm.email} onChange={(e) => setSignForm({ ...signForm, email: e.target.value })} placeholder="jamie@company.com" /></div>
            <div><Label>Note (optional)</Label><Input value={signForm.note} onChange={(e) => setSignForm({ ...signForm, note: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSignOpen(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitSignature} disabled={busy} className="gap-2"><PenLine className="h-4 w-4" />{busy ? "Signing…" : "I agree & sign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyOpen} onOpenChange={(o) => !o && setHistoryOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Signature history</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {history.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
            {history.map((h) => (
              <div key={h.id} className="rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[h.status] ?? STATUS_STYLES.unsigned}`}>{h.status}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.event_at).toLocaleString()}</span>
                </div>
                {h.signed_by_name && <div className="mt-1">{h.signed_by_name} {h.signed_by_email ? `· ${h.signed_by_email}` : ""}</div>}
                {h.signature_ip && <div className="text-xs text-muted-foreground">IP {h.signature_ip}</div>}
                {h.note && <div className="text-xs text-muted-foreground mt-1">{h.note}</div>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
