import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Info, Building2, Banknote, FileText as FileIcon, Phone, Mail, MapPin, Calendar, DollarSign, Search } from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/employees")({
  head: () => ({ meta: [{ title: "Employees — Paylo" }] }),
  component: EmployeesPage,
});

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  pay_type: "hourly" | "salary";
  pay_rate: number;
  status: "active" | "inactive";
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  ssn_last4?: string | null;
  filing_status?: string | null;
  dependents?: number;
  extra_withholding?: number;
  bank_account_type?: string | null;
  bank_routing_last4?: string | null;
  bank_account_last4?: string | null;
  direct_deposit_enabled?: boolean;
  pto_balance_hours?: number;
  pto_accrual_per_period?: number;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  start_date?: string | null;
}

type FormState = Omit<Employee, "id">;

const empty: FormState = {
  full_name: "", email: "", job_title: "", pay_type: "hourly", pay_rate: 20, status: "active",
  address_line1: "", city: "", state: "CA", zip: "", phone: "", date_of_birth: "", ssn_last4: "",
  filing_status: "single", dependents: 0, extra_withholding: 0,
  bank_account_type: "checking", bank_routing_last4: "", bank_account_last4: "", direct_deposit_enabled: false,
  pto_balance_hours: 0, pto_accrual_per_period: 0,
  emergency_contact_name: "", emergency_contact_phone: "", start_date: new Date().toISOString().slice(0, 10),
};

function EmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [detail, setDetail] = useState<Employee | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  async function refresh() {
    setLoading(true);
    const { data } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as Employee[]);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(e: Employee) {
    setEditing(e);
    setForm({ ...empty, ...e } as FormState);
    setOpen(true);
  }

  async function save() {
    if (!form.full_name.trim()) { toast.error("Name is required"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      ...form,
      pay_rate: Number(form.pay_rate) || 0,
      dependents: Number(form.dependents) || 0,
      extra_withholding: Number(form.extra_withholding) || 0,
      pto_balance_hours: Number(form.pto_balance_hours) || 0,
      pto_accrual_per_period: Number(form.pto_accrual_per_period) || 0,
      date_of_birth: form.date_of_birth || null,
      start_date: form.start_date || null,
      ssn_last4: (form.ssn_last4 || "").slice(-4),
      bank_routing_last4: (form.bank_routing_last4 || "").slice(-4),
      bank_account_last4: (form.bank_account_last4 || "").slice(-4),
      owner_id: user.id,
    };
    const { error } = editing
      ? await supabase.from("employees").update(payload).eq("id", editing.id)
      : await supabase.from("employees").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Updated" : "Employee added");
    setOpen(false);
    refresh();
  }

  async function performDelete() {
    if (!confirmDelete) return;
    const { error } = await supabase.from("employees").delete().eq("id", confirmDelete.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${confirmDelete.full_name} removed`);
    setConfirmDelete(null);
    setDetail(null);
    refresh();
  }

  const filtered = items.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      e.full_name.toLowerCase().includes(q) ||
      (e.email ?? "").toLowerCase().includes(q) ||
      (e.job_title ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage your team — contact, tax setup, and direct deposit.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-2 rounded-full bg-primary text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" /> Add employee</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="basics">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="basics" className="gap-1"><Building2 className="h-3.5 w-3.5" /> Basics</TabsTrigger>
                <TabsTrigger value="contact" className="gap-1"><Phone className="h-3.5 w-3.5" /> Contact</TabsTrigger>
                <TabsTrigger value="tax" className="gap-1"><FileIcon className="h-3.5 w-3.5" /> Tax (W-4)</TabsTrigger>
                <TabsTrigger value="bank" className="gap-1"><Banknote className="h-3.5 w-3.5" /> Direct deposit</TabsTrigger>
              </TabsList>

              <TabsContent value="basics" className="space-y-3 pt-4">
                <Field label="Full name"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={120} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Job title"><Input value={form.job_title ?? ""} onChange={(e) => setForm({ ...form, job_title: e.target.value })} maxLength={120} /></Field>
                  <Field label="Start date"><Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Pay type">
                    <Select value={form.pay_type} onValueChange={(v) => setForm({ ...form, pay_type: v as "hourly" | "salary" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="salary">Salary (annual)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={form.pay_type === "hourly" ? "Hourly rate ($)" : "Annual salary ($)"}>
                    <Input type="number" min={0} step="0.01" value={form.pay_rate} onChange={(e) => setForm({ ...form, pay_rate: Number(e.target.value) })} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="PTO accrual per pay period (hours)" hint="e.g. 3.08h ≈ 10 vacation days/year on biweekly pay.">
                    <Input type="number" min={0} step="0.01" value={form.pto_accrual_per_period ?? 0} onChange={(e) => setForm({ ...form, pto_accrual_per_period: Number(e.target.value) })} />
                  </Field>
                </div>
              </TabsContent>

              <TabsContent value="contact" className="space-y-3 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} /></Field>
                  <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" maxLength={20} /></Field>
                </div>
                <Field label="Address"><Input value={form.address_line1 ?? ""} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="City"><Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
                  <Field label="State"><Input maxLength={2} value={form.state ?? ""} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></Field>
                  <Field label="ZIP"><Input value={form.zip ?? ""} onChange={(e) => setForm({ ...form, zip: e.target.value })} maxLength={10} /></Field>
                </div>
                <Field label="Date of birth"><Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Emergency contact name"><Input value={form.emergency_contact_name ?? ""} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></Field>
                  <Field label="Emergency contact phone"><Input value={form.emergency_contact_phone ?? ""} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></Field>
                </div>
              </TabsContent>

              <TabsContent value="tax" className="space-y-3 pt-4">
                <div className="rounded-lg bg-accent/40 p-3 text-xs text-foreground/80 flex gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-foreground flex-shrink-0" />
                  This info comes from your employee's <strong>W-4 form</strong>. It tells you how much federal tax to withhold from each paycheck.
                </div>
                <Field label="SSN (last 4 only)" hint="We only store the last 4 digits.">
                  <Input value={form.ssn_last4 ?? ""} onChange={(e) => setForm({ ...form, ssn_last4: e.target.value.replace(/\D/g, "").slice(-4) })} placeholder="1234" maxLength={4} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Filing status (W-4 Step 1c)">
                    <Select value={form.filing_status ?? "single"} onValueChange={(v) => setForm({ ...form, filing_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single or Married filing separately</SelectItem>
                        <SelectItem value="married">Married filing jointly</SelectItem>
                        <SelectItem value="head">Head of household</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Dependents (W-4 Step 3)" hint="Number of qualifying dependents.">
                    <Input type="number" min={0} value={form.dependents ?? 0} onChange={(e) => setForm({ ...form, dependents: Number(e.target.value) })} />
                  </Field>
                </div>
                <Field label="Extra withholding per paycheck ($)" hint="Optional — from W-4 Step 4(c).">
                  <Input type="number" min={0} step="0.01" value={form.extra_withholding ?? 0} onChange={(e) => setForm({ ...form, extra_withholding: Number(e.target.value) })} />
                </Field>
              </TabsContent>

              <TabsContent value="bank" className="space-y-3 pt-4">
                <div className="rounded-lg bg-accent/40 p-3 text-xs text-foreground/80 flex gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-foreground flex-shrink-0" />
                  Direct deposit sends paychecks straight to your employee's bank account. We only store the last 4 digits for security.
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">Enable direct deposit</div>
                    <div className="text-xs text-muted-foreground">If off, this employee gets a paper check.</div>
                  </div>
                  <Switch checked={!!form.direct_deposit_enabled} onCheckedChange={(v) => setForm({ ...form, direct_deposit_enabled: v })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Account type">
                    <Select value={form.bank_account_type ?? "checking"} onValueChange={(v) => setForm({ ...form, bank_account_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Routing # (last 4)">
                    <Input value={form.bank_routing_last4 ?? ""} onChange={(e) => setForm({ ...form, bank_routing_last4: e.target.value.replace(/\D/g, "").slice(-4) })} maxLength={4} />
                  </Field>
                </div>
                <Field label="Account # (last 4)">
                  <Input value={form.bank_account_last4 ?? ""} onChange={(e) => setForm({ ...form, bank_account_last4: e.target.value.replace(/\D/g, "").slice(-4) })} maxLength={4} />
                </Field>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} className="rounded-full bg-primary text-primary-foreground hover:opacity-90">{editing ? "Save changes" : "Add employee"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 surface-glass p-3 rounded-xl">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, email, or title…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >{s}</button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">No employees yet.</p>
            <Button onClick={openNew} className="mt-4 gap-2 rounded-full bg-primary text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" /> Add your first employee</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No matches.</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((e) => (
              <li key={e.id} className="group flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-muted/30 transition cursor-pointer" onClick={() => setDetail(e)}>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-accent text-sm font-medium text-accent-foreground">
                  {e.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{e.full_name}</p>
                    {e.status === "inactive" && <Badge variant="secondary">Inactive</Badge>}
                    {e.direct_deposit_enabled && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-foreground">Direct deposit</span>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {e.job_title || "—"} · {e.pay_type === "hourly" ? `${fmtUSD(e.pay_rate)}/hr` : `${fmtUSD(e.pay_rate)}/yr`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(e); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Detail slide-out */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-full gradient-brand text-lg font-bold text-primary-foreground shadow-glow">
                    {detail.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-xl">{detail.full_name}</SheetTitle>
                    <SheetDescription>{detail.job_title || "Employee"}</SheetDescription>
                    <div className="flex gap-2 mt-1">
                      {detail.status === "active"
                        ? <Badge variant="default" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>
                        : <Badge variant="secondary">Inactive</Badge>}
                      {detail.direct_deposit_enabled && <Badge variant="outline" className="text-xs">Direct deposit</Badge>}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <DetailGroup title="Compensation">
                  <DetailRow icon={DollarSign} label="Pay" value={detail.pay_type === "hourly" ? `${fmtUSD(detail.pay_rate)}/hour` : `${fmtUSD(detail.pay_rate)}/year`} />
                  <DetailRow icon={Calendar} label="Start date" value={detail.start_date ? new Date(detail.start_date).toLocaleDateString() : "—"} />
                  <DetailRow icon={Calendar} label="PTO balance" value={`${detail.pto_balance_hours ?? 0} hours`} />
                </DetailGroup>

                <DetailGroup title="Contact">
                  <DetailRow icon={Mail} label="Email" value={detail.email || "—"} />
                  <DetailRow icon={Phone} label="Phone" value={detail.phone || "—"} />
                  <DetailRow icon={MapPin} label="Address" value={[detail.address_line1, detail.city, detail.state, detail.zip].filter(Boolean).join(", ") || "—"} />
                </DetailGroup>

                <DetailGroup title="Tax setup (W-4)">
                  <DetailRow label="Filing status" value={detail.filing_status || "—"} />
                  <DetailRow label="Dependents" value={String(detail.dependents ?? 0)} />
                  <DetailRow label="Extra withholding" value={fmtUSD(detail.extra_withholding ?? 0)} />
                  <DetailRow label="SSN" value={detail.ssn_last4 ? `•••-••-${detail.ssn_last4}` : "—"} />
                </DetailGroup>

                <DetailGroup title="Direct deposit">
                  <DetailRow label="Enabled" value={detail.direct_deposit_enabled ? "Yes" : "No — paper check"} />
                  <DetailRow label="Account type" value={detail.bank_account_type || "—"} />
                  <DetailRow label="Routing" value={detail.bank_routing_last4 ? `••••${detail.bank_routing_last4}` : "—"} />
                  <DetailRow label="Account" value={detail.bank_account_last4 ? `••••${detail.bank_account_last4}` : "—"} />
                </DetailGroup>

                <DetailGroup title="Emergency contact">
                  <DetailRow label="Name" value={detail.emergency_contact_name || "—"} />
                  <DetailRow label="Phone" value={detail.emergency_contact_phone || "—"} />
                </DetailGroup>

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => { setDetail(null); openEdit(detail); }} className="flex-1 gap-2"><Pencil className="h-4 w-4" /> Edit</Button>
                  <Button variant="outline" onClick={() => setConfirmDelete(detail)} className="gap-2 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmDelete?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the employee from your team. Their past payroll history is preserved, but they won't appear on future payroll runs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div className="rounded-xl border border-border/50 divide-y divide-border/40 bg-background/30">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon?: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="font-medium text-right truncate max-w-[60%]">{value}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
