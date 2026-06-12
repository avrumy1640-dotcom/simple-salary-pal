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
import { terminateEmployee } from "@/lib/employee-lifecycle.functions";
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
  employment_type?: string | null;
  pay_type: "hourly" | "salary";
  pay_rate: number;
  status: "active" | "inactive";
  lifecycle_status?: string | null;
  start_date?: string | null;
  created_at?: string;
}

/* ---------- visual helpers ---------- */
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

function StatusChip({ lifecycle }: { lifecycle: string }) {
  if (lifecycle === "active") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
    </span>
  );
  if (lifecycle === "terminated") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Terminated
    </span>
  );
  if (lifecycle === "on_leave") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> On Leave
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
    </span>
  );
}

function EmployeesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "W-2" | "1099">("all");
  const { currentId } = useCompany();

  const terminateFn = useServerFn(terminateEmployee);
  const [terminateTarget, setTerminateTarget] = useState<Employee | null>(null);
  const [terminateForm, setTerminateForm] = useState({
    termination_date: new Date().toISOString().slice(0, 10),
    reason: "",
    rehire_eligible: true,
    payout_pto: false,
  });

  async function refresh() {
    if (!currentId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, email, job_title, department, employment_type, pay_type, pay_rate, status, lifecycle_status, start_date, created_at")
      .eq("company_id", currentId)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Employee[]);
    setLoading(false);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [currentId]);

  async function doTerminate() {
    if (!terminateTarget) return;
    if (terminateForm.reason.trim().length < 3) { toast.error("Reason is required"); return; }
    try {
      await terminateFn({ data: { employee_id: terminateTarget.id, ...terminateForm } });
      toast.success(`${terminateTarget.full_name} terminated`);
      setTerminateTarget(null);
      refresh();
    } catch (err: any) { toast.error(err?.message ?? "Termination failed"); }
  }

  async function reactivateEmployee(e: Employee) {
    const { error } = await supabase
      .from("employees")
      .update({ status: "active", lifecycle_status: "active" })
      .eq("id", e.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${e.full_name} reactivated`);
    refresh();
  }


  async function performDelete() {
    if (!confirmDelete) return;
    const { error } = await supabase.from("employees").delete().eq("id", confirmDelete.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${confirmDelete.full_name} removed`);
    setConfirmDelete(null);
    refresh();
  }

  const [departments, setDepartments] = useState<string[]>([]);
  useEffect(() => {
    if (!currentId) { setDepartments([]); return; }
    supabase.from("departments").select("name").eq("company_id", currentId).eq("is_active", true).order("name").then(({ data }) => {
      setDepartments(((data ?? []) as { name: string }[]).map((d) => d.name));
    });
    const ch = supabase.channel(`depts-${currentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "departments", filter: `company_id=eq.${currentId}` }, () => {
        supabase.from("departments").select("name").eq("company_id", currentId).eq("is_active", true).order("name").then(({ data }) => {
          setDepartments(((data ?? []) as { name: string }[]).map((d) => d.name));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentId]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">Employees</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20">
            <span className="tabular-nums">{items.length}</span> total
          </span>
          {totalActive > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 tabular-nums">
              {totalActive} active
            </span>
          )}
        </div>
        <Button
          onClick={() => setWizardOpen(true)}
          className="h-10 gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90"
        >
          <UserPlus className="h-4 w-4" /> Add Employee
        </Button>
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
            <Button onClick={() => setWizardOpen(true)} size="lg" className="rounded-full bg-foreground text-background hover:bg-foreground/90">
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
                      onClick={() => navigate({ to: "/app/employees/$id", params: { id: e.id } })}
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
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${deptStyle(e.department)}`}>{e.department}</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${
                          type === "W-2" ? "bg-primary/5 text-primary ring-primary/25" : "bg-amber-50 text-amber-700 ring-amber-200"
                        }`}>{type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 tabular-nums">{fmtUSD(e.pay_rate)}</div>
                        <div className="text-xs text-slate-500">{e.pay_type === "hourly" ? "per hour" : "per year"}</div>
                      </td>
                      <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="inline-flex items-center focus:outline-none">
                              <StatusChip lifecycle={lifecycle} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44">
                            {lifecycle === "active" ? (
                              <DropdownMenuItem onClick={() => setTerminateTarget(e)}>
                                <UserX className="mr-2 h-4 w-4" /> Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => reactivateEmployee(e)}>
                                <Zap className="mr-2 h-4 w-4" /> Reactivate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                            <DropdownMenuItem onClick={() => navigate({ to: "/app/employees/$id", params: { id: e.id } })}>
                              <Eye className="mr-2 h-4 w-4" /> View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate({ to: "/app/employees/$id", params: { id: e.id }, search: { edit: 1 } as any })}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate({ to: "/app/payroll/run", search: { employeeId: e.id, offCycle: 1 } as any })}>
                              <Zap className="mr-2 h-4 w-4" /> Run Off-Cycle Payroll
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {lifecycle === "active" && (
                              <DropdownMenuItem onClick={() => setTerminateTarget(e)}>
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

      {/* Add Employee wizard */}
      <AddEmployeeWizard open={wizardOpen} onOpenChange={setWizardOpen} onCreated={() => refresh()} />

      {/* Terminate dialog */}
      <Dialog open={!!terminateTarget} onOpenChange={(o) => !o && setTerminateTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Terminate {terminateTarget?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Termination date</Label><Input type="date" value={terminateForm.termination_date} onChange={(e) => setTerminateForm({ ...terminateForm, termination_date: e.target.value })} /></div>
            <div><Label>Reason</Label><Input value={terminateForm.reason} onChange={(e) => setTerminateForm({ ...terminateForm, reason: e.target.value })} maxLength={500} placeholder="Voluntary resignation, layoff, performance, etc." /></div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="text-sm font-medium">Eligible for rehire</div>
              <Switch checked={terminateForm.rehire_eligible} onCheckedChange={(v) => setTerminateForm({ ...terminateForm, rehire_eligible: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Pay out remaining PTO</div>
                <div className="text-xs text-muted-foreground">Zeroes the balance via a final ledger debit.</div>
              </div>
              <Switch checked={terminateForm.payout_pto} onCheckedChange={(v) => setTerminateForm({ ...terminateForm, payout_pto: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTerminateTarget(null)}>Cancel</Button>
            <Button onClick={doTerminate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Terminate</Button>
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
