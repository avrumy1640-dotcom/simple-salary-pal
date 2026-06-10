import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEmployee } from "@/lib/useMyEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/profile")({
  head: () => ({ meta: [{ title: "My profile — Paylo" }] }),
  component: Page,
});

function Page() {
  const { employee, loading, reload } = useMyEmployee();
  const [form, setForm] = useState({
    phone: "", address_line1: "", city: "", zip: "",
    emergency_contact_name: "", emergency_contact_phone: "",
  });

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
    const { error } = await supabase.from("employees").update(form).eq("id", employee.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); reload();
  }

  if (loading) return null;
  if (!employee) return <p className="text-sm text-muted-foreground">No employee record found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My profile</h1>
        <p className="text-sm text-muted-foreground">Keep your contact details up to date.</p>
      </div>

      <div className="rounded-2xl border bg-card p-6 space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Name</div>
          <div className="font-medium">{employee.full_name}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Email</div>
          <div className="font-medium">{employee.email ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Role</div>
          <div className="font-medium">{employee.job_title ?? "—"}</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Address</Label><Input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>ZIP</Label><Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
          <div><Label>Emergency contact</Label><Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></div>
          <div><Label>Emergency phone</Label><Input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></div>
        </div>

        <Button onClick={save}>Save changes</Button>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h2 className="font-semibold">Direct deposit</h2>
        <p className="text-sm text-muted-foreground">
          {employee.direct_deposit_enabled
            ? `Active — ${employee.bank_account_type ?? "account"} •••• ${employee.bank_account_last4 ?? "----"}`
            : "Not set up yet. Ask HR to enable direct deposit."}
        </p>
      </div>
    </div>
  );
}
