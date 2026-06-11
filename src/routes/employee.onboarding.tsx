import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { submitOnboarding, getMyOnboardingStatus } from "@/lib/onboarding.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight, User, FileText, Landmark, ShieldCheck, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employee/onboarding")({
  head: () => ({ meta: [{ title: "Get started — Paylo" }] }),
  component: OnboardingPage,
});

const STEPS = [
  { key: "personal", label: "About you", icon: User },
  { key: "w4", label: "Tax info", icon: FileText },
  { key: "dd", label: "Direct deposit", icon: Landmark },
  { key: "review", label: "Review & sign", icon: ShieldCheck },
  { key: "done", label: "Done", icon: PartyPopper },
] as const;

interface PersonalForm {
  date_of_birth: string; ssn_last4: string; phone: string;
  address_line1: string; address_line2: string; city: string; state: string; zip: string;
  emergency_contact_name: string; emergency_contact_phone: string;
}
interface W4Form { filing_status: "single" | "married" | "head_of_household"; dependents: string; extra_withholding: string }
interface DDForm { bank_account_type: "checking" | "savings"; routing_full: string; account_full: string; confirm_account: string }

function OnboardingPage() {
  const navigate = useNavigate();
  const statusFn = useServerFn(getMyOnboardingStatus);
  const submitFn = useServerFn(submitOnboarding);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employeeName, setEmployeeName] = useState("");

  const [personal, setPersonal] = useState<PersonalForm>({
    date_of_birth: "", ssn_last4: "", phone: "",
    address_line1: "", address_line2: "", city: "", state: "", zip: "",
    emergency_contact_name: "", emergency_contact_phone: "",
  });
  const [w4, setW4] = useState<W4Form>({ filing_status: "single", dependents: "0", extra_withholding: "0" });
  const [dd, setDD] = useState<DDForm>({ bank_account_type: "checking", routing_full: "", account_full: "", confirm_account: "" });
  const [ackHandbook, setAckHandbook] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res: any = await statusFn({});
        if (res?.complete) {
          setStep(4);
        } else if (res?.employee) {
          const e = res.employee;
          setEmployeeName(e.full_name || "");
          setPersonal((p) => ({
            ...p,
            date_of_birth: e.date_of_birth ?? "",
            ssn_last4: e.ssn_last4 ?? "",
            phone: e.phone ?? "",
            address_line1: e.address_line1 ?? "",
            city: e.city ?? "",
            state: e.state ?? "",
            zip: e.zip ?? "",
            emergency_contact_name: e.emergency_contact_name ?? "",
            emergency_contact_phone: e.emergency_contact_phone ?? "",
          }));
          if (e.filing_status) setW4({ filing_status: e.filing_status, dependents: String(e.dependents ?? 0), extra_withholding: String(e.extra_withholding ?? 0) });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const personalValid = useMemo(() =>
    !!(personal.date_of_birth && personal.ssn_last4.match(/^\d{4}$/) && personal.address_line1 && personal.city && personal.state && personal.zip && personal.emergency_contact_name && personal.emergency_contact_phone),
    [personal],
  );
  const w4Valid = !!w4.filing_status;
  const ddValid = useMemo(() =>
    /^\d{9}$/.test(dd.routing_full) && /^\d{4,17}$/.test(dd.account_full) && dd.account_full === dd.confirm_account,
    [dd],
  );

  async function handleSubmit() {
    if (!personalValid || !w4Valid || !ddValid) { toast.error("Please complete every section first"); return; }
    setSubmitting(true);
    try {
      await submitFn({
        data: {
          personal: {
            date_of_birth: personal.date_of_birth || null,
            ssn_last4: personal.ssn_last4 || null,
            phone: personal.phone || null,
            address_line1: personal.address_line1 || null,
            address_line2: personal.address_line2 || null,
            city: personal.city || null,
            state: personal.state || null,
            zip: personal.zip || null,
            emergency_contact_name: personal.emergency_contact_name || null,
            emergency_contact_phone: personal.emergency_contact_phone || null,
          },
          w4: {
            filing_status: w4.filing_status,
            dependents: Number(w4.dependents) || 0,
            extra_withholding: Number(w4.extra_withholding) || 0,
          },
          direct_deposit: {
            bank_account_type: dd.bank_account_type,
            routing_full: dd.routing_full,
            account_full: dd.account_full,
            direct_deposit_enabled: true,
          },
          acknowledge_handbook: ackHandbook,
        },
      });
      toast.success("You're all set!");
      setStep(4);
    } catch (e: any) {
      toast.error(e?.message || "Could not save onboarding");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Welcome{employeeName ? `, ${employeeName.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="mt-2 text-base text-slate-600">A few quick steps and you'll be ready for your first paycheck.</p>
      </div>

      {/* Stepper */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-1">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-2">
                  <div className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border-2 transition-all",
                    active && "border-slate-900 bg-primary text-slate-900",
                    done && "border-primary bg-primary text-slate-900",
                    !done && !active && "border-border bg-card text-slate-400",
                  )}>
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className={cn("hidden whitespace-nowrap text-xs font-semibold sm:block", active ? "text-slate-900" : "text-slate-500")}>{s.label}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mx-2 h-0.5 flex-1 rounded-full bg-border">
                    <div className="h-0.5 rounded-full bg-primary transition-all" style={{ width: i < step ? "100%" : "0%" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        {step === 0 && (
          <div className="space-y-5">
            <SectionHeader title="About you" subtitle="We need these for tax forms and emergencies." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date of birth"><Input type="date" value={personal.date_of_birth} onChange={(e) => setPersonal({ ...personal, date_of_birth: e.target.value })} /></Field>
              <Field label="Last 4 of SSN"><Input maxLength={4} inputMode="numeric" pattern="\d{4}" value={personal.ssn_last4} onChange={(e) => setPersonal({ ...personal, ssn_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field>
              <Field label="Phone"><Input value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} /></Field>
              <div />
              <Field label="Street address" wide><Input value={personal.address_line1} onChange={(e) => setPersonal({ ...personal, address_line1: e.target.value })} /></Field>
              <Field label="Apt / suite" wide><Input value={personal.address_line2} onChange={(e) => setPersonal({ ...personal, address_line2: e.target.value })} /></Field>
              <Field label="City"><Input value={personal.city} onChange={(e) => setPersonal({ ...personal, city: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="State"><Input maxLength={2} value={personal.state} onChange={(e) => setPersonal({ ...personal, state: e.target.value.toUpperCase() })} /></Field>
                <Field label="ZIP"><Input value={personal.zip} onChange={(e) => setPersonal({ ...personal, zip: e.target.value })} /></Field>
              </div>
              <Field label="Emergency contact name"><Input value={personal.emergency_contact_name} onChange={(e) => setPersonal({ ...personal, emergency_contact_name: e.target.value })} /></Field>
              <Field label="Emergency contact phone"><Input value={personal.emergency_contact_phone} onChange={(e) => setPersonal({ ...personal, emergency_contact_phone: e.target.value })} /></Field>
            </div>
            <NavRow disabled={!personalValid} onContinue={() => setStep(1)} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <SectionHeader title="Tax info (Form W-4)" subtitle="This decides how much federal tax comes out of each paycheck." />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Filing status">
                <Select value={w4.filing_status} onValueChange={(v: any) => setW4({ ...w4, filing_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="married">Married</SelectItem>
                    <SelectItem value="head_of_household">Head of household</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Dependents"><Input type="number" min={0} value={w4.dependents} onChange={(e) => setW4({ ...w4, dependents: e.target.value })} /></Field>
              <Field label="Extra withholding ($/check)"><Input type="number" min={0} value={w4.extra_withholding} onChange={(e) => setW4({ ...w4, extra_withholding: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-slate-500">Not sure? Pick Single and 0 dependents — you can adjust later in your profile.</p>
            <NavRow disabled={!w4Valid} onBack={() => setStep(0)} onContinue={() => setStep(2)} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <SectionHeader title="Direct deposit" subtitle="Where should we send your paychecks? We only store the last 4 digits." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account type">
                <Select value={dd.bank_account_type} onValueChange={(v: any) => setDD({ ...dd, bank_account_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Checking</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div />
              <Field label="Routing number (9 digits)"><Input inputMode="numeric" maxLength={9} value={dd.routing_full} onChange={(e) => setDD({ ...dd, routing_full: e.target.value.replace(/\D/g, "").slice(0, 9) })} /></Field>
              <div />
              <Field label="Account number"><Input inputMode="numeric" value={dd.account_full} onChange={(e) => setDD({ ...dd, account_full: e.target.value.replace(/\D/g, "").slice(0, 17) })} /></Field>
              <Field label="Confirm account number"><Input inputMode="numeric" value={dd.confirm_account} onChange={(e) => setDD({ ...dd, confirm_account: e.target.value.replace(/\D/g, "").slice(0, 17) })} /></Field>
            </div>
            {dd.account_full && dd.confirm_account && dd.account_full !== dd.confirm_account && (
              <p className="text-sm text-rose-600">Account numbers don't match.</p>
            )}
            <NavRow disabled={!ddValid} onBack={() => setStep(1)} onContinue={() => setStep(3)} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <SectionHeader title="Review & sign" subtitle="One last look before we save everything." />
            <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
              <Row k="Name" v={employeeName || "—"} />
              <Row k="Address" v={`${personal.address_line1}, ${personal.city}, ${personal.state} ${personal.zip}`} />
              <Row k="Emergency" v={`${personal.emergency_contact_name} · ${personal.emergency_contact_phone}`} />
              <Row k="Tax filing" v={`${w4.filing_status.replace("_", " ")} · ${w4.dependents} dependents · $${w4.extra_withholding} extra`} />
              <Row k="Direct deposit" v={`${dd.bank_account_type} ending in ${dd.account_full.slice(-4)}`} />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 hover:bg-surface">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={ackHandbook} onChange={(e) => setAckHandbook(e.target.checked)} />
              <div>
                <div className="font-semibold text-slate-900">I've reviewed the employee handbook</div>
                <div className="text-sm text-slate-500">We'll record an acknowledgment with today's date.</div>
              </div>
            </label>
            <NavRow
              onBack={() => setStep(2)}
              continueLabel={submitting ? "Saving…" : "Finish onboarding"}
              disabled={submitting}
              onContinue={handleSubmit}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5 text-center py-6">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <PartyPopper className="h-8 w-8" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-extrabold text-slate-900">You're all set</h2>
              <p className="mt-2 text-slate-600">Thanks for filling everything out. You can update any of this from your profile anytime.</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={() => navigate({ to: "/employee/home" })}>Go to dashboard</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/employee/profile" })}>View my info</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold text-slate-900">{title}</h2>
      <p className="mt-1 text-slate-600">{subtitle}</p>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{k}</span>
      <span className="font-semibold text-slate-900 text-right">{v}</span>
    </div>
  );
}

function NavRow({ onBack, onContinue, disabled, continueLabel }: { onBack?: () => void; onContinue: () => void; disabled?: boolean; continueLabel?: string }) {
  return (
    <div className="mt-2 flex justify-between gap-2">
      {onBack ? (
        <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
      ) : <div />}
      <Button size="lg" disabled={disabled} onClick={onContinue}>
        {continueLabel ?? "Continue"} <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}
