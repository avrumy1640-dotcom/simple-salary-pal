import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, Pencil, Check, X, Upload, Download, Trash2, FileText, Camera,
  Calendar, Clock,
} from "lucide-react";
import { fmtUSD } from "@/lib/payroll";

export const Route = createFileRoute("/app/employees/$id")({
  head: () => ({ meta: [{ title: "Employee profile — Paylo" }] }),
  component: EmployeeProfilePage,
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
  status: string;
  lifecycle_status?: string | null;
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
  pto_balance_hours?: number;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  start_date?: string | null;
  manager_id?: string | null;
}

interface PtoEntry {
  id: string;
  start_date: string;
  end_date: string;
  hours: number;
  pto_type: string;
  status: string;
  notes: string | null;
  created_at: string;
}

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

function tenureFrom(startDate?: string | null): string {
  if (!startDate) return "—";
  const start = new Date(startDate);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} month${m === 1 ? "" : "s"}`;
  if (m === 0) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y}y ${m}mo`;
}

function EmployeeProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [pto, setPto] = useState<PtoEntry[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("personal");

  // edit modes
  const [editPersonal, setEditPersonal] = useState(false);
  const [editJob, setEditJob] = useState(false);
  const [editPay, setEditPay] = useState(false);
  const [draft, setDraft] = useState<Partial<Employee>>({});

  async function load() {
    setLoading(true);
    const [{ data: e }, { data: p }, { data: a }] = await Promise.all([
      supabase.from("employees").select("*").eq("id", id).maybeSingle(),
      supabase.from("pto_entries").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
      supabase.from("audit_events").select("*").or(`entity_id.eq.${id},target_id.eq.${id}`).order("created_at", { ascending: false }).limit(50),
    ]);
    setEmp(e as Employee | null);
    setPto((p ?? []) as PtoEntry[]);
    setAudit((a ?? []) as any[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  function startEdit(section: "personal" | "job" | "pay") {
    if (!emp) return;
    setDraft({ ...emp });
    if (section === "personal") setEditPersonal(true);
    if (section === "job") setEditJob(true);
    if (section === "pay") setEditPay(true);
  }
  function cancelEdit() { setEditPersonal(false); setEditJob(false); setEditPay(false); setDraft({}); }

  async function saveSection(section: "personal" | "job" | "pay") {
    if (!emp) return;
    let patch: any = {};
    if (section === "personal") {
      patch = {
        full_name: draft.full_name, email: draft.email, phone: draft.phone,
        address_line1: draft.address_line1, city: draft.city, state: draft.state, zip: draft.zip,
        date_of_birth: draft.date_of_birth || null,
        emergency_contact_name: draft.emergency_contact_name,
        emergency_contact_phone: draft.emergency_contact_phone,
      };
    } else if (section === "job") {
      patch = {
        job_title: draft.job_title, department: draft.department, start_date: draft.start_date,
        employment_type: draft.employment_type,
      };
    } else if (section === "pay") {
      patch = {
        pay_type: draft.pay_type, pay_rate: Number(draft.pay_rate) || 0,
        filing_status: draft.filing_status, extra_withholding: Number(draft.extra_withholding) || 0,
        bank_account_type: draft.bank_account_type,
      };
    }
    const { error } = await supabase.from("employees").update(patch).eq("id", emp.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    cancelEdit();
    load();
  }

  const nextPayday = useMemo(() => {
    // simple heuristic — next biweekly Friday
    const d = new Date();
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }
  if (!emp) {
    return (
      <div className="p-8">
        <p className="text-slate-700">Employee not found.</p>
        <Link to="/app/employees" className="text-primary hover:underline">← Back to Employees</Link>
      </div>
    );
  }

  const e = (editPersonal || editJob || editPay) ? { ...emp, ...draft } as Employee : emp;
  const fullType = e.employment_type === "1099" ? "1099" : "W-2";

  return (
    <div className="space-y-6 unit-scope unit-in">
      {/* back */}
      <div>
        <Button variant="ghost" onClick={() => navigate({ to: "/app/employees" })} className="rounded-full text-slate-600 hover:text-slate-900 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Employees
        </Button>
      </div>

      {/* PROFILE HEADER CARD */}
      <div className="rounded-3xl border border-[color:var(--unit-hairline)] bg-white p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row items-start gap-6">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className={`grid h-20 w-20 place-items-center rounded-full text-2xl font-semibold ${colorFor(emp.full_name)}`}>
              {initialsOf(emp.full_name)}
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-900 gap-1">
              <Camera className="h-3 w-3" /> Edit Photo
            </Button>
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900">{emp.full_name}</h1>
            <p className="text-lg text-primary mt-1 font-medium">{emp.job_title || "Employee"}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {emp.department && (
                <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">{emp.department}</span>
              )}
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${fullType === "W-2" ? "bg-primary/5 text-primary ring-primary/25" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>{fullType}</span>
              {emp.status === "active" || emp.lifecycle_status === "active" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> {emp.lifecycle_status ?? emp.status}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto lg:min-w-[480px]">
            <QuickStat icon={Clock} label="Time with company" value={tenureFrom(emp.start_date)} />
            <QuickStat icon={Calendar} label="Current pay" value={emp.pay_type === "hourly" ? `${fmtUSD(emp.pay_rate)}/hr` : `${fmtUSD(emp.pay_rate)}/yr`} />
            <QuickStat icon={Calendar} label="Next paycheck" value={nextPayday} />
          </div>
        </div>
      </div>

      {/* TABS */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-transparent p-0 h-auto border-b border-[color:var(--unit-hairline)] w-full justify-start rounded-none gap-1">
          {[
            { v: "personal", l: "Personal Info" },
            { v: "job", l: "Job Info" },
            { v: "pay", l: "Pay Info" },
            { v: "documents", l: "Documents" },
            { v: "timeoff", l: "Time Off" },
            { v: "activity", l: "Activity Log" },
          ].map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 data-[state=active]:border-primary data-[state=active]:text-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >{t.l}</TabsTrigger>
          ))}
        </TabsList>

        {/* PERSONAL */}
        <TabsContent value="personal" className="mt-6">
          <SectionCard title="Personal Information" editing={editPersonal} onEdit={() => startEdit("personal")} onCancel={cancelEdit} onSave={() => saveSection("personal")}>
            <Grid>
              <PField label="First Name" editing={editPersonal} value={(e.full_name || "").split(" ")[0]} onChange={(v) => setDraft({ ...draft, full_name: `${v} ${(emp.full_name || "").split(" ").slice(1).join(" ")}`.trim() })} />
              <PField label="Last Name" editing={editPersonal} value={(e.full_name || "").split(" ").slice(1).join(" ")} onChange={(v) => setDraft({ ...draft, full_name: `${(emp.full_name || "").split(" ")[0]} ${v}`.trim() })} />
              <PField label="Personal Email" editing={editPersonal} value={e.email ?? ""} onChange={(v) => setDraft({ ...draft, email: v })} />
              <PField label="Work Email" editing={editPersonal} value={e.email ?? ""} onChange={(v) => setDraft({ ...draft, email: v })} />
              <PField label="Phone Number" editing={editPersonal} value={e.phone ?? ""} onChange={(v) => setDraft({ ...draft, phone: v })} />
              <PField label="Home Address" editing={editPersonal} value={e.address_line1 ?? ""} onChange={(v) => setDraft({ ...draft, address_line1: v })} />
              <PField label="City" editing={editPersonal} value={e.city ?? ""} onChange={(v) => setDraft({ ...draft, city: v })} />
              <PField label="State" editing={editPersonal} value={e.state ?? ""} onChange={(v) => setDraft({ ...draft, state: v.toUpperCase() })} />
              <PField label="Zip Code" editing={editPersonal} value={e.zip ?? ""} onChange={(v) => setDraft({ ...draft, zip: v })} />
              <PField label="Date of Birth" editing={editPersonal} type="date" value={e.date_of_birth ?? ""} onChange={(v) => setDraft({ ...draft, date_of_birth: v })} />
              <PField label="SSN" editing={false} value={e.ssn_last4 ? `XXX-XX-${e.ssn_last4}` : "—"} />
              <PField label="Emergency Contact Name" editing={editPersonal} value={e.emergency_contact_name ?? ""} onChange={(v) => setDraft({ ...draft, emergency_contact_name: v })} />
              <PField label="Emergency Contact Phone" editing={editPersonal} value={e.emergency_contact_phone ?? ""} onChange={(v) => setDraft({ ...draft, emergency_contact_phone: v })} />
            </Grid>
          </SectionCard>
        </TabsContent>

        {/* JOB */}
        <TabsContent value="job" className="mt-6">
          <SectionCard title="Job Information" editing={editJob} onEdit={() => startEdit("job")} onCancel={cancelEdit} onSave={() => saveSection("job")}>
            <Grid>
              <PField label="Department" editing={editJob} value={e.department ?? ""} onChange={(v) => setDraft({ ...draft, department: v })} />
              <PField label="Job Title" editing={editJob} value={e.job_title ?? ""} onChange={(v) => setDraft({ ...draft, job_title: v })} />
              <PField label="Manager" editing={false} value="—" />
              <PField label="Start Date" editing={editJob} type="date" value={e.start_date ?? ""} onChange={(v) => setDraft({ ...draft, start_date: v })} />
              <PField
                label="Employment Type" editing={editJob}
                value={e.employment_type ?? "w2"}
                onChange={(v) => setDraft({ ...draft, employment_type: v })}
                options={[{ v: "w2", l: "W-2 Employee" }, { v: "1099", l: "1099 Contractor" }]}
              />
              <PField label="Work Location" editing={false} value="—" />
              <PField label="Employee ID" editing={false} value={emp.id.slice(0, 8).toUpperCase()} />
            </Grid>
          </SectionCard>
        </TabsContent>

        {/* PAY */}
        <TabsContent value="pay" className="mt-6">
          <SectionCard title="Pay Information" editing={editPay} onEdit={() => startEdit("pay")} onCancel={cancelEdit} onSave={() => saveSection("pay")}>
            <Grid>
              <PField
                label="Pay Type" editing={editPay} value={e.pay_type}
                onChange={(v) => setDraft({ ...draft, pay_type: v as any })}
                options={[{ v: "salary", l: "Salary" }, { v: "hourly", l: "Hourly" }]}
              />
              <PField label="Pay Rate" editing={editPay} type="number" value={String(e.pay_rate)} onChange={(v) => setDraft({ ...draft, pay_rate: Number(v) })} />
              <PField label="Pay Frequency" editing={false} value="Bi-weekly" />
              <PField
                label="Federal Filing Status" editing={editPay} value={e.filing_status ?? "single"}
                onChange={(v) => setDraft({ ...draft, filing_status: v })}
                options={[{ v: "single", l: "Single" }, { v: "married", l: "Married" }, { v: "head", l: "Head of household" }]}
              />
              <PField label="Additional Withholding" editing={editPay} type="number" value={String(e.extra_withholding ?? 0)} onChange={(v) => setDraft({ ...draft, extra_withholding: Number(v) })} />
              <PField label="Bank Name" editing={false} value="—" />
              <PField
                label="Account Type" editing={editPay} value={e.bank_account_type ?? "checking"}
                onChange={(v) => setDraft({ ...draft, bank_account_type: v })}
                options={[{ v: "checking", l: "Checking" }, { v: "savings", l: "Savings" }]}
              />
              <PField label="Account Number" editing={false} value={e.bank_account_last4 ? `XXXX${e.bank_account_last4}` : "—"} />
              <PField label="Routing Number" editing={false} value={e.bank_routing_last4 ? `XXXX${e.bank_routing_last4}` : "—"} />
            </Grid>
          </SectionCard>
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="mt-6">
          <div className="rounded-2xl border border-[color:var(--unit-hairline)] bg-white p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-semibold text-slate-900">Documents</h2>
              <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90 h-11 px-5">
                <Upload className="h-4 w-4 mr-2" /> Upload Document
              </Button>
            </div>
            <div className="text-center py-16 text-slate-500">
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-base font-medium text-slate-700">No documents yet</p>
              <p className="text-sm mt-1">Upload W-4, I-9, offer letters, and other employee documents here.</p>
            </div>
          </div>
        </TabsContent>

        {/* TIME OFF */}
        <TabsContent value="timeoff" className="mt-6 space-y-5">
          <div className="rounded-2xl border border-[color:var(--unit-hairline)] bg-white p-6">
            <h2 className="font-display text-2xl font-semibold text-slate-900 mb-5">Balance</h2>
            <div className="space-y-4">
              <ProgressRow label="Vacation Days" used={Math.max(0, 80 - (emp.pto_balance_hours ?? 0))} total={80} unit="hrs" color="bg-emerald-500" />
              <ProgressRow label="Sick Days" used={16} total={40} unit="hrs" color="bg-sky-500" />
              <ProgressRow label="Personal Days" used={8} total={24} unit="hrs" color="bg-violet-500" />
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--unit-hairline)] bg-white p-6">
            <h2 className="font-display text-2xl font-semibold text-slate-900 mb-5">Request history</h2>
            {pto.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">No time-off requests yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-[color:var(--unit-hairline)]">
                      <th className="text-left py-2.5 font-semibold">Type</th>
                      <th className="text-left py-2.5 font-semibold">Date Range</th>
                      <th className="text-left py-2.5 font-semibold">Hours</th>
                      <th className="text-left py-2.5 font-semibold">Status</th>
                      <th className="text-left py-2.5 font-semibold">Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pto.map((p) => (
                      <tr key={p.id} className="border-b border-[color:var(--unit-hairline)] last:border-0">
                        <td className="py-3 capitalize">{p.pto_type}</td>
                        <td className="py-3">{new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()}</td>
                        <td className="py-3 tabular-nums">{p.hours}</td>
                        <td className="py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                            p.status === "approved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : p.status === "rejected" ? "bg-red-50 text-red-700 ring-red-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
                          }`}>{p.status}</span>
                        </td>
                        <td className="py-3 text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity" className="mt-6">
          <div className="rounded-2xl border border-[color:var(--unit-hairline)] bg-white p-6">
            <h2 className="font-display text-2xl font-semibold text-slate-900 mb-5">Activity log</h2>
            {audit.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">No recorded activity yet.</div>
            ) : (
              <ul className="space-y-4">
                {audit.map((a) => (
                  <li key={a.id} className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900">{a.event_type || a.action || "Activity"}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{new Date(a.created_at).toLocaleString()}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuickStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--unit-hairline)] bg-slate-50/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wide">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-semibold text-slate-900 mt-1 truncate">{value}</div>
    </div>
  );
}

function SectionCard({ title, editing, onEdit, onCancel, onSave, children }: {
  title: string; editing: boolean;
  onEdit: () => void; onCancel: () => void; onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--unit-hairline)] bg-white p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-semibold text-slate-900">{title}</h2>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} className="rounded-full"><X className="h-4 w-4 mr-1.5" /> Cancel</Button>
            <Button onClick={onSave} className="rounded-full bg-foreground text-background hover:bg-foreground/90"><Check className="h-4 w-4 mr-1.5" /> Save</Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={onEdit} className="rounded-full text-slate-600 hover:text-slate-900">
            <Pencil className="h-4 w-4 mr-1.5" /> Edit
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">{children}</div>;
}

function PField({ label, value, editing, onChange, type, options }: {
  label: string; value: string; editing: boolean;
  onChange?: (v: string) => void;
  type?: string;
  options?: { v: string; l: string }[];
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</Label>
      {editing && onChange ? (
        options ? (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-11 mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input className="h-11 mt-1.5" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
        )
      ) : (
        <div className="font-semibold text-slate-900 mt-1.5 min-h-[2.75rem] flex items-center">{value || "—"}</div>
      )}
    </div>
  );
}

function ProgressRow({ label, used, total, unit, color }: { label: string; used: number; total: number; unit: string; color: string }) {
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="text-sm tabular-nums">
          <span className="font-semibold text-slate-900">{used}</span>
          <span className="text-slate-500"> / {total} {unit} used</span>
          <span className="ml-2 text-emerald-600 font-medium">({remaining} left)</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
