import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MapPin, Navigation, LogIn, LogOut as LogOutIcon, Plus, Locate, Route as RouteIcon } from "lucide-react";
import { GoogleMap, wazeUrl, googleMapsUrl } from "@/components/GoogleMap";

export const Route = createFileRoute("/app/tracking")({
  head: () => ({ meta: [{ title: "Location tracking — Paylo" }] }),
  component: TrackingPage,
});

interface Employee { id: string; full_name: string; latitude: number | null; longitude: number | null; geocoded_address: string | null; }
interface Contractor { id: string; full_name: string; latitude: number | null; longitude: number | null; geocoded_address: string | null; }
interface Punch { id: string; employee_id: string | null; punch_type: string; punched_at: string; latitude: number | null; longitude: number | null; address: string | null; inside_geofence: boolean | null; }
interface Visit { id: string; visit_label: string | null; address: string | null; latitude: number | null; longitude: number | null; status: string; started_at: string | null; ended_at: string | null; contractor_id: string | null; employee_id: string | null; }

async function geocode(address: string): Promise<{ lat: number; lng: number; formatted: string } | null> {
  // Use browser geocoder via Maps JS — gateway path would need a server fn. The JS geocoder is allowed with the browser key.
  if (!window.google?.maps) return null;
  return new Promise((resolve) => {
    const g = new window.google.maps.Geocoder();
    g.geocode({ address }, (results: any, status: any) => {
      if (status === "OK" && results?.[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng(), formatted: results[0].formatted_address });
      } else resolve(null);
    });
  });
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
  });
}

function TrackingPage() {
  const [tab, setTab] = useState("clock");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [{ data: e }, { data: c }, { data: p }, { data: v }] = await Promise.all([
      supabase.from("employees").select("id, full_name, latitude, longitude, geocoded_address").order("full_name"),
      supabase.from("contractors").select("id, full_name, latitude, longitude, geocoded_address").order("full_name"),
      supabase.from("time_clock_punches").select("*").order("punched_at", { ascending: false }).limit(50),
      supabase.from("field_visits").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setEmployees((e ?? []) as Employee[]);
    setContractors((c ?? []) as Contractor[]);
    setPunches((p ?? []) as Punch[]);
    setVisits((v ?? []) as Visit[]);
  }
  useEffect(() => { refresh(); }, []);

  async function punch(type: "in" | "out") {
    if (!selectedEmp) { toast.error("Select an employee"); return; }
    setBusy(true);
    try {
      const pos = await getPosition();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Sign in again"); return; }
      const { error } = await supabase.from("time_clock_punches").insert({
        user_id: user.id,
        employee_id: selectedEmp,
        punch_type: type,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
        inside_geofence: true,
      });
      if (error) throw error;
      toast.success(`Clocked ${type} — GPS ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function geocodeAll() {
    setBusy(true);
    let count = 0;
    try {
      for (const person of [...employees, ...contractors] as any[]) {
        if (person.latitude || !person.geocoded_address) continue;
        const r = await geocode(person.geocoded_address);
        if (!r) continue;
        const table = employees.find((e) => e.id === person.id) ? "employees" : "contractors";
        await supabase.from(table).update({ latitude: r.lat, longitude: r.lng }).eq("id", person.id);
        count++;
      }
      toast.success(`Geocoded ${count} address${count === 1 ? "" : "es"}`);
      refresh();
    } finally { setBusy(false); }
  }

  const directoryMarkers = [
    ...employees.filter((e) => e.latitude && e.longitude).map((e) => ({ lat: e.latitude!, lng: e.longitude!, title: e.full_name, color: "#4F46E5" })),
    ...contractors.filter((c) => c.latitude && c.longitude).map((c) => ({ lat: c.latitude!, lng: c.longitude!, title: c.full_name, color: "#10B981" })),
  ];
  const punchMarkers = punches.filter((p) => p.latitude && p.longitude).map((p) => ({
    lat: p.latitude!, lng: p.longitude!,
    title: `${p.punch_type} · ${new Date(p.punched_at).toLocaleString()}`,
    color: p.punch_type === "in" ? "#10B981" : "#EF4444",
  }));
  const visitMarkers = visits.filter((v) => v.latitude && v.longitude).map((v) => ({
    lat: v.latitude!, lng: v.longitude!, title: v.visit_label ?? v.address ?? "Visit", color: "#F59E0B",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Location tracking</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">GPS-stamped time clock, contractor field visits, and a directory map of your workforce. Powered by Google Maps with one-tap Waze navigation.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-full bg-muted p-1">
          <TabsTrigger value="clock" className="rounded-full">Time clock</TabsTrigger>
          <TabsTrigger value="visits" className="rounded-full">Field visits</TabsTrigger>
          <TabsTrigger value="directory" className="rounded-full">Directory map</TabsTrigger>
        </TabsList>

        <TabsContent value="clock" className="space-y-4 pt-4">
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <Label>Employee</Label>
                <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                  <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={() => punch("in")} disabled={busy} className="gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"><LogIn className="h-4 w-4" /> Clock in</Button>
              </div>
              <div className="flex items-end">
                <Button onClick={() => punch("out")} disabled={busy} variant="outline" className="gap-2 rounded-full"><LogOutIcon className="h-4 w-4" /> Clock out</Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground"><Locate className="inline h-3 w-3" /> GPS is captured from this device when you punch.</p>
          </div>

          <GoogleMap markers={punchMarkers} />

          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="border-b px-5 py-3 text-sm font-semibold">Recent punches</div>
            <ul className="divide-y">
              {punches.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No punches yet.</li>}
              {punches.map((p) => {
                const emp = employees.find((e) => e.id === p.employee_id);
                return (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div>
                      <div className="font-medium">{emp?.full_name ?? "Unknown"} · <span className={p.punch_type === "in" ? "text-emerald-700" : "text-rose-700"}>{p.punch_type === "in" ? "Clock in" : "Clock out"}</span></div>
                      <div className="text-xs text-muted-foreground">{new Date(p.punched_at).toLocaleString()} {p.latitude && p.longitude ? `· ${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}` : ""}</div>
                    </div>
                    {p.latitude && p.longitude && (
                      <div className="flex gap-2">
                        <a href={googleMapsUrl(p.latitude, p.longitude)} target="_blank" rel="noreferrer" className="text-xs underline">Maps</a>
                        <a href={wazeUrl(p.latitude, p.longitude)} target="_blank" rel="noreferrer" className="text-xs underline">Waze</a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="visits" className="space-y-4 pt-4">
          <VisitsPanel contractors={contractors} employees={employees} visits={visits} onChange={refresh} />
          <GoogleMap markers={visitMarkers} />
        </TabsContent>

        <TabsContent value="directory" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Employees in <span className="text-indigo-600">●</span> indigo · contractors in <span className="text-emerald-600">●</span> emerald.</p>
            <Button variant="outline" className="gap-2 rounded-full" onClick={geocodeAll} disabled={busy}><MapPin className="h-4 w-4" /> Geocode addresses</Button>
          </div>
          <GoogleMap markers={directoryMarkers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VisitsPanel({ contractors, employees, visits, onChange }: { contractors: Contractor[]; employees: Employee[]; visits: Visit[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ label: "", address: "", person: "", kind: "contractor" as "contractor" | "employee" });

  async function create() {
    if (!form.address.trim()) { toast.error("Address is required"); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Sign in again"); return; }
      const r = await geocode(form.address);
      const { error } = await supabase.from("field_visits").insert({
        user_id: user.id,
        visit_label: form.label.trim() || null,
        address: r?.formatted ?? form.address.trim(),
        latitude: r?.lat ?? null,
        longitude: r?.lng ?? null,
        contractor_id: form.kind === "contractor" ? form.person || null : null,
        employee_id: form.kind === "employee" ? form.person || null : null,
        status: "scheduled",
      });
      if (error) throw error;
      toast.success("Visit scheduled");
      setOpen(false);
      setForm({ label: "", address: "", person: "", kind: "contractor" });
      onChange();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function setStatus(v: Visit, status: string) {
    const patch: any = { status };
    if (status === "on_site" && !v.started_at) patch.started_at = new Date().toISOString();
    if (status === "completed") {
      patch.ended_at = new Date().toISOString();
      if (v.started_at) patch.duration_minutes = Math.round((Date.now() - new Date(v.started_at).getTime()) / 60000);
    }
    const { error } = await supabase.from("field_visits").update(patch).eq("id", v.id);
    if (error) toast.error(error.message);
    else { toast.success("Visit updated"); onChange(); }
  }

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="text-sm font-semibold">Field visits</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full bg-[#2563EB] text-white hover:opacity-90"><Plus className="h-4 w-4" /> Schedule visit</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule a field visit</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Acme HQ install" /></div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City, State" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Assign to</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as any, person: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contractor">Contractor</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Person</Label>
                  <Select value={form.person || "none"} onValueChange={(v) => setForm({ ...form, person: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(form.kind === "contractor" ? contractors : employees).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={create} disabled={busy}>{busy ? "Saving…" : "Schedule"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <ul className="divide-y">
        {visits.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No visits scheduled yet.</li>}
        {visits.map((v) => {
          const person = contractors.find((c) => c.id === v.contractor_id) ?? employees.find((e) => e.id === v.employee_id);
          return (
            <li key={v.id} className="px-5 py-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{v.visit_label ?? "Visit"}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{v.status.replace("_", " ")}</span>
                {person && <span className="text-xs text-muted-foreground">· {person.full_name}</span>}
              </div>
              <div className="text-xs text-muted-foreground"><MapPin className="inline h-3 w-3" /> {v.address ?? "—"}</div>
              <div className="flex flex-wrap gap-2">
                {v.status === "scheduled" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setStatus(v, "en_route")}><RouteIcon className="h-3 w-3 mr-1" /> En route</Button>}
                {v.status !== "completed" && v.status !== "cancelled" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setStatus(v, "on_site")}>On site</Button>}
                {v.status !== "completed" && v.status !== "cancelled" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setStatus(v, "completed")}>Complete</Button>}
                {v.latitude && v.longitude && (
                  <>
                    <a href={wazeUrl(v.latitude, v.longitude)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="rounded-full gap-1"><Navigation className="h-3 w-3" /> Waze</Button></a>
                    <a href={googleMapsUrl(v.latitude, v.longitude)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="rounded-full gap-1"><MapPin className="h-3 w-3" /> Maps</Button></a>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
