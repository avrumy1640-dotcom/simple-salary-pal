import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  UserCircle2, Wallet, CalendarDays, FileText, Download, Plus,
  Mail, Phone, MapPin, Building2, Banknote, ShieldCheck, Clock,
} from "lucide-react";

export const Route = createFileRoute("/app/self-service")({
  head: () => ({ meta: [{ title: "Employee self-service — Paylo" }] }),
  component: SelfServicePage,
});

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  pay_type: string;
  pay_rate: number;
  state: string | null;
  start_date: string | null;
  address_line1: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  filing_status: string | null;
  dependents: number;
  bank_account_type: string | null;
  bank_routing_last4: string | null;
  bank_account_last4: string | null;
  direct_deposit_enabled: boolean;
  pto_balance_hours: number;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

interface PayItem {
  id: string;
  gross_pay: number;
  net_pay: number;
  federal_tax: number;
  state_tax: number;
  fica_tax: number;
  medicare_tax: number;
  regular_hours: number | null;
  overtime_hours: number | null;
  payroll_runs: { pay_date: string; period_start: string; period_end: string; status: string } | null;
}

interface PTO {
  id: string;
  pto_type: string;
  start_date: string;
  end_date: string;
  hours: number;
  status: string;
  notes: string | null;
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function SelfServicePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [paystubs, setPaystubs] = useState<PayItem[]>([]);
  const [pto, setPto] = useState<PTO[]>([]);
  const [profile, setProfile] = useState({ phone: "", address_line1: "", city: "", zip: "", emergency_contact_name: "", emergency_contact_phone: "" });
  const [ptoOpen, setPtoOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [ptoForm, setPtoForm] = useState({ pto_type: "vacation", start_date: today, end_date: today, hours: 8, notes: "" });

  const active = useMemo(() => employees.find((e) => e.id === activeId) || null, [employees, activeId]);

  async function loadEmployees() {
    const { data } = await supabase
      .from("employees")
      .select("*")
      .eq("status", "active")
      .order("full_name");
    const list = (data ?? []) as Employee[];
    setEmployees(list);
    if (!activeId && list.length) setActiveId(list[0].id);
  }
  useEffect(() => { loadEmployees(); }, []);

  useEffect(() => {
    if (!active) return;
    setProfile({
      phone: active.phone ?? "",
      address_line1: active.address_line1 ?? "",
      city: active.city ?? "",
      zip: active.zip ?? "",
      emergency_contact_name: active.emergency_contact_name ?? "",
      emergency_contact_phone: active.emergency_contact_phone ?? "",
    });
    (async () => {
      const [{ data: items }, { data: ptos }] = await Promise.all([
        supabase
          .from("payroll_items")
          .select("id, gross_pay, net_pay, federal_tax, state_tax, fica_tax, medicare_tax, regular_hours, overtime_hours, payroll_runs(pay_date, period_start, period_end, status)")
          .eq("employee_id", active.id)
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("pto_entries")
          .select("id, pto_type, start_date, end_date, hours, status, notes")
          .eq("employee_id", active.id)
          .order("start_date", { ascending: false })
          .limit(20),
      ]);
      setPaystubs((items ?? []) as unknown as PayItem[]);
      setPto((ptos ?? []) as PTO[]);
    })();
  }, [active?.id]);

  async function saveProfile() {
    if (!active) return;
    const { error } = await supabase.from("employees").update(profile).eq("id", active.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Your info has been updated");
    loadEmployees();
  }

  async function submitPto() {
    if (!active) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("pto_entries").insert({
      ...ptoForm,
      hours: Number(ptoForm.hours) || 0,
      employee_id: active.id,
      company_id: (active as any).company_id,
      
      status: "pending",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Time off request submitted");
    setPtoOpen(false);
    setPtoForm({ pto_type: "vacation", start_date: today, end_date: today, hours: 8, notes: "" });
    // refresh
    const { data } = await supabase
      .from("pto_entries")
      .select("id, pto_type, start_date, end_date, hours, status, notes")
      .eq("employee_id", active.id)
      .order("start_date", { ascending: false })
      .limit(20);
    setPto((data ?? []) as PTO[]);
  }

  function downloadPaystub(item: PayItem) {
    if (!active) return;
    const pd = item.payroll_runs?.pay_date ?? "";
    const lines = [
      `Pay stub — ${active.full_name}`,
      `Pay date: ${pd}`,
      `Period: ${item.payroll_runs?.period_start ?? ""} → ${item.payroll_runs?.period_end ?? ""}`,
      ``,
      `Regular hours: ${item.regular_hours ?? 0}`,
      `Overtime hours: ${item.overtime_hours ?? 0}`,
      `Gross pay: ${formatMoney(Number(item.gross_pay))}`,
      `Federal tax: ${formatMoney(Number(item.federal_tax))}`,
      `State tax: ${formatMoney(Number(item.state_tax))}`,
      `Social Security: ${formatMoney(Number(item.fica_tax))}`,
      `Medicare: ${formatMoney(Number(item.medicare_tax))}`,
      `Net pay: ${formatMoney(Number(item.net_pay))}`,
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `paystub-${active.full_name.replace(/\s+/g, "-")}-${pd}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  const ytd = useMemo(() => {
    const year = new Date().getFullYear();
    const inYear = paystubs.filter((p) => (p.payroll_runs?.pay_date ?? "").startsWith(String(year)));
    return {
      gross: inYear.reduce((s, p) => s + Number(p.gross_pay), 0),
      net: inYear.reduce((s, p) => s + Number(p.net_pay), 0),
      taxes: inYear.reduce((s, p) => s + Number(p.federal_tax) + Number(p.state_tax) + Number(p.fica_tax) + Number(p.medicare_tax), 0),
      checks: inYear.length,
    };
  }, [paystubs]);

  if (employees.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <UserCircle2 className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-semibold">No employees yet</h2>
        <p className="text-sm text-muted-foreground">Add active employees first to preview the self-service portal.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-white">Preview as employee</div>
          <h1 className="text-2xl font-semibold tracking-tight">Employee self-service portal</h1>
          <p className="text-sm text-muted-foreground">See exactly what each employee sees: pay stubs, time off, and personal info.</p>
        </div>
        <div className="w-full max-w-xs">
          <Label className="text-xs">Viewing as</Label>
          <Select value={activeId} onValueChange={setActiveId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {active && (
        <>
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex flex-wrap items-center gap-5">
              <div className="grid h-16 w-16 place-items-center rounded-full gradient-brand text-xl font-bold text-foreground">
                {active.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xl font-semibold">{active.full_name}</div>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  {active.job_title && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {active.job_title}</span>}
                  {active.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {active.email}</span>}
                  {active.state && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {active.state}</span>}
                  {active.start_date && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Since {active.start_date}</span>}
                </div>
              </div>
              <Badge variant="secondary" className="capitalize">{active.pay_type} · {formatMoney(Number(active.pay_rate))}{active.pay_type === "hourly" ? "/hr" : "/yr"}</Badge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Tile label="YTD gross" value={formatMoney(ytd.gross)} />
              <Tile label="YTD net" value={formatMoney(ytd.net)} />
              <Tile label="YTD taxes" value={formatMoney(ytd.taxes)} />
              <Tile label="PTO available" value={`${Number(active.pto_balance_hours).toFixed(1)}h`} sub={`≈ ${(Number(active.pto_balance_hours) / 8).toFixed(1)} days`} />
            </div>
          </div>

          <Tabs defaultValue="pay" className="w-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
              <TabsTrigger value="pay">Pay stubs</TabsTrigger>
              <TabsTrigger value="pto">Time off</TabsTrigger>
              <TabsTrigger value="profile">My info</TabsTrigger>
              <TabsTrigger value="docs">Tax & banking</TabsTrigger>
            </TabsList>

            <TabsContent value="pay" className="mt-4">
              <div className="rounded-2xl border bg-card">
                <div className="flex items-center justify-between border-b px-5 py-3">
                  <div className="text-sm font-medium flex items-center gap-2"><Wallet className="h-4 w-4" /> Recent pay stubs</div>
                  <div className="text-xs text-muted-foreground">{ytd.checks} this year</div>
                </div>
                {paystubs.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No pay stubs yet. They'll appear here after the first payroll is approved.</div>
                ) : (
                  <ul className="divide-y">
                    {paystubs.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">Pay date {p.payroll_runs?.pay_date ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">Period {p.payroll_runs?.period_start ?? "—"} → {p.payroll_runs?.period_end ?? "—"}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{formatMoney(Number(p.net_pay))}</div>
                          <div className="text-xs text-muted-foreground">Gross {formatMoney(Number(p.gross_pay))}</div>
                        </div>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadPaystub(p)}>
                          <Download className="h-3.5 w-3.5" /> Download
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            <TabsContent value="pto" className="mt-4">
              <div className="rounded-2xl border bg-card">
                <div className="flex items-center justify-between border-b px-5 py-3">
                  <div className="text-sm font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Time off</div>
                  <Dialog open={ptoOpen} onOpenChange={setPtoOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" /> Request time off</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Request time off</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>Type</Label>
                          <Select value={ptoForm.pto_type} onValueChange={(v) => setPtoForm({ ...ptoForm, pto_type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="vacation">Vacation</SelectItem>
                              <SelectItem value="sick">Sick</SelectItem>
                              <SelectItem value="personal">Personal</SelectItem>
                              <SelectItem value="bereavement">Bereavement</SelectItem>
                              <SelectItem value="unpaid">Unpaid leave</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-3 grid-cols-2">
                          <div><Label>From</Label><Input type="date" value={ptoForm.start_date} onChange={(e) => setPtoForm({ ...ptoForm, start_date: e.target.value })} /></div>
                          <div><Label>To</Label><Input type="date" value={ptoForm.end_date} onChange={(e) => setPtoForm({ ...ptoForm, end_date: e.target.value })} /></div>
                        </div>
                        <div>
                          <Label>Total hours</Label>
                          <Input type="number" min={0} step="0.5" value={ptoForm.hours} onChange={(e) => setPtoForm({ ...ptoForm, hours: Number(e.target.value) })} />
                          <p className="mt-1 text-xs text-muted-foreground">You have {Number(active.pto_balance_hours).toFixed(1)}h available.</p>
                        </div>
                        <div><Label>Reason (optional)</Label><Textarea value={ptoForm.notes} onChange={(e) => setPtoForm({ ...ptoForm, notes: e.target.value })} maxLength={500} /></div>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setPtoOpen(false)}>Cancel</Button>
                        <Button onClick={submitPto}>Submit request</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {pto.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No requests yet. Click "Request time off" to submit one.</div>
                ) : (
                  <ul className="divide-y">
                    {pto.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium capitalize">{p.pto_type}</div>
                          <div className="text-xs text-muted-foreground">{p.start_date} → {p.end_date} · {p.hours}h{p.notes ? ` · ${p.notes}` : ""}</div>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                          p.status === "approved" ? "bg-[oklch(0.94_0.05_155)] text-[oklch(0.4_0.16_155)]" :
                          p.status === "denied" || p.status === "rejected" ? "bg-destructive/10 text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}>{p.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            <TabsContent value="profile" className="mt-4">
              <div className="rounded-2xl border bg-card p-5">
                <div className="text-sm font-medium flex items-center gap-2 mb-4"><UserCircle2 className="h-4 w-4" /> Personal info</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Phone</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
                  <div><Label>Address</Label><Input value={profile.address_line1} onChange={(e) => setProfile({ ...profile, address_line1: e.target.value })} /></div>
                  <div><Label>City</Label><Input value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></div>
                  <div><Label>ZIP</Label><Input value={profile.zip} onChange={(e) => setProfile({ ...profile, zip: e.target.value })} /></div>
                  <div><Label>Emergency contact name</Label><Input value={profile.emergency_contact_name} onChange={(e) => setProfile({ ...profile, emergency_contact_name: e.target.value })} /></div>
                  <div><Label>Emergency contact phone</Label><Input value={profile.emergency_contact_phone} onChange={(e) => setProfile({ ...profile, emergency_contact_phone: e.target.value })} /></div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={saveProfile}>Save changes</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="docs" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-card p-5">
                  <div className="text-sm font-medium flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4" /> Tax withholding (W-4)</div>
                  <dl className="space-y-2 text-sm">
                    <Row k="Filing status" v={<span className="capitalize">{active.filing_status ?? "—"}</span>} />
                    <Row k="Dependents" v={active.dependents} />
                    <Row k="Work state" v={active.state ?? "—"} />
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">To update your W-4, please contact your administrator.</p>
                </div>
                <div className="rounded-2xl border bg-card p-5">
                  <div className="text-sm font-medium flex items-center gap-2 mb-3"><Banknote className="h-4 w-4" /> Direct deposit</div>
                  {active.direct_deposit_enabled ? (
                    <dl className="space-y-2 text-sm">
                      <Row k="Account type" v={<span className="capitalize">{active.bank_account_type ?? "—"}</span>} />
                      <Row k="Routing" v={active.bank_routing_last4 ? `••••${active.bank_routing_last4}` : "—"} />
                      <Row k="Account" v={active.bank_account_last4 ? `••••${active.bank_account_last4}` : "—"} />
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">Direct deposit is not set up. You'll receive paper checks until it's enabled.</p>
                  )}
                  {active.phone && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> {active.phone}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
