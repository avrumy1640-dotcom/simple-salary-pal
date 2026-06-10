import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Lock, Pencil, Check } from "lucide-react";

export const Route = createFileRoute("/employee/profile")({
  head: () => ({ meta: [{ title: "My info — Paylo" }] }),
  component: Page,
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value || "—"}</div>
    </div>
  );
}

function Page() {
  const { employee, loading, reload } = useMyEmployee();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    phone: "", address_line1: "", city: "", zip: "",
    emergency_contact_name: "", emergency_contact_phone: "",
  });
  const [bankOpen, setBankOpen] = useState(false);
  const [bank, setBank] = useState({ bank_name: "", account_type: "checking", routing: "", account: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setForm({
      phone: employee.phone ?? "",
      address_line1: employee.address_line1 ?? "",
      city: employee.city ?? "",
      zip: employee.zip ?? "",
      emergency_contact_name: employee.emergency_contact_name ?? "",
      emergency_contact_phone: employee.emergency_contact_phone ?? "",
    });
  }, [employee?.id]);

  async function save() {
    if (!employee) return;
    setBusy(true);
    const { error } = await supabase.from("employees").update(form).eq("id", employee.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Your information has been updated.");
    setEditing(false);
    reload();
  }

  async function saveBank() {
    if (!employee) return;
    if (bank.account !== bank.confirm) { toast.error("Account numbers do not match"); return; }
    if (!bank.routing || bank.routing.length < 4 || !bank.account || bank.account.length < 4) {
      toast.error("Please enter valid routing and account numbers"); return;
    }
    setBusy(true);
    const { error } = await supabase.from("employees").update({
      bank_account_type: bank.account_type,
      bank_routing_last4: bank.routing.slice(-4),
      bank_account_last4: bank.account.slice(-4),
      direct_deposit_enabled: true,
    }).eq("id", employee.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Your direct deposit has been updated. Changes take effect on your next paycheck.");
    setBankOpen(false);
    setBank({ bank_name: "", account_type: "checking", routing: "", account: "", confirm: "" });
    reload();
  }

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-8 unit-in">
      <div>
        <h1 className="font-display text-[28px] sm:text-[40px] font-extrabold tracking-tight text-slate-900">My Info</h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">Keep your personal and banking details up to date.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal information */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-lg font-bold text-slate-900">Personal information</div>
              <p className="text-sm text-slate-500">Contact details and emergency contact.</p>
            </div>
            {!editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>

          {!editing ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Full name" value={employee.full_name} />
              <Field label="Job title" value={employee.job_title ?? ""} />
              <Field label="Email" value={employee.email ?? ""} />
              <Field label="Phone" value={employee.phone ?? ""} />
              <div className="sm:col-span-2">
                <Field label="Home address" value={[employee.address_line1, employee.city, employee.zip].filter(Boolean).join(", ")} />
              </div>
              <Field label="Emergency contact" value={employee.emergency_contact_name ?? ""} />
              <Field label="Emergency phone" value={employee.emergency_contact_phone ?? ""} />
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Name <span className="text-slate-400">(read-only)</span></Label>
                  <div className="mt-1 flex h-12 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-slate-600">
                    <Lock className="h-3.5 w-3.5" /> {employee.full_name}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>Work email <span className="text-slate-400">(read-only)</span></Label>
                  <div className="mt-1 flex h-12 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-slate-600">
                    <Lock className="h-3.5 w-3.5" /> {employee.email ?? "—"}
                  </div>
                </div>
                <div><Label>Phone</Label><Input className="h-12" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Address</Label><Input className="h-12" value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></div>
                <div><Label>City</Label><Input className="h-12" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div><Label>ZIP</Label><Input className="h-12" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
                <div><Label>Emergency contact name</Label><Input className="h-12" value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></div>
                <div><Label>Emergency contact phone</Label><Input className="h-12" value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></div>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button onClick={save} disabled={busy}>
                  {busy ? "Saving…" : <><Check className="mr-1.5 h-4 w-4" /> Save changes</>}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Direct deposit */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div>
            <div className="font-display text-lg font-bold text-slate-900">Direct deposit</div>
            <p className="text-sm text-slate-500">Where your paycheck is deposited.</p>
          </div>

          {employee.direct_deposit_enabled ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-border bg-gradient-to-br from-slate-50 to-slate-100/50 p-5">
                <div className="text-xs uppercase tracking-wider text-slate-500">Active account</div>
                <div className="mt-1.5 font-display text-2xl font-extrabold tabular text-slate-900">
                  •••• {employee.bank_account_last4 ?? "----"}
                </div>
                <div className="mt-1 text-sm capitalize text-slate-600">
                  {employee.bank_account_type ?? "checking"} · routing •••• {employee.bank_routing_last4 ?? "----"}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-slate-600">
              Direct deposit isn't set up yet. Add a bank account to get paid faster.
            </div>
          )}

          <Dialog open={bankOpen} onOpenChange={setBankOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="mt-4 w-full h-12">
                {employee.direct_deposit_enabled ? "Update bank account" : "Add bank account"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{employee.direct_deposit_enabled ? "Update" : "Add"} direct deposit</DialogTitle></DialogHeader>
              <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" /> Your banking information is encrypted and secure.
              </div>
              <div className="space-y-3">
                <div><Label>Bank name</Label><Input className="h-12" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} placeholder="e.g. Chase" /></div>
                <div>
                  <Label>Account type</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {(["checking", "savings"] as const).map(t => (
                      <button key={t} type="button" onClick={() => setBank({ ...bank, account_type: t })}
                        className={`rounded-xl border-2 p-3 text-sm font-semibold capitalize transition ${bank.account_type === t ? "border-primary bg-primary/5 text-slate-900" : "border-border bg-card text-slate-600"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div><Label>Routing number</Label><Input className="h-12" inputMode="numeric" value={bank.routing} onChange={(e) => setBank({ ...bank, routing: e.target.value.replace(/\D/g, "") })} maxLength={9} /></div>
                <div><Label>Account number</Label><Input className="h-12" inputMode="numeric" value={bank.account} onChange={(e) => setBank({ ...bank, account: e.target.value.replace(/\D/g, "") })} /></div>
                <div><Label>Confirm account number</Label><Input className="h-12" inputMode="numeric" value={bank.confirm} onChange={(e) => setBank({ ...bank, confirm: e.target.value.replace(/\D/g, "") })} /></div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setBankOpen(false)}>Cancel</Button>
                <Button onClick={saveBank} disabled={busy}>{busy ? "Saving…" : "Save new account"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
