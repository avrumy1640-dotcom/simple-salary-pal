import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  Trash2, Search, UserX, MoreHorizontal, Eye, Zap, UserPlus, Pencil,
} from "lucide-react";
import { fmtUSD } from "@/lib/payroll";
import { useCompany } from "@/hooks/useCompany";
import { terminateEmployee, reactivateEmployee, placeOnLeave, returnFromLeave } from "@/lib/employee-lifecycle.functions";
import { AddEmployeeWizard } from "@/components/AddEmployeeWizard";

export const Route = createFileRoute("/app/employees")({
  head: () => ({ meta: [{ title: "Employees — Paylo" }] }),
  component: EmployeesPage,
});

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  department?: string | null;
  employment_type?: string | null; // "w2" | "1099"
  pay_type: "hourly" | "salary";
  pay_rate: number;
  status: "active" | "inactive";
  lifecycle_status?: "prospect" | "onboarding" | "active" | "on_leave" | "terminated" | null;
  termination_date?: string | null;
  termination_reason?: string | null;
  rehire_eligible?: boolean | null;
  leave_start_date?: string | null;
  leave_end_date?: string | null;
  leave_reason?: string | null;
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
  created_at?: string;
}

type FormState = Omit<Employee, "id" | "lifecycle_status" | "termination_date" | "termination_reason" | "rehire_eligible" | "leave_start_date" | "leave_end_date" | "leave_reason" | "created_at">;

const empty: FormState = {
  full_name: "", email: "", job_title: "", pay_type: "hourly", pay_rate: 20, status: "active",
  address_line1: "", city: "", state: "CA", zip: "", phone: "", date_of_birth: "", ssn_last4: "",
  filing_status: "single", dependents: 0, extra_withholding: 0,
  bank_account_type: "checking", bank_routing_last4: "", bank_account_last4: "", direct_deposit_enabled: false,
  pto_balance_hours: 0, pto_accrual_per_period: 0,
  emergency_contact_name: "", emergency_contact_phone: "", start_date: new Date().toISOString().slice(0, 10),
};

/* ---------- visual helpers (matched to dashboard) ---------- */
function initialsOf(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];
function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const DEPT_STYLES: Record<string, string> = {
  hr: "bg-sky-50 text-sky-700 ring-sky-200",
  sales: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  finance: "bg-violet-50 text-violet-700 ring-violet-200",
  operations: "bg-orange-50 text-orange-700 ring-orange-200",
  engineering: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  marketing: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  support: "bg-teal-50 text-teal-700 ring-teal-200",
};
function deptStyle(dept?: string | null) {
  if (!dept) return "bg-slate-50 text-slate-600 ring-slate-200";
  return DEPT_STYLES[dept.toLowerCase()] ?? "bg-slate-50 text-slate-700 ring-slate-200";
}

function inferType(e: Employee): "W-2" | "1099" {
  const t = (e.employment_type ?? "").toLowerCase();
  if (t.includes("1099") || t === "contractor") return "1099";
  return "W-2";
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: "active" | "muted" | "accent" | "amber" }) {
  const tones = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    muted: "bg-slate-50 text-slate-600 ring-slate-200",
    accent: "bg-primary/10 text-primary ring-primary/30",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
  } as const;
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 ring-1 text-sm ${tones[tone]}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-xs font-medium opacity-80">{label}</span>
    </div>
  );
}

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
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "W-2" | "1099">("all");
  const { currentId } = useCompany();

  const terminateFn = useServerFn(terminateEmployee);
  const reactivateFn = useServerFn(reactivateEmployee);
  const placeOnLeaveFn = useServerFn(placeOnLeave);
  const returnFromLeaveFn = useServerFn(returnFromLeave);

  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateForm, setTerminateForm] = useState({
    termination_date: new Date().toISOString().slice(0, 10),
    reason: "",
    rehire_eligible: true,
    payout_pto: false,
  });
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_start_date: new Date().toISOString().slice(0, 10), leave_end_date: "", reason: "" });

  async function refresh() {
    if (!currentId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("employees")
      .select("*")
      .eq("company_id", currentId)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Employee[]);
    setLoading(false);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [currentId]);

  async function doTerminate() {
    if (!detail) return;
    if (terminateForm.reason.trim().length < 3) { toast.error("Reason is required"); return; }
    try {
      await terminateFn({ data: { employee_id: detail.id, ...terminateForm } });
      toast.success(`${detail.full_name} terminated`);
      setTerminateOpen(false);
      setDetail(null);
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Termination failed"); }
  }
  async function doReactivate() {
    if (!detail) return;
    try {
      await reactivateFn({ data: { employee_id: detail.id } });
      toast.success(`${detail.full_name} reactivated`);
      setDetail(null);
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Reactivation failed"); }
  }
  async function doPlaceOnLeave() {
    if (!detail) return;
    if (leaveForm.reason.trim().length < 3) { toast.error("Reason is required"); return; }
    try {
      await placeOnLeaveFn({ data: {
        employee_id: detail.id,
        leave_start_date: leaveForm.leave_start_date,
        leave_end_date: leaveForm.leave_end_date || null,
        reason: leaveForm.reason,
      } });
      toast.success(`${detail.full_name} placed on leave`);
      setLeaveOpen(false);
      setDetail(null);
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }
  async function doReturnFromLeave() {
    if (!detail) return;
    try {
      await returnFromLeaveFn({ data: { employee_id: detail.id } });
      toast.success(`${detail.full_name} returned from leave`);
      setDetail(null);
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

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
    if (!currentId) { toast.error("No active company selected"); return; }
    const { lifecycle_status: _ls, termination_date: _td, termination_reason: _tr,
            rehire_eligible: _re, leave_start_date: _lsd, leave_end_date: _led,
            leave_reason: _lr, ...rest } = form as any;
    const payload = {
      ...rest,
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
      company_id: currentId,
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

  /* ---------- derived ---------- */
  const departments = useMemo(() => {
    const s = new Set<string>();
    items.forEach((e) => { if (e.department) s.add(e.department); });
    return Array.from(s).sort();
  }, [items]);

  const filtered = items.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (deptFilter !== "all" && (e.department ?? "") !== deptFilter) return false;
    if (typeFilter !== "all" && inferType(e) !== typeFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      e.full_name.toLowerCase().includes(q) ||
      (e.email ?? "").toLowerCase().includes(q) ||
      (e.job_title ?? "").toLowerCase().includes(q) ||
      (e.department ?? "").toLowerCase().includes(q)
    );
  });

  const totalActive = items.filter((e) => e.status === "active").length;
  const totalInactive = items.filter((e) => e.status === "inactive").length;
  const totalW2 = items.filter((e) => inferType(e) === "W-2").length;
  const total1099 = items.filter((e) => inferType(e) === "1099").length;
  const newThisMonth = items.filter((e) => {
    const d = e.start_date ?? e.created_at;
    if (!d) return false;
    const dt = new Date(d);
    const now = new Date();
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="space-y-8 unit-scope unit-in">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
              Employees
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary ring-1 ring-primary/20">
              <span className="tabular-nums">{items.length}</span>
              {items.length === 1 ? "employee" : "employees"}
            </span>
          </div>
          <p className="text-base text-slate-500">Manage your team — contact, pay, and tax setup in one place.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={openNew}
              size="lg"
              className="h-12 gap-2 rounded-full bg-foreground px-6 text-base font-semibold text-background hover:bg-foreground/90"
            >
              <UserPlus className="h-5 w-5" /> Add Employee
            </Button>
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
                  <Field label="Department"><Input value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Engineering" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start date"><Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
                  <Field label="Employment type">
                    <Select value={form.employment_type ?? "w2"} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="w2">W-2 Employee</SelectItem>
                        <SelectItem value="1099">1099 Contractor</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
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
                  <Field label="PTO accrual / period (hrs)" hint="e.g. 3.08h ≈ 10 vacation days/year on biweekly pay.">
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
              <Button onClick={save} className="rounded-full bg-foreground text-background hover:bg-foreground/90">{editing ? "Save changes" : "Add employee"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* STAT CHIPS */}
      <div className="flex flex-wrap gap-2">
        <StatChip label="Active" value={totalActive} tone="active" />
        <StatChip label="Inactive" value={totalInactive} tone="muted" />
        <StatChip label="W-2" value={totalW2} tone="accent" />
        <StatChip label="1099" value={total1099} tone="accent" />
        <StatChip label="New this month" value={newThisMonth} tone="amber" />
      </div>

      {/* SEARCH + FILTERS */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--unit-hairline)] bg-white p-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, job title, department, or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-10 bg-transparent border-0 shadow-none focus-visible:ring-0 text-[15px]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-11 min-w-[160px] rounded-xl"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="h-11 min-w-[140px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="h-11 min-w-[140px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="W-2">W-2</SelectItem>
              <SelectItem value="1099">1099</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* TABLE */}
      <div className="rounded-2xl border border-[color:var(--unit-hairline)] bg-white overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-base text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 grid place-items-center mb-4">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <p className="text-lg font-semibold text-slate-900">No team members yet</p>
            <p className="text-sm text-slate-500 mt-1 mb-5">Add your first employee to get started.</p>
            <Button onClick={openNew} size="lg" className="rounded-full bg-foreground text-background hover:bg-foreground/90">
              <UserPlus className="mr-2 h-5 w-5" /> Add Employee
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-base text-slate-500">No matches for those filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-6 py-3.5 font-semibold min-w-[280px]">Employee</th>
                  <th className="text-left px-4 py-3.5 font-semibold">Department</th>
                  <th className="text-left px-4 py-3.5 font-semibold">Type</th>
                  <th className="text-left px-4 py-3.5 font-semibold">Pay Rate</th>
                  <th className="text-left px-4 py-3.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-3.5 font-semibold">Start Date</th>
                  <th className="px-4 py-3.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => {
                  const type = inferType(e);
                  const lifecycle = e.lifecycle_status ?? (e.status === "active" ? "active" : "inactive");
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setDetail(e)}
                      className={`group cursor-pointer border-t border-[color:var(--unit-hairline)] transition-colors hover:bg-primary/[0.03] ${idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                      style={{ height: 64 }}
                    >
                      <td className="px-6 py-3 relative">
                        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex items-center gap-3">
                          <div className={`grid h-11 w-11 place-items-center rounded-full text-sm font-semibold shrink-0 ${colorFor(e.full_name)}`}>
                            {initialsOf(e.full_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{e.full_name}</div>
                            <div className="text-xs text-slate-500 truncate">{e.job_title || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {e.department ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${deptStyle(e.department)}`}>
                            {e.department}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${
                          type === "W-2"
                            ? "bg-primary/5 text-primary ring-primary/25"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
                        }`}>
                          {type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 tabular-nums">{fmtUSD(e.pay_rate)}</div>
                        <div className="text-xs text-slate-500">{e.pay_type === "hourly" ? "per hour" : "per year"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip lifecycle={lifecycle} />
                      </td>
                      <td className="px-4 py-3 text-slate-700 tabular-nums">
                        {e.start_date ? new Date(e.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-900">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => setDetail(e)}>
                              <Eye className="mr-2 h-4 w-4" /> View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(e)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Zap className="mr-2 h-4 w-4" /> Run Off-Cycle Payroll
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {(!e.lifecycle_status || e.lifecycle_status === "active") && (
                              <DropdownMenuItem onClick={() => { setDetail(e); setTimeout(() => setTerminateOpen(true), 0); }}>
                                <UserX className="mr-2 h-4 w-4" /> Deactivate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => setConfirmDelete(e)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail slide-out (kept — full profile page coming in next pass) */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-4">
                  <div className={`grid h-16 w-16 place-items-center rounded-full text-lg font-semibold ${colorFor(detail.full_name)}`}>
                    {initialsOf(detail.full_name)}
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-xl">{detail.full_name}</SheetTitle>
                    <SheetDescription>{detail.job_title || "Employee"}</SheetDescription>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <StatusChip lifecycle={detail.lifecycle_status ?? (detail.status === "active" ? "active" : "inactive")} />
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${
                        inferType(detail) === "W-2"
                          ? "bg-primary/5 text-primary ring-primary/25"
                          : "bg-amber-50 text-amber-700 ring-amber-200"
                      }`}>{inferType(detail)}</span>
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

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={() => { setDetail(null); openEdit(detail); }} className="flex-1 gap-2 min-w-[120px] rounded-full bg-foreground text-background hover:bg-foreground/90"><Pencil className="h-4 w-4" /> Edit</Button>
                  {(!detail.lifecycle_status || detail.lifecycle_status === "active") && (
                    <>
                      <Button variant="outline" onClick={() => setLeaveOpen(true)} className="gap-2 rounded-full"><Pause className="h-4 w-4" /> Place on leave</Button>
                      <Button variant="outline" onClick={() => setTerminateOpen(true)} className="gap-2 rounded-full text-destructive hover:text-destructive"><UserX className="h-4 w-4" /> Terminate</Button>
                    </>
                  )}
                  {detail.lifecycle_status === "on_leave" && (
                    <Button variant="outline" onClick={doReturnFromLeave} className="gap-2 rounded-full"><UserCheck className="h-4 w-4" /> Return from leave</Button>
                  )}
                  {detail.lifecycle_status === "terminated" && (
                    <Button variant="outline" onClick={doReactivate} className="gap-2 rounded-full"><UserCheck className="h-4 w-4" /> Rehire / reactivate</Button>
                  )}
                  <Button variant="outline" onClick={() => setConfirmDelete(detail)} className="gap-2 rounded-full text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Terminate dialog */}
      <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Terminate {detail?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Termination date</Label><Input type="date" value={terminateForm.termination_date} onChange={(e) => setTerminateForm({ ...terminateForm, termination_date: e.target.value })} /></div>
            <div><Label>Reason</Label><Input value={terminateForm.reason} onChange={(e) => setTerminateForm({ ...terminateForm, reason: e.target.value })} maxLength={500} placeholder="Voluntary resignation, layoff, performance, etc." /></div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><div className="text-sm font-medium">Eligible for rehire</div></div>
              <Switch checked={terminateForm.rehire_eligible} onCheckedChange={(v) => setTerminateForm({ ...terminateForm, rehire_eligible: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Pay out remaining PTO</div>
                <div className="text-xs text-muted-foreground">Zeroes the balance via a final ledger debit. State law may require this regardless.</div>
              </div>
              <Switch checked={terminateForm.payout_pto} onCheckedChange={(v) => setTerminateForm({ ...terminateForm, payout_pto: v })} />
            </div>
            <p className="text-xs text-muted-foreground">Compensation and banking fields become immutable after termination. Reactivate to edit them again.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTerminateOpen(false)}>Cancel</Button>
            <Button onClick={doTerminate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Terminate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave dialog */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Place {detail?.full_name} on leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Leave start</Label><Input type="date" value={leaveForm.leave_start_date} onChange={(e) => setLeaveForm({ ...leaveForm, leave_start_date: e.target.value })} /></div>
              <div><Label>Expected return (optional)</Label><Input type="date" value={leaveForm.leave_end_date} onChange={(e) => setLeaveForm({ ...leaveForm, leave_end_date: e.target.value })} /></div>
            </div>
            <div><Label>Reason</Label><Input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="FMLA, medical, personal, etc." maxLength={500} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>Cancel</Button>
            <Button onClick={doPlaceOnLeave}>Place on leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function StatusChip({ lifecycle }: { lifecycle: string }) {
  if (lifecycle === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
      </span>
    );
  }
  if (lifecycle === "terminated") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Terminated
      </span>
    );
  }
  if (lifecycle === "on_leave") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> On Leave
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
    </span>
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
