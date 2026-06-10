import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listCompanyUsers, updateUserRole, removeCompanyUser, inviteTeammate } from "@/lib/user-management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/users")({
  head: () => ({ meta: [{ title: "Users & Roles — Paylo" }] }),
  component: Page,
});

type Role =
  | "owner" | "admin" | "payroll_admin" | "hr_admin" | "manager"
  | "employee" | "supervisor" | "recruiter" | "benefits_admin"
  | "accountant" | "auditor";

interface Row { user_id: string; email: string; full_name: string; role: Role; accepted_at: string | null; }

const ROLES: Role[] = ["owner", "admin", "payroll_admin", "hr_admin", "manager", "supervisor", "employee", "recruiter", "benefits_admin", "accountant", "auditor"];

function Page() {
  const list = useServerFn(listCompanyUsers);
  const update = useServerFn(updateUserRole);
  const remove = useServerFn(removeCompanyUser);
  const invite = useServerFn(inviteTeammate);

  const [companyId, setCompanyId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", role: "employee" as Role });

  async function load(cid: string) {
    setLoading(true);
    try {
      const res = await list({ data: { companyId: cid } });
      setRows((res?.users ?? []) as Row[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: cu } = await supabase
        .from("company_users")
        .select("company_id, is_default")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .limit(1);
      const cid = cu?.[0]?.company_id;
      if (!cid) { setLoading(false); return; }
      setCompanyId(cid);
      load(cid);
    })();
  }, []);

  async function changeRole(userId: string, role: Role) {
    try {
      await update({ data: { companyId, userId, role } });
      toast.success("Role updated");
      load(companyId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  async function removeUser(userId: string) {
    if (!confirm("Remove this user from the company?")) return;
    try {
      await remove({ data: { companyId, userId } });
      toast.success("Removed");
      load(companyId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  async function submitInvite() {
    try {
      const res = await invite({ data: { companyId, email: form.email, role: form.role } });
      toast.success(res.invited ? "Invitation email sent" : "User added");
      setOpen(false);
      setForm({ email: "", role: "employee" });
      load(companyId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Users & roles</h1>
          <p className="text-sm text-muted-foreground">Invite teammates, assign roles, and remove access.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-1"><UserPlus className="h-4 w-4" /> Invite teammate</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a teammate</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submitInvite} disabled={!form.email}>Send invite</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="grid grid-cols-12 gap-3 border-b px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <div className="col-span-5">User</div>
          <div className="col-span-4">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No teammates yet.</div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.user_id} className="grid grid-cols-12 gap-3 items-center px-5 py-3 text-sm">
                <div className="col-span-5 min-w-0">
                  <div className="font-medium truncate">{r.full_name || r.email || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                </div>
                <div className="col-span-4">
                  <Select value={r.role} onValueChange={(v) => changeRole(r.user_id, v as Role)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((x) => <SelectItem key={x} value={x} className="capitalize">{x.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  {r.accepted_at ? "Active" : "Pending"}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button size="icon" variant="ghost" onClick={() => removeUser(r.user_id)} title="Remove">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
