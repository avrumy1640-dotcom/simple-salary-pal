import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Download, CheckCircle2, Circle, Search } from "lucide-react";

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

function bytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [signedIds, setSignedIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ person: "", title: "", category: "other", notes: "" });

  async function refresh() {
    const [{ data: emps }, { data: cons }, { data: d }, { data: forms }] = await Promise.all([
      supabase.from("employees").select("id, full_name").order("full_name"),
      supabase.from("contractors").select("id, full_name").order("full_name"),
      supabase.from("hr_documents").select("*").order("uploaded_at", { ascending: false }),
      supabase.from("hr_forms").select("id, status").eq("status", "signed"),
    ]);
    const list: Person[] = [
      ...((emps ?? []) as any[]).map((e) => ({ id: e.id, full_name: e.full_name, kind: "employee" as const })),
      ...((cons ?? []) as any[]).map((c) => ({ id: c.id, full_name: c.full_name, kind: "contractor" as const })),
    ];
    setPeople(list);
    setDocs((d ?? []) as Doc[]);
    // Documents marked as signed are tracked via a 'signed:' prefix in notes
    const signed = new Set<string>(((d ?? []) as Doc[]).filter((x) => x.notes?.startsWith("[signed]")).map((x) => x.id));
    setSignedIds(signed);
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
      const personId = form.person || null;
      const person = people.find((p) => p.id === personId);
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
    } finally {
      setBusy(false);
    }
  }

  async function download(d: Doc) {
    if (!d.storage_path) { toast.error("No file attached"); return; }
    const { data, error } = await supabase.storage.from("hr-documents").createSignedUrl(d.storage_path, 60);
    if (error || !data) { toast.error(error?.message || "Could not get link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function remove(d: Doc) {
    if (!confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    if (d.storage_path) await supabase.storage.from("hr-documents").remove([d.storage_path]);
    await supabase.from("hr_documents").delete().eq("id", d.id);
    toast.success("Deleted");
    refresh();
  }

  async function toggleSigned(d: Doc) {
    const isSigned = signedIds.has(d.id);
    const newNotes = isSigned
      ? (d.notes ?? "").replace(/^\[signed\][^\n]*\n?/, "").trim() || null
      : `[signed] ${new Date().toISOString()}${d.notes ? "\n" + d.notes : ""}`;
    const { error } = await supabase.from("hr_documents").update({ notes: newNotes }).eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    toast.success(isSigned ? "Marked unsigned" : "Marked signed");
    refresh();
  }

  const filtered = docs.filter((d) => {
    if (filter !== "all" && d.category !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      const personName = people.find((p) => p.id === (d.employee_id || d.contractor_id))?.full_name ?? "";
      if (!d.title.toLowerCase().includes(q) && !personName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">HR documents</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Upload offer letters, I-9s, W-4s, W-9s, IDs, and signed acknowledgments. Files are stored privately and only accessible to your company.
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
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Signed offer letter — Jamie Chen" />
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
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or person" className="pl-9" />
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
              const isSigned = signedIds.has(d.id);
              const cat = CATEGORIES.find((c) => c.value === d.category);
              return (
                <li key={d.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-foreground flex-shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{d.title}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{cat?.label ?? d.category}</span>
                      {isSigned && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"><CheckCircle2 className="h-3 w-3" /> Signed</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {person ? `${person.full_name} · ` : ""}{d.file_name ?? "—"} · {bytes(d.file_size)} · {new Date(d.uploaded_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => toggleSigned(d)}>
                    {isSigned ? <Circle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {isSigned ? "Unsign" : "Mark signed"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => download(d)} title="Download"><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(d)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
