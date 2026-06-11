import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Pencil } from "lucide-react";
import { friendlyGeoError } from "@/lib/geo";

export const Route = createFileRoute("/app/locations")({
  head: () => ({ meta: [{ title: "Work locations — Paylo" }] }),
  component: LocationsPage,
});

interface Loc {
  id: string; name: string; address: string | null;
  latitude: number | null; longitude: number | null;
  geofence_radius_m: number; geofence_required: boolean; is_active: boolean;
}

function LocationsPage() {
  const { currentId } = useCompany();
  const [rows, setRows] = useState<Loc[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Loc | null>(null);

  async function load() {
    if (!currentId) return;
    const { data } = await supabase.from("work_locations").select("*")
      .eq("company_id", currentId).order("name");
    setRows((data ?? []) as Loc[]);
  }
  useEffect(() => { load(); }, [currentId]);

  async function remove(id: string) {
    if (!confirm("Delete this work location?")) return;
    const { error } = await supabase.from("work_locations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function toggleActive(l: Loc) {
    const { error } = await supabase.from("work_locations")
      .update({ is_active: !l.is_active }).eq("id", l.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work locations"
        description="Define worksites with geofencing for accurate time-clock punches."
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> New location
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No work locations yet. Add one to enable geofenced punches.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Address</th>
                <th className="px-4 py-2 text-left">Radius</th>
                <th className="px-4 py-2 text-left">Geofence</th>
                <th className="px-4 py-2 text-left">Active</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" /> {l.name}
                    </div>
                    {l.latitude && l.longitude && (
                      <div className="text-[11px] text-slate-500">{l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.address ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{l.geofence_radius_m} m</td>
                  <td className="px-4 py-3">
                    {l.geofence_required
                      ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Required</Badge>
                      : <Badge variant="outline">Optional</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <Switch checked={l.is_active} onCheckedChange={() => toggleActive(l)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(l.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <LocationDialog
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        companyId={currentId}
        editing={editing}
        onSaved={load}
      />
    </div>
  );
}

function LocationDialog({ open, onClose, companyId, editing, onSaved }: {
  open: boolean; onClose: () => void; companyId: string | null;
  editing: Loc | null; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "", address: "", latitude: "", longitude: "",
    geofence_radius_m: "150", geofence_required: false,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        address: editing.address ?? "",
        latitude: editing.latitude?.toString() ?? "",
        longitude: editing.longitude?.toString() ?? "",
        geofence_radius_m: editing.geofence_radius_m.toString(),
        geofence_required: editing.geofence_required,
      });
    } else {
      setForm({ name: "", address: "", latitude: "", longitude: "", geofence_radius_m: "150", geofence_required: false });
    }
  }, [open, editing]);

  async function useMyLocation() {
    if (!("geolocation" in navigator)) return toast.error("Geolocation not available");
    navigator.geolocation.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })),
      (e) => toast.error(e.message),
      { enableHighAccuracy: true }
    );
  }

  async function save() {
    if (!companyId) return;
    if (!form.name.trim()) return toast.error("Name is required");
    const radius = parseInt(form.geofence_radius_m);
    if (Number.isNaN(radius) || radius < 25 || radius > 5000) return toast.error("Radius must be between 25 and 5000 meters");
    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      address: form.address.trim() || null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      geofence_radius_m: radius,
      geofence_required: form.geofence_required,
    };
    setBusy(true);
    const { error } = editing
      ? await supabase.from("work_locations").update(payload).eq("id", editing.id)
      : await supabase.from("work_locations").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Location updated" : "Location created");
    onClose(); onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit location" : "New work location"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main warehouse" /></div>
          <div className="col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" /></div>
          <div><Label>Latitude</Label><Input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="37.7749" /></div>
          <div><Label>Longitude</Label><Input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="-122.4194" /></div>
          <div className="col-span-2">
            <Button variant="outline" size="sm" onClick={useMyLocation}>
              <MapPin className="mr-1 h-3.5 w-3.5" /> Use my current location
            </Button>
          </div>
          <div><Label>Geofence radius (m)</Label><Input type="number" min={25} max={5000} value={form.geofence_radius_m} onChange={(e) => setForm({ ...form, geofence_radius_m: e.target.value })} /></div>
          <div className="flex items-end gap-2 pb-1">
            <Switch id="req" checked={form.geofence_required} onCheckedChange={(v) => setForm({ ...form, geofence_required: v })} />
            <Label htmlFor="req">Require geofence for punch-in</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{editing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
