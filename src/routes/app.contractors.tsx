import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { fmtUSD } from "@/lib/payroll";
import { Briefcase, Plus, DollarSign, Download, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/contractors")({
  head: () => ({ meta: [{ title: "Contractors (1099) — Paylo" }] }),
  component: ContractorsPage,
});

interface Contractor {
  id: string;
  full_name: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  tax_id_type: string | null;
  tax_id_last4: string | null;
  payment_method: string | null;
  hourly_rate: number | null;
  status: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}
interface Payment {
  id: string;
  contractor_id: string;
  contractor_name: string;
  amount: number;
  payment_date: string;
  description: string | null;
  category: string | null;
  status: string;
}

function ContractorsPage() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const year = new Date().getFullYear();

  async function load() {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("contractors").select("*").order("created_at", { ascending: false }),
      supabase.from("contractor_payments").select("*").order("payment_date", { ascending: false }),
    ]);
    setContractors((c ?? []) as Contractor[]);
    setPayments((p ?? []) as Payment[]);
  }
  useEffect(() => { load(); }, []);

  async function save(form: FormData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      owner_id: user.id,
      full_name: String(form.get("full_name") || "").trim(),
      business_name: String(form.get("business_name") || "") || null,
      email: String(form.get("email") || "") || null,
      phone: String(form.get("phone") || "") || null,
      address_line1: String(form.get("address_line1") || "") || null,
      city: String(form.get("city") || "") || null,
      state: String(form.get("state") || "") || null,
      zip: String(form.get("zip") || "") || null,
      tax_id_type: String(form.get("tax_id_type") || "SSN"),
      tax_id_last4: String(form.get("tax_id_last4") || "").slice(-4) || null,
      payment_method: String(form.get("payment_method") || "ach"),
      bank_routing_last4: String(form.get("bank_routing_last4") || "").slice(-4) || null,
      bank_account_last4: String(form.get("bank_account_last4") || "").slice(-4) || null,
      hourly_rate: Number(form.get("hourly_rate") || 0) || null,
      status: "active",
    };
    if (!payload.full_name) { toast.error("Name required"); return; }
    const { error } = editing
      ? await supabase.from("contractors").update(payload).eq("id", editing.id)
      : await supabase.from("contractors").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Contractor updated" : "Contractor added");
    setOpen(false); setEditing(null); load();
  }

  async function pay(form: FormData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const cid = String(form.get("contractor_id") || "");
    const c = contractors.find((x) => x.id === cid);
    if (!c) { toast.error("Pick a contractor"); return; }
    const amount = Number(form.get("amount") || 0);
    if (amount <= 0) { toast.error("Amount must be > 0"); return; }
    const { error } = await supabase.from("contractor_payments").insert({
      owner_id: user.id,
      contractor_id: cid,
      contractor_name: c.full_name,
      amount,
      payment_date: String(form.get("payment_date") || new Date().toISOString().slice(0, 10)),
      description: String(form.get("description") || "") || null,
      category: "nonemployee_compensation",
      payment_method: c.payment_method ?? "ach",
      status: "paid",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Payment recorded");
    setPayOpen(false); load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this contractor?")) return;
    await supabase.from("contractors").delete().eq("id", id);
    load();
  }

  // Year-to-date totals per contractor (used for 1099-NEC preview)
  const ytdByContractor = new Map<string, number>();
  payments
    .filter((p) => p.payment_date.startsWith(String(year)))
    .forEach((p) => ytdByContractor.set(p.contractor_id, (ytdByContractor.get(p.contractor_id) ?? 0) + Number(p.amount)));

  function download1099(c: Contractor) {
    const total = ytdByContractor.get(c.id) ?? 0;
    const lines = [
      `FORM 1099-NEC PREVIEW (not an official IRS form)`,
      `Tax Year: ${year}`,
      ``,
      `PAYER (your company)`,
      `Configure under Company Settings`,
      ``,
      `RECIPIENT`,
      `Name:    ${c.full_name}${c.business_name ? ` (${c.business_name})` : ""}`,
      `Address: ${[c.address_line1, c.city, c.state, c.zip].filter(Boolean).join(", ") || "—"}`,
      `TIN:     ${c.tax_id_type || "SSN"} ending ${c.tax_id_last4 || "----"}`,
      ``,
      `Box 1  Nonemployee compensation:   ${fmtUSD(total)}`,
      `Box 4  Federal income tax withheld: ${fmtUSD(0)}`,
      ``,
      total >= 600
        ? `>= $600 threshold met — 1099-NEC filing required.`
        : `Below the $600 federal threshold — 1099-NEC not typically required.`,
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `1099-NEC-preview-${c.full_name.replace(/\s+/g, "_")}-${year}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Contractors (1099)</h1>
          <p className="text-sm text-muted-foreground">Pay independent contractors and generate year-end 1099-NEC forms.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-full gap-1.5"><DollarSign className="h-4 w-4" /> Record payment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record a contractor payment</DialogTitle></DialogHeader>
              <form action={pay} className="space-y-3">
                <div><Label>Contractor</Label>
                  <select name="contractor_id" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" required>
                    <option value="">Choose…</option>
                    {contractors.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.business_name ? ` — ${c.business_name}` : ""}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Amount (USD)</Label><Input name="amount" type="number" step="0.01" required /></div>
                  <div><Label>Date</Label><Input name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
                </div>
                <div><Label>Description</Label><Input name="description" placeholder="Invoice #, project, etc." /></div>
                <DialogFooter><Button type="submit" className="rounded-full">Record payment</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="rounded-full gap-1.5 bg-[#2563EB] text-background hover:bg-foreground/90"><Plus className="h-4 w-4" /> Add contractor</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editing ? "Edit contractor" : "Add a contractor"}</DialogTitle></DialogHeader>
              <form action={save} className="space-y-3">
                <Tabs defaultValue="basics">
                  <TabsList><TabsTrigger value="basics">Basics</TabsTrigger><TabsTrigger value="tax">Tax (W-9)</TabsTrigger><TabsTrigger value="bank">Payment</TabsTrigger></TabsList>
                  <TabsContent value="basics" className="space-y-3 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Full name</Label><Input name="full_name" defaultValue={editing?.full_name} required /></div>
                      <div><Label>Business name</Label><Input name="business_name" defaultValue={editing?.business_name ?? ""} /></div>
                      <div><Label>Email</Label><Input name="email" type="email" defaultValue={editing?.email ?? ""} /></div>
                      <div><Label>Phone</Label><Input name="phone" defaultValue={editing?.phone ?? ""} /></div>
                      <div className="col-span-2"><Label>Address</Label><Input name="address_line1" defaultValue={editing?.address_line1 ?? ""} /></div>
                      <div><Label>City</Label><Input name="city" defaultValue={editing?.city ?? ""} /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label>State</Label><Input name="state" maxLength={2} defaultValue={editing?.state ?? ""} /></div>
                        <div><Label>ZIP</Label><Input name="zip" defaultValue={editing?.zip ?? ""} /></div>
                      </div>
                      <div><Label>Hourly rate (optional)</Label><Input name="hourly_rate" type="number" step="0.01" defaultValue={editing?.hourly_rate ?? ""} /></div>
                    </div>
                  </TabsContent>
                  <TabsContent value="tax" className="space-y-3 pt-3">
                    <p className="text-xs text-muted-foreground">From the contractor's signed Form W-9. Used to generate the 1099-NEC at year end.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>TIN type</Label>
                        <select name="tax_id_type" defaultValue={editing?.tax_id_type ?? "SSN"} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                          <option value="SSN">SSN (individual)</option>
                          <option value="EIN">EIN (business)</option>
                        </select>
                      </div>
                      <div><Label>Last 4 of TIN</Label><Input name="tax_id_last4" maxLength={4} defaultValue={editing?.tax_id_last4 ?? ""} /></div>
                    </div>
                  </TabsContent>
                  <TabsContent value="bank" className="space-y-3 pt-3">
                    <div><Label>Payment method</Label>
                      <select name="payment_method" defaultValue={editing?.payment_method ?? "ach"} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                        <option value="ach">Direct deposit (ACH)</option>
                        <option value="check">Check</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Routing # (last 4)</Label><Input name="bank_routing_last4" maxLength={4} /></div>
                      <div><Label>Account # (last 4)</Label><Input name="bank_account_last4" maxLength={4} /></div>
                    </div>
                  </TabsContent>
                </Tabs>
                <DialogFooter><Button type="submit" className="rounded-full">{editing ? "Save" : "Add contractor"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium flex items-center gap-2"><Briefcase className="h-4 w-4" /> Active contractors</div>
        {contractors.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No contractors yet. Add your first one to start paying and tracking 1099 totals.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-3 py-3">TIN</th>
                  <th className="px-3 py-3">Method</th>
                  <th className="px-3 py-3">{year} YTD paid</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((c) => {
                  const ytd = ytdByContractor.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="px-5 py-3">
                        <div className="font-medium">{c.full_name}</div>
                        <div className="text-xs text-muted-foreground">{c.business_name || c.email || "—"}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">{c.tax_id_type || "SSN"} ••• {c.tax_id_last4 || "----"}</td>
                      <td className="px-3 py-3 text-xs uppercase">{c.payment_method}</td>
                      <td className="px-3 py-3 font-medium">
                        {fmtUSD(ytd)}
                        {ytd >= 600 && <span className="ml-2 rounded-full bg-[#2563EB] px-2 py-0.5 text-[10px] font-semibold text-background">1099 required</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" className="rounded-full gap-1" onClick={() => download1099(c)}><Download className="h-3.5 w-3.5" /> 1099-NEC</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>Edit</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium">Recent payments</div>
        {payments.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No payments recorded yet.</div>
        ) : (
          <div className="divide-y">
            {payments.slice(0, 12).map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{p.contractor_name}</div>
                  <div className="text-xs text-muted-foreground">{p.payment_date}{p.description ? ` · ${p.description}` : ""}</div>
                </div>
                <div className="font-semibold">{fmtUSD(p.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
