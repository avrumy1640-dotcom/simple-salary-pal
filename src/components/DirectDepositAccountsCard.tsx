import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Lock, Building2 } from "lucide-react";
import {
  listDirectDepositAccounts,
  upsertDirectDepositAccount,
  deleteDirectDepositAccount,
} from "@/lib/employee-extras.functions";

interface Account {
  id: string;
  nickname: string | null;
  account_type: "checking" | "savings";
  bank_name: string | null;
  routing_last4: string | null;
  account_last4: string | null;
  split_type: "percent" | "fixed" | "remainder";
  split_value: number | null;
  priority: number;
  active: boolean;
}

const empty = {
  id: undefined as string | undefined,
  nickname: "",
  account_type: "checking" as "checking" | "savings",
  bank_name: "",
  routing_number: "",
  account_number: "",
  confirm: "",
  split_type: "remainder" as "percent" | "fixed" | "remainder",
  split_value: "",
  priority: 1,
};

/**
 * Admin-only management of an employee's direct-deposit split accounts.
 * Stores full account/routing numbers in the encrypted PII vault.
 */
export function DirectDepositAccountsCard({
  employeeId,
  readOnly = false,
}: {
  employeeId: string;
  readOnly?: boolean;
}) {
  const list = useServerFn(listDirectDepositAccounts);
  const upsert = useServerFn(upsertDirectDepositAccount);
  const remove = useServerFn(deleteDirectDepositAccount);

  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await list({ data: { employee_id: employeeId } });
      setItems((res.items ?? []) as Account[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (employeeId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  function openNew() {
    setForm({ ...empty, priority: items.length + 1 });
    setOpen(true);
  }

  function openEdit(a: Account) {
    setForm({
      id: a.id,
      nickname: a.nickname ?? "",
      account_type: a.account_type,
      bank_name: a.bank_name ?? "",
      routing_number: "",
      account_number: "",
      confirm: "",
      split_type: a.split_type,
      split_value: a.split_value?.toString() ?? "",
      priority: a.priority,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.id) {
      if (!/^\d{9}$/.test(form.routing_number)) {
        toast.error("Routing number must be 9 digits");
        return;
      }
      if (!/^\d{4,17}$/.test(form.account_number)) {
        toast.error("Account number is invalid");
        return;
      }
      if (form.account_number !== form.confirm) {
        toast.error("Account numbers do not match");
        return;
      }
    }
    if (form.split_type !== "remainder") {
      const v = Number(form.split_value);
      if (!Number.isFinite(v) || v <= 0) {
        toast.error("Split value is required");
        return;
      }
      if (form.split_type === "percent" && v > 100) {
        toast.error("Percent cannot exceed 100");
        return;
      }
    }

    setBusy(true);
    try {
      await upsert({
        data: {
          id: form.id,
          employee_id: employeeId,
          nickname: form.nickname || null,
          account_type: form.account_type,
          bank_name: form.bank_name || null,
          routing_number: form.routing_number || undefined,
          account_number: form.account_number || undefined,
          split_type: form.split_type,
          split_value: form.split_type === "remainder" ? null : Number(form.split_value),
          priority: form.priority,
        },
      });
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Remove this account? This action is logged.")) return;
    try {
      await remove({ data: { id } });
      toast.success("Removed");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  function splitLabel(a: Account) {
    if (a.split_type === "remainder") return "Remaining balance";
    if (a.split_type === "percent") return `${a.split_value}%`;
    return `$${a.split_value?.toFixed(2)} per paycheck`;
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-bold text-slate-900">Direct deposit accounts</div>
          <p className="text-sm text-slate-500">Split your paycheck across multiple bank accounts.</p>
        </div>
        {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" onClick={openNew}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit account" : "Add bank account"}</DialogTitle>
              </DialogHeader>
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Full account and routing numbers are stored encrypted. Only the last 4 digits are ever displayed.</span>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nickname</Label>
                    <Input className="h-11" placeholder="Primary, Savings…" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
                  </div>
                  <div>
                    <Label>Bank name</Label>
                    <Input className="h-11" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Account type</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {(["checking", "savings"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, account_type: t })}
                        className={`rounded-xl border-2 p-2.5 text-sm font-semibold capitalize transition ${
                          form.account_type === t ? "border-primary bg-primary/5 text-slate-900" : "border-border bg-card text-slate-600"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {!form.id && (
                  <>
                    <div>
                      <Label>Routing number (9 digits)</Label>
                      <Input className="h-11" inputMode="numeric" maxLength={9} value={form.routing_number} onChange={(e) => setForm({ ...form, routing_number: e.target.value.replace(/\D/g, "") })} />
                    </div>
                    <div>
                      <Label>Account number</Label>
                      <Input className="h-11" inputMode="numeric" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value.replace(/\D/g, "") })} />
                    </div>
                    <div>
                      <Label>Confirm account number</Label>
                      <Input className="h-11" inputMode="numeric" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value.replace(/\D/g, "") })} />
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Split type</Label>
                    <Select value={form.split_type} onValueChange={(v) => setForm({ ...form, split_type: v as any })}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="remainder">Remainder</SelectItem>
                        <SelectItem value="percent">Percent</SelectItem>
                        <SelectItem value="fixed">Fixed amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.split_type !== "remainder" && (
                    <div>
                      <Label>{form.split_type === "percent" ? "Percent (1-100)" : "Amount per paycheck"}</Label>
                      <Input className="h-11" inputMode="decimal" value={form.split_value} onChange={(e) => setForm({ ...form, split_value: e.target.value })} />
                    </div>
                  )}
                </div>
                <div>
                  <Label>Priority (lower = paid first)</Label>
                  <Input className="h-11" type="number" min={1} max={10} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 1 })} />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-slate-600">
            No direct deposit accounts yet.
          </div>
        ) : (
          items.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <div className="font-semibold text-slate-900">
                    {a.nickname || a.bank_name || "Bank account"}
                  </div>
                  <span className="text-xs text-slate-500 capitalize">· {a.account_type}</span>
                </div>
                <div className="mt-1 text-xs tabular text-slate-600">
                  •••• {a.account_last4 ?? "----"} &nbsp;·&nbsp; routing •••• {a.routing_last4 ?? "----"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{splitLabel(a)}</span> · priority {a.priority}
                </div>
              </div>
              {!readOnly && (
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => del(a.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
