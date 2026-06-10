import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, User, Briefcase, DollarSign, Landmark, FileCheck,
  ShieldCheck, Lock,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface WizardData {
  // Step 1
  first_name: string; last_name: string; personal_email: string; work_email: string;
  phone: string; address_line1: string; date_of_birth: string; ssn_last4: string;
  // Step 2
  job_title: string; department: string; manager_id: string; start_date: string;
  employment_type: "w2" | "1099"; work_location: string; employee_id: string;
  // Step 3
  pay_type: "salary" | "hourly"; pay_rate: number; pay_frequency: string;
  filing_status: string; extra_withholding: number;
  // Step 4
  bank_name: string; bank_account_type: "checking" | "savings";
  bank_routing_last4: string; bank_account_last4: string; bank_account_confirm: string;
}

const initial: WizardData = {
  first_name: "", last_name: "", personal_email: "", work_email: "", phone: "",
  address_line1: "", date_of_birth: "", ssn_last4: "",
  job_title: "", department: "", manager_id: "", start_date: new Date().toISOString().slice(0, 10),
  employment_type: "w2", work_location: "", employee_id: "",
  pay_type: "salary", pay_rate: 0, pay_frequency: "biweekly",
  filing_status: "single", extra_withholding: 0,
  bank_name: "", bank_account_type: "checking",
  bank_routing_last4: "", bank_account_last4: "", bank_account_confirm: "",
};

const STEPS = [
  { id: 1, label: "Personal", icon: User },
  { id: 2, label: "Job", icon: Briefcase },
  { id: 3, label: "Pay", icon: DollarSign },
  { id: 4, label: "Direct Deposit", icon: Landmark },
  { id: 5, label: "Review", icon: FileCheck },
];

export function AddEmployeeWizard({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const { currentId } = useCompany();
  const navigate = useNavigate();

  function reset() { setStep(1); setData(initial); setCreatedId(null); }
  function close() { onOpenChange(false); setTimeout(reset, 200); }

  function set<K extends keyof WizardData>(k: K, v: WizardData[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!data.first_name.trim() || !data.last_name.trim()) return "First and last name are required";
    }
    if (s === 2) {
      if (!data.job_title.trim()) return "Job title is required";
      if (!data.start_date) return "Start date is required";
    }
    if (s === 3) {
      if (!data.pay_rate || data.pay_rate <= 0) return "Pay rate must be greater than 0";
    }
    if (s === 4) {
      if (data.bank_account_last4 && data.bank_account_last4 !== data.bank_account_confirm) {
        return "Account numbers don't match";
      }
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    setStep((s) => Math.min(5, s + 1));
  }
  function back() { setStep((s) => Math.max(1, s - 1)); }

  async function submit() {
    const err = validateStep(4);
    if (err) { toast.error(err); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not signed in"); return; }
    if (!currentId) { toast.error("No active company"); return; }

    setSubmitting(true);
    const payload: any = {
      full_name: `${data.first_name} ${data.last_name}`.trim(),
      email: data.work_email || data.personal_email || null,
      phone: data.phone || null,
      address_line1: data.address_line1 || null,
      date_of_birth: data.date_of_birth || null,
      ssn_last4: (data.ssn_last4 || "").slice(-4),
      job_title: data.job_title || null,
      department: data.department || null,
      start_date: data.start_date || null,
      employment_type: data.employment_type,
      pay_type: data.pay_type,
      pay_rate: Number(data.pay_rate) || 0,
      filing_status: data.filing_status,
      extra_withholding: Number(data.extra_withholding) || 0,
      bank_account_type: data.bank_account_type,
      bank_routing_last4: (data.bank_routing_last4 || "").slice(-4),
      bank_account_last4: (data.bank_account_last4 || "").slice(-4),
      direct_deposit_enabled: !!data.bank_account_last4,
      status: "active",
      owner_id: user.id,
      company_id: currentId,
    };
    const { data: row, error } = await supabase.from("employees").insert(payload).select("id").single();
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setCreatedId(row?.id ?? null);
    onCreated?.(row?.id ?? "");
    setStep(6); // success
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); else onOpenChange(true); }}>
      <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] overflow-hidden p-0 gap-0">
        <div className="flex flex-col h-[92vh]">
          {/* progress bar header */}
          {step <= 5 && (
            <div className="border-b border-[color:var(--unit-hairline)] bg-white px-8 py-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-slate-500">Step {step} of 5</div>
                <button onClick={close} className="text-sm text-slate-500 hover:text-slate-900">Cancel</button>
              </div>
              <div className="flex items-center gap-2">
                {STEPS.map((s, i) => (
                  <div key={s.id} className="flex-1 flex items-center gap-2">
                    <div
                      className={`h-1.5 rounded-full flex-1 transition-colors ${
                        step > s.id ? "bg-primary" : step === s.id ? "bg-primary" : "bg-slate-200"
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {(() => {
                  const Cur = STEPS[step - 1].icon;
                  return <Cur className="h-4 w-4 text-primary" />;
                })()}
                <div className="text-sm font-semibold text-slate-700">{STEPS[step - 1].label}</div>
              </div>
            </div>
          )}

          {/* body */}
          <div className="flex-1 overflow-y-auto px-8 py-8 bg-white">
            {step === 1 && (
              <StepLayout title="Personal Information" subtitle="Start with the basics about this new hire.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
                  <WField label="First Name" required>
                    <Input className="h-12" value={data.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="Jane" />
                  </WField>
                  <WField label="Last Name" required>
                    <Input className="h-12" value={data.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Doe" />
                  </WField>
                  <WField label="Personal Email">
                    <Input className="h-12" type="email" value={data.personal_email} onChange={(e) => set("personal_email", e.target.value)} placeholder="jane@gmail.com" />
                  </WField>
                  <WField label="Work Email">
                    <Input className="h-12" type="email" value={data.work_email} onChange={(e) => set("work_email", e.target.value)} placeholder="jane@company.com" />
                  </WField>
                  <WField label="Phone Number">
                    <Input className="h-12" value={data.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" />
                  </WField>
                  <WField label="Date of Birth">
                    <Input className="h-12" type="date" value={data.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
                  </WField>
                  <WField label="Home Address" className="md:col-span-2">
                    <Input className="h-12" value={data.address_line1} onChange={(e) => set("address_line1", e.target.value)} placeholder="123 Main St, San Francisco, CA 94102" />
                  </WField>
                  <WField label="SSN (last 4 digits)" hint="We only store the last 4 digits for verification.">
                    <Input className="h-12" value={data.ssn_last4} onChange={(e) => set("ssn_last4", e.target.value.replace(/\D/g, "").slice(-4))} placeholder="1234" maxLength={4} />
                  </WField>
                </div>
              </StepLayout>
            )}

            {step === 2 && (
              <StepLayout title="Job Information" subtitle="Where do they fit in your organization?">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
                  <WField label="Job Title" required>
                    <Input className="h-12" value={data.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="Senior Engineer" />
                  </WField>
                  <WField label="Department">
                    <Input className="h-12" value={data.department} onChange={(e) => set("department", e.target.value)} placeholder="Engineering" />
                  </WField>
                  <WField label="Start Date" required>
                    <Input className="h-12" type="date" value={data.start_date} onChange={(e) => set("start_date", e.target.value)} />
                  </WField>
                  <WField label="Work Location">
                    <Input className="h-12" value={data.work_location} onChange={(e) => set("work_location", e.target.value)} placeholder="San Francisco HQ" />
                  </WField>
                  <WField label="Employment Type" className="md:col-span-2">
                    <div className="grid grid-cols-2 gap-3">
                      <TypeCard
                        selected={data.employment_type === "w2"}
                        title="W-2 Employee"
                        desc="Standard payroll with tax withholding and benefits."
                        onClick={() => set("employment_type", "w2")}
                      />
                      <TypeCard
                        selected={data.employment_type === "1099"}
                        title="1099 Contractor"
                        desc="Independent contractor — no tax withholding."
                        onClick={() => set("employment_type", "1099")}
                      />
                    </div>
                  </WField>
                  <WField label="Employee ID" hint="Optional — auto-generated if blank.">
                    <Input className="h-12" value={data.employee_id} onChange={(e) => set("employee_id", e.target.value)} placeholder="EMP-001" />
                  </WField>
                </div>
              </StepLayout>
            )}

            {step === 3 && (
              <StepLayout title="Pay Information" subtitle="How and how much will they be paid?">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
                  <WField label="Pay Type" className="md:col-span-2">
                    <div className="grid grid-cols-2 gap-3">
                      <TypeCard
                        selected={data.pay_type === "salary"}
                        title="Salary"
                        desc="Fixed annual amount, paid evenly each period."
                        onClick={() => set("pay_type", "salary")}
                      />
                      <TypeCard
                        selected={data.pay_type === "hourly"}
                        title="Hourly"
                        desc="Paid per hour worked, supports overtime."
                        onClick={() => set("pay_type", "hourly")}
                      />
                    </div>
                  </WField>
                  <WField label={data.pay_type === "salary" ? "Annual Salary ($)" : "Hourly Rate ($)"} required>
                    <Input className="h-12" type="number" min={0} step="0.01" value={data.pay_rate || ""} onChange={(e) => set("pay_rate", Number(e.target.value))} placeholder={data.pay_type === "salary" ? "75000" : "25.00"} />
                  </WField>
                  <WField label="Pay Frequency">
                    <Select value={data.pay_frequency} onValueChange={(v) => set("pay_frequency", v)}>
                      <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="semimonthly">Semi-monthly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </WField>
                  <WField label="Federal Filing Status">
                    <Select value={data.filing_status} onValueChange={(v) => set("filing_status", v)}>
                      <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single / Married filing separately</SelectItem>
                        <SelectItem value="married">Married filing jointly</SelectItem>
                        <SelectItem value="head">Head of household</SelectItem>
                      </SelectContent>
                    </Select>
                  </WField>
                  <WField label="Additional Withholding per Paycheck ($)" hint="From W-4 Step 4(c). Optional.">
                    <Input className="h-12" type="number" min={0} step="0.01" value={data.extra_withholding || ""} onChange={(e) => set("extra_withholding", Number(e.target.value))} placeholder="0" />
                  </WField>
                </div>
              </StepLayout>
            )}

            {step === 4 && (
              <StepLayout title="Direct Deposit" subtitle="Where should their paycheck land? Optional — leave blank for paper checks.">
                <div className="max-w-3xl space-y-5">
                  <div className="flex gap-3 rounded-xl bg-primary/5 border border-primary/20 p-4 text-sm">
                    <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">Encrypted and secure</div>
                      <div className="text-slate-600 mt-0.5">We only store the last 4 digits of bank credentials. Full details are passed directly to your payment processor.</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <WField label="Bank Name" className="md:col-span-2">
                      <Input className="h-12" value={data.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="Chase Bank" />
                    </WField>
                    <WField label="Account Type" className="md:col-span-2">
                      <div className="grid grid-cols-2 gap-3">
                        <TypeCard
                          selected={data.bank_account_type === "checking"}
                          title="Checking"
                          desc="Standard everyday account."
                          onClick={() => set("bank_account_type", "checking")}
                        />
                        <TypeCard
                          selected={data.bank_account_type === "savings"}
                          title="Savings"
                          desc="Savings account."
                          onClick={() => set("bank_account_type", "savings")}
                        />
                      </div>
                    </WField>
                    <WField label="Routing Number (last 4)">
                      <Input className="h-12" value={data.bank_routing_last4} onChange={(e) => set("bank_routing_last4", e.target.value.replace(/\D/g, "").slice(-4))} maxLength={4} placeholder="1234" />
                    </WField>
                    <WField label="Account Number (last 4)">
                      <Input className="h-12" value={data.bank_account_last4} onChange={(e) => set("bank_account_last4", e.target.value.replace(/\D/g, "").slice(-4))} maxLength={4} placeholder="5678" />
                    </WField>
                    <WField label="Confirm Account Number" className="md:col-span-2">
                      <Input className="h-12" value={data.bank_account_confirm} onChange={(e) => set("bank_account_confirm", e.target.value.replace(/\D/g, "").slice(-4))} maxLength={4} placeholder="5678" />
                    </WField>
                  </div>
                </div>
              </StepLayout>
            )}

            {step === 5 && (
              <StepLayout title="Review and Confirm" subtitle="Double-check everything before adding this employee.">
                <div className="max-w-3xl space-y-4">
                  <ReviewSection title="Personal" onEdit={() => setStep(1)}>
                    <ReviewRow label="Name" value={`${data.first_name} ${data.last_name}`} />
                    <ReviewRow label="Personal Email" value={data.personal_email || "—"} />
                    <ReviewRow label="Work Email" value={data.work_email || "—"} />
                    <ReviewRow label="Phone" value={data.phone || "—"} />
                    <ReviewRow label="DOB" value={data.date_of_birth || "—"} />
                    <ReviewRow label="SSN" value={data.ssn_last4 ? `•••-••-${data.ssn_last4}` : "—"} />
                  </ReviewSection>
                  <ReviewSection title="Job" onEdit={() => setStep(2)}>
                    <ReviewRow label="Job Title" value={data.job_title} />
                    <ReviewRow label="Department" value={data.department || "—"} />
                    <ReviewRow label="Start Date" value={data.start_date} />
                    <ReviewRow label="Type" value={data.employment_type === "w2" ? "W-2 Employee" : "1099 Contractor"} />
                    <ReviewRow label="Work Location" value={data.work_location || "—"} />
                  </ReviewSection>
                  <ReviewSection title="Pay" onEdit={() => setStep(3)}>
                    <ReviewRow label="Pay Type" value={data.pay_type === "salary" ? "Salary" : "Hourly"} />
                    <ReviewRow label="Pay Rate" value={data.pay_type === "salary" ? `$${data.pay_rate.toLocaleString()}/yr` : `$${data.pay_rate}/hr`} />
                    <ReviewRow label="Frequency" value={data.pay_frequency} />
                    <ReviewRow label="Filing Status" value={data.filing_status} />
                  </ReviewSection>
                  <ReviewSection title="Direct Deposit" onEdit={() => setStep(4)}>
                    <ReviewRow label="Bank" value={data.bank_name || "—"} />
                    <ReviewRow label="Account Type" value={data.bank_account_type} />
                    <ReviewRow label="Routing" value={data.bank_routing_last4 ? `••••${data.bank_routing_last4}` : "—"} />
                    <ReviewRow label="Account" value={data.bank_account_last4 ? `••••${data.bank_account_last4}` : "Paper check"} />
                  </ReviewSection>
                </div>
              </StepLayout>
            )}

            {step === 6 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-lg">
                  <div className="mx-auto w-20 h-20 rounded-full bg-emerald-50 grid place-items-center mb-6 animate-in zoom-in-50 duration-500">
                    <Check className="h-10 w-10 text-emerald-600" strokeWidth={3} />
                  </div>
                  <h2 className="font-display text-3xl font-semibold text-slate-900 mb-2">Employee added successfully</h2>
                  <p className="text-slate-500 mb-8">An invitation email has been sent to {data.work_email || data.personal_email || "their email address"}.</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {createdId && (
                      <Button
                        size="lg"
                        className="h-12 rounded-full bg-foreground text-background hover:bg-foreground/90 px-6"
                        onClick={() => { onOpenChange(false); navigate({ to: "/app/employees/$id", params: { id: createdId } }); }}
                      >
                        Go to Employee Profile
                      </Button>
                    )}
                    <Button size="lg" variant="outline" className="h-12 rounded-full px-6" onClick={reset}>
                      Add Another Employee
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* footer */}
          {step <= 5 && (
            <div className="border-t border-[color:var(--unit-hairline)] bg-white px-8 py-5 flex items-center justify-between">
              <Button variant="ghost" onClick={back} disabled={step === 1} className="rounded-full">
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
              {step < 5 ? (
                <Button onClick={next} size="lg" className="h-12 px-6 rounded-full bg-foreground text-background hover:bg-foreground/90">
                  Next: {STEPS[step]?.label} <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              ) : (
                <Button onClick={submit} disabled={submitting} size="lg" className="h-12 px-8 rounded-full bg-foreground text-background hover:bg-foreground/90">
                  <Lock className="h-4 w-4 mr-2" />
                  {submitting ? "Adding…" : "Add Employee"}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="text-slate-500 mt-1 mb-8">{subtitle}</p>
      {children}
    </div>
  );
}

function WField({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-primary">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function TypeCard({ selected, title, desc, onClick }: { selected: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-all ${
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-[color:var(--unit-hairline)] bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold text-slate-900">{title}</div>
        {selected && <Check className="h-4 w-4 text-primary" />}
      </div>
      <div className="text-xs text-slate-500">{desc}</div>
    </button>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--unit-hairline)] bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
        <button onClick={onEdit} className="text-sm font-medium text-primary hover:underline">Edit</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2">
        {children}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium text-slate-900">{value}</div>
    </div>
  );
}
