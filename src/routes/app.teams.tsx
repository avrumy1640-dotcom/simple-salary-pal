import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UsersRound, Plus, Pencil, Trash2, UserPlus, X } from "lucide-react";

export const Route = createFileRoute("/app/teams")({
  head: () => ({ meta: [{ title: "Teams — Paylo" }] }),
  component: TeamsPage,
});

interface Team {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  manager_id: string | null;
  color: string | null;
  active: boolean;
}
interface Member {
  id: string;
  team_id: string;
  employee_id: string;
  role: string | null;
  employee?: { full_name: string | null; job_title: string | null };
}
interface Employee { id: string; full_name: string | null; job_title: string | null }
interface Dept { id: string; name: string }

function TeamsPage() {
  const { currentId, hasRole } = useCompany();
  const canManage = hasRole("owner", "admin", "hr_admin", "manager");

  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTeam, setOpenTeam] = useState<Team | null>(null);
  const [editing, setEditing] = useState<Team | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", department_id: "", manager_id: "", color: "" });
  const [addEmpId, setAddEmpId] = useState("");
  const [addRole, setAddRole] = useState("");

  async function load() {
    if (!currentId) return;
    setLoading(true);
    const [t, m, e, d] = await Promise.all([
      supabase.from("teams").select("*").eq("company_id", currentId).order("name"),
      supabase.from("team_members")
        .select("id, team_id, employee_id, role, employee:employees(full_name, job_title)")
        .eq("company_id", currentId),
      supabase.from("employees").select("id, full_name, job_title")
        .eq("company_id", currentId).eq("lifecycle_status", "active").order("full_name"),
      supabase.from("departments").select("id, name").eq("company_id", currentId).order("name"),
    ]);
    setTeams((t.data ?? []) as Team[]);
    setMembers((m.data ?? []) as any);
    setEmployees((e.data ?? []) as Employee[]);
    setDepts((d.data ?? []) as Dept[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentId]);

  function startCreate() {
    setForm({ name: "", description: "", department_id: "", manager_id: "", color: "#3b82f6" });
    setCreating(true);
  }
  function startEdit(t: Team) {
    setForm({
      name: t.name, description: t.description ?? "",
      department_id: t.department_id ?? "", manager_id: t.manager_id ?? "",
      color: t.color ?? "",
    });
    setEditing(t);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) { toast.error("Name is required"); return; }
    if (!currentId) return;
    const payload: any = {
      name,
      description: form.description.trim() || null,
      department_id: form.department_id || null,
      manager_id: form.manager_id || null,
      color: form.color || null,
    };
    if (editing) {
      const { error } = await supabase.from("teams").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Team updated");
      setEditing(null);
    } else {
      const { error } = await supabase.from("teams").insert({ company_id: currentId, ...payload });
      if (error) { toast.error(error.message); return; }
      toast.success("Team created");
      setCreating(false);
    }
    load();
  }

  async function remove(t: Team) {
    if (!confirm(`Delete team "${t.name}"? Members will be unassigned.`)) return;
    const { error } = await supabase.from("teams").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Team removed");
    if (openTeam?.id === t.id) setOpenTeam(null);
    load();
  }

  async function addMember(team: Team) {
    if (!addEmpId || !currentId) return;
    const { error } = await supabase.from("team_members").insert({
      company_id: currentId, team_id: team.id, employee_id: addEmpId,
      role: addRole.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    setAddEmpId(""); setAddRole("");
    toast.success("Member added");
    load();
  }
  async function removeMember(m: Member) {
    const { error } = await supabase.from("team_members").delete().eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  const teamMembers = (id: string) => members.filter((m) => m.team_id === id);
  const availableEmployees = (id: string) => {
    const used = new Set(members.filter((m) => m.team_id === id).map((m) => m.employee_id));
    return employees.filter((e) => !used.has(e.id));
  };

  if (!canManage) return <div className="p-6 text-sm text-muted-foreground">You don't have permission to manage teams.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Teams</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-functional groupings used by scheduling, approvals, and announcements. Teams sit alongside departments.
          </p>
        </div>
        <Button onClick={startCreate} className="gap-2 rounded-full">
          <Plus className="h-4 w-4" /> New team
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_460px] gap-4">
        <div className="surface-glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading teams…</div>
          ) : teams.length === 0 ? (
            <div className="p-12 text-center">
              <UsersRound className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <div className="font-medium">No teams yet</div>
              <p className="text-sm text-muted-foreground mt-1">Create your first team to start grouping people across departments.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {teams.map((t) => {
                const mCount = teamMembers(t.id).length;
                const active = openTeam?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setOpenTeam(t)}
                      className={`w-full text-left px-5 py-4 hover:bg-muted/40 transition flex items-center gap-3 ${active ? "bg-muted/40" : ""}`}
                    >
                      <span className="h-9 w-9 rounded-xl grid place-items-center text-white" style={{ background: t.color ?? "var(--primary)" }}>
                        <UsersRound className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold truncate">{t.name}</span>
                          {!t.active && <span className="text-[10px] rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">Inactive</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {mCount} member{mCount === 1 ? "" : "s"}
                          {t.description ? ` • ${t.description}` : ""}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="surface-glass rounded-2xl p-5 h-fit sticky top-4">
          {openTeam ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{openTeam.name}</h3>
                  {openTeam.description && <p className="text-sm text-muted-foreground">{openTeam.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(openTeam)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(openTeam)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">Members</Label>
                <ul className="mt-2 space-y-1.5 max-h-[300px] overflow-y-auto">
                  {teamMembers(openTeam.id).map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                      <div>
                        <div className="text-sm font-medium">{m.employee?.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{m.role ?? m.employee?.job_title ?? ""}</div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeMember(m)}><X className="h-3.5 w-3.5" /></Button>
                    </li>
                  ))}
                  {teamMembers(openTeam.id).length === 0 && (
                    <li className="text-xs text-muted-foreground">No members yet.</li>
                  )}
                </ul>
              </div>

              <div className="border-t border-border/50 pt-3 space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Add member</Label>
                <div className="flex flex-col gap-2">
                  <Select value={addEmpId} onValueChange={setAddEmpId}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {availableEmployees(openTeam.id).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={addRole} onChange={(e) => setAddRole(e.target.value)} placeholder="Role on this team (optional)" />
                  <Button onClick={() => addMember(openTeam)} disabled={!addEmpId} className="gap-1.5">
                    <UserPlus className="h-4 w-4" /> Add to team
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <UsersRound className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Select a team to manage its members.</p>
            </div>
          )}
        </aside>
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit team" : "New team"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Platform" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Select value={form.department_id || "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Manager</Label>
                <Select value={form.manager_id || "none"} onValueChange={(v) => setForm({ ...form, manager_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Color</Label>
              <Input type="color" value={form.color || "#3b82f6"} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-20 p-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Create team"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
