import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useCompany } from "@/hooks/useCompany";
import { Building2, Plus, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/companies")({
  head: () => ({ meta: [{ title: "Companies — Paylo" }] }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const { memberships, current, setCurrent } = useCompany();
  const [open, setOpen] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [busy, setBusy] = useState(false);

  async function createCompany() {
    if (!legalName.trim()) { toast.error("Enter a legal name"); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { data: company, error } = await supabase
      .from("companies")
      .insert({ owner_id: user.id, legal_name: legalName.trim() })
      .select().single();
    if (error) { toast.error(error.message); setBusy(false); return; }
    await supabase.from("company_users").insert({ company_id: company.id, user_id: user.id, is_default: false, accepted_at: new Date().toISOString() });
    await supabase.from("user_roles").insert({ user_id: user.id, company_id: company.id, role: "owner" });
    toast.success("Company created");
    setOpen(false); setLegalName(""); setBusy(false);
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-white/60">Run payroll for multiple businesses from one account.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New company</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a company</DialogTitle></DialogHeader>
            <div>
              <Label>Legal name</Label>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Acme, Inc." />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createCompany} disabled={busy}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {memberships.map((m) => (
          <button
            key={m.company_id}
            onClick={() => setCurrent(m.company_id)}
            className={`rounded-2xl border p-5 text-left transition ${current?.company_id === m.company_id ? "border-primary bg-primary/5" : "border-white/10 bg-card hover:border-white/20"}`}
          >
            <div className="flex items-center justify-between">
              <Building2 className="h-5 w-5 text-primary" />
              {current?.company_id === m.company_id ? <Check className="h-4 w-4 text-primary" /> : null}
            </div>
            <div className="mt-3 font-medium">{m.legal_name}</div>
            <div className="mt-1 text-xs text-white/50">{m.roles.join(" · ") || "no role"}</div>
            {m.is_default ? <div className="mt-2 text-[10px] uppercase tracking-wider text-primary">Default</div> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
