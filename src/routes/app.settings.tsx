import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Info } from "lucide-react";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Company settings — Paylo" }] }),
  component: SettingsPage,
});

interface Settings {
  legal_name: string;
  ein: string;
  state_tax_id: string;
  business_address: string;
  business_city: string;
  business_state: string;
  business_zip: string;
  pay_frequency: string;
  next_pay_date: string;
}

const empty: Settings = {
  legal_name: "", ein: "", state_tax_id: "",
  business_address: "", business_city: "", business_state: "CA", business_zip: "",
  pay_frequency: "biweekly", next_pay_date: "",
};

function SettingsPage() {
  const [form, setForm] = useState<Settings>(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("company_settings").select("*").maybeSingle();
      if (data) {
        setForm({
          legal_name: data.legal_name ?? "",
          ein: data.ein ?? "",
          state_tax_id: data.state_tax_id ?? "",
          business_address: data.business_address ?? "",
          business_city: data.business_city ?? "",
          business_state: data.business_state ?? "CA",
          business_zip: data.business_zip ?? "",
          pay_frequency: data.pay_frequency ?? "biweekly",
          next_pay_date: data.next_pay_date ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = { ...form, owner_id: user.id, onboarding_complete: !!form.legal_name && !!form.ein, next_pay_date: form.next_pay_date || null };
    const { error } = await supabase.from("company_settings").upsert(payload, { onConflict: "owner_id" });
    if (error) { toast.error(error.message); return; }
    toast.success("Company settings saved");
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company settings</h1>
        <p className="text-sm text-muted-foreground">This is the info we use on your payroll runs, reports, and pay stubs.</p>
      </div>

      <Section title="Business information" hint="Your legal company info as registered with the IRS.">
        <Field label="Legal company name" hint="The exact name on your EIN paperwork.">
          <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="Acme Coffee LLC" />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="EIN (Employer ID number)" hint="9 digits from the IRS — format: 12-3456789.">
            <Input value={form.ein} onChange={(e) => setForm({ ...form, ein: e.target.value })} placeholder="12-3456789" />
          </Field>
          <Field label="State tax ID" hint="Issued by your state's tax/revenue department.">
            <Input value={form.state_tax_id} onChange={(e) => setForm({ ...form, state_tax_id: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
      </Section>

      <Section title="Business address" hint="Used on tax filings and pay stubs.">
        <Field label="Street address"><Input value={form.business_address} onChange={(e) => setForm({ ...form, business_address: e.target.value })} /></Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="City"><Input value={form.business_city} onChange={(e) => setForm({ ...form, business_city: e.target.value })} /></Field>
          <Field label="State"><Input maxLength={2} value={form.business_state} onChange={(e) => setForm({ ...form, business_state: e.target.value.toUpperCase() })} /></Field>
          <Field label="ZIP"><Input value={form.business_zip} onChange={(e) => setForm({ ...form, business_zip: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Pay schedule" hint="How often do you pay your team?">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Pay frequency" hint="Most US small businesses use biweekly (every 2 weeks).">
            <Select value={form.pay_frequency} onValueChange={(v) => setForm({ ...form, pay_frequency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly (52/year)</SelectItem>
                <SelectItem value="biweekly">Biweekly (26/year)</SelectItem>
                <SelectItem value="semimonthly">Semi-monthly (24/year — 1st & 15th)</SelectItem>
                <SelectItem value="monthly">Monthly (12/year)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Next pay date" hint="The date your team gets paid next.">
            <Input type="date" value={form.next_pay_date} onChange={(e) => setForm({ ...form, next_pay_date: e.target.value })} />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button onClick={save} className="gap-2 rounded-full bg-[oklch(0.62_0.22_260)] px-6 text-white hover:opacity-90">
          <Save className="h-4 w-4" /> Save settings
        </Button>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-medium">{label}</Label>
      {children}
      {hint && <p className="flex items-start gap-1 text-xs text-muted-foreground"><Info className="h-3 w-3 mt-0.5 flex-shrink-0" /> {hint}</p>}
    </div>
  );
}
