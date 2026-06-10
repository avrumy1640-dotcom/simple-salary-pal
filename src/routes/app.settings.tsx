import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Info, Building2, Calendar, Bell, Palette, ShieldCheck, Plug } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";

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
  const [saving, setSaving] = useState(false);
  const { currentId } = useCompany();


  // Local-only preferences (notifications + branding)
  const [notif, setNotif] = useState({
    payrollReminders: true,
    taxDeadlines: true,
    newHire: true,
    ptoRequests: true,
    failedPayments: true,
  });
  const [brandColor, setBrandColor] = useState("background");
  const [signInEmail, setSignInEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setSignInEmail(user?.email ?? "");
      const { data } = await supabase.from("company_settings").select("*").maybeSingle();
      if (data) {
        setForm({
          legal_name: data.legal_name ?? "", ein: data.ein ?? "", state_tax_id: data.state_tax_id ?? "",
          business_address: data.business_address ?? "", business_city: data.business_city ?? "",
          business_state: data.business_state ?? "CA", business_zip: data.business_zip ?? "",
          pay_frequency: data.pay_frequency ?? "biweekly", next_pay_date: data.next_pay_date ?? "",
        });
      }
      const localNotif = localStorage.getItem("paylo_notif");
      if (localNotif) setNotif(JSON.parse(localNotif));
      const localBrand = localStorage.getItem("paylo_brand");
      if (localBrand) setBrandColor(localBrand);
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You're signed out — please sign back in to save.");
        return;
      }
      if (!currentId) { toast.error("No active company selected"); return; }
      const payload = { ...form, owner_id: user.id, company_id: currentId, onboarding_complete: !!form.legal_name && !!form.ein, next_pay_date: form.next_pay_date || null };
      const { error } = await supabase.from("company_settings").upsert(payload, { onConflict: "company_id" });
      if (error) { toast.error(error.message); return; }
      localStorage.setItem("paylo_notif", JSON.stringify(notif));
      localStorage.setItem("paylo_brand", brandColor);
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendPasswordReset() {
    if (!signInEmail) { toast.error("No sign-in email on file."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(signInEmail, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) toast.error(error.message);
    else toast.success(`Password reset link sent to ${signInEmail}`);
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Company settings</h1>
          <p className="text-muted-foreground mt-1">Configure how Paylo runs payroll for your business.</p>
        </div>
        <Button onClick={save} disabled={saving} className="gap-2 rounded-full bg-primary px-6 text-foreground hover:opacity-90">
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
        </Button>
      </header>

      <Tabs defaultValue="company" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto gap-1 p-1.5 bg-card/40 border border-primary/15">
          <TabsTrigger value="company" className="gap-2 py-3 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Building2 className="h-4 w-4" /> Company</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2 py-3 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Calendar className="h-4 w-4" /> Schedule</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 py-3 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Bell className="h-4 w-4" /> Notifications</TabsTrigger>
          <TabsTrigger value="branding" className="gap-2 py-3 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Palette className="h-4 w-4" /> Branding</TabsTrigger>
          <TabsTrigger value="security" className="gap-2 py-3 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><ShieldCheck className="h-4 w-4" /> Security</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-4 mt-6">
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
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4 mt-6">
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
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 mt-6">
          <Section title="Email notifications" hint="Choose what we email you about.">
            <ToggleRow label="Payroll processing reminders" desc="Heads-up a few days before each pay period closes." checked={notif.payrollReminders} onChange={(v) => setNotif({ ...notif, payrollReminders: v })} />
            <ToggleRow label="Tax deadline alerts" desc="Federal and state filing deadlines so you never miss one." checked={notif.taxDeadlines} onChange={(v) => setNotif({ ...notif, taxDeadlines: v })} />
            <ToggleRow label="New hire alerts" desc="Notify me when a new employee is added." checked={notif.newHire} onChange={(v) => setNotif({ ...notif, newHire: v })} />
            <ToggleRow label="PTO requests" desc="Get pinged when someone requests time off." checked={notif.ptoRequests} onChange={(v) => setNotif({ ...notif, ptoRequests: v })} />
            <ToggleRow label="Failed payments" desc="Critical alert if a direct deposit bounces." checked={notif.failedPayments} onChange={(v) => setNotif({ ...notif, failedPayments: v })} />
          </Section>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4 mt-6">
          <Section title="Pay stub branding" hint="Your accent color shows on pay stubs and exports.">
            <Field label="Brand color">
              <div className="flex items-center gap-3">
                <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-10 w-16 cursor-pointer rounded border" />
                <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="max-w-[160px]" />
                <div className="ml-auto rounded-lg border px-4 py-2 text-sm font-medium" style={{ background: brandColor, color: "#fff" }}>
                  Preview
                </div>
              </div>
            </Field>
            <Field label="Logo upload" hint="Coming soon — upload a PNG/SVG to brand pay stubs.">
              <Button variant="outline" disabled>Upload logo</Button>
            </Field>
          </Section>
        </TabsContent>

        <TabsContent value="security" className="space-y-4 mt-6">
          <Section title="Account security" hint="Manage how you sign in to Paylo.">
            <Field label="Sign-in email"><Input disabled value={signInEmail} placeholder="Loaded from your account" /></Field>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={sendPasswordReset}>Send password reset email</Button>
              <Button variant="outline" disabled>Enable 2FA (coming soon)</Button>
            </div>
          </Section>

          {/* Danger Zone */}
          <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-destructive" />
              <h2 className="text-base font-bold text-destructive">Danger zone</h2>
            </div>
            <p className="text-sm text-white/70">Permanent, destructive actions. These cannot be undone.</p>
            <div className="rounded-xl border border-destructive/30 bg-card/40 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-white">Delete account</div>
                <div className="text-xs text-white/60">Permanently removes your company, employees, and payroll history.</div>
              </div>
              <Button
                variant="outline"
                className="border-destructive/60 text-destructive hover:bg-destructive/10"
                onClick={() => toast.error("Contact support to delete your account.")}
              >
                Delete account
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="surface-glass rounded-2xl p-6 space-y-4">
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

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/40 p-4">
      <div className="min-w-0 pr-4">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
