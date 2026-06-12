import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Phone, Plus, Star, Trash2, Pencil } from "lucide-react";
import {
  listEmergencyContacts,
  upsertEmergencyContact,
  deleteEmergencyContact,
} from "@/lib/employee-extras.functions";

interface Contact {
  id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_primary: boolean;
}

const empty = {
  id: undefined as string | undefined,
  name: "",
  relationship: "",
  phone: "",
  email: "",
  address: "",
  is_primary: false,
};

export function EmergencyContactsCard({ employeeId }: { employeeId: string }) {
  const list = useServerFn(listEmergencyContacts);
  const upsert = useServerFn(upsertEmergencyContact);
  const remove = useServerFn(deleteEmergencyContact);

  const [items, setItems] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await list({ data: { employee_id: employeeId } });
      setItems((res.items ?? []) as Contact[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (employeeId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  function openNew() {
    setForm(empty);
    setOpen(true);
  }
  function openEdit(c: Contact) {
    setForm({
      id: c.id,
      name: c.name,
      relationship: c.relationship ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      is_primary: c.is_primary,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      await upsert({
        data: {
          id: form.id,
          employee_id: employeeId,
          name: form.name.trim(),
          relationship: form.relationship || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          is_primary: form.is_primary,
        },
      });
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Remove this contact?")) return;
    try {
      await remove({ data: { id } });
      toast.success("Removed");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-bold text-slate-900">Emergency contacts</div>
          <p className="text-sm text-slate-500">People we should reach in case of emergency.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" onClick={openNew}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit contact" : "New emergency contact"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input className="h-11" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Relationship</Label>
                  <Input className="h-11" placeholder="Spouse, Parent…" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input className="h-11" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input className="h-11" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Address</Label>
                <Input className="h-11" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_primary}
                  onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                />
                Primary contact
              </label>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-slate-600">
            No emergency contacts yet. Add one above.
          </div>
        ) : (
          items.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  {c.is_primary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                      <Star className="h-3 w-3" /> Primary
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{c.relationship || "—"}</div>
                {c.phone && (
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                    <Phone className="h-3.5 w-3.5" /> {c.phone}
                  </div>
                )}
                {c.email && <div className="text-sm text-slate-600">{c.email}</div>}
                {c.address && <div className="text-xs text-slate-500">{c.address}</div>}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(c)} title="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => del(c.id)} title="Remove">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
