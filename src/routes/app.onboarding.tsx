import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Clock, ClipboardList, Sparkles, FileText, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/app/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding checklist — Paylo" }] }),
  component: OnboardingPage,
});

type PersonKind = "employee" | "contractor";
interface Person { id: string; full_name: string; kind: PersonKind; start_date?: string | null }

interface Task {
  id: string;
  employee_id: string | null;
  contractor_id: string | null;
  title: string;
  description: string | null;
  category: string;
  required: boolean;
  status: "pending" | "in_progress" | "completed" | "skipped";
  sort_order: number;
  completed_at: string | null;
}

interface Form { id: string; employee_id: string | null; contractor_id: string | null; form_type: string; status: string }

// Default required onboarding tasks per person type
const EMP_TEMPLATE = [
  { title: "Complete I-9 (work authorization)", category: "i9", description: "Verify employment eligibility within 3 days of start date.", sort_order: 10, required: true },
  { title: "Complete W-4 (federal withholding)", category: "w4", description: "Collect federal tax withholding elections.", sort_order: 20, required: true },
  { title: "Sign offer letter", category: "offer_letter", description: "Countersigned offer letter on file.", sort_order: 30, required: true },
  { title: "Direct deposit setup", category: "banking", description: "Bank routing and account on file.", sort_order: 40, required: true },
  { title: "Acknowledge employee handbook", category: "handbook", description: "Signed handbook acknowledgment.", sort_order: 50, required: false },
];
const CON_TEMPLATE = [
  { title: "Complete W-9 (taxpayer info)", category: "w9", description: "Collect TIN / SSN for 1099 reporting.", sort_order: 10, required: true },
  { title: "Sign contractor agreement", category: "contract", description: "Countersigned MSA / SOW on file.", sort_order: 20, required: true },
  { title: "Payment details on file", category: "banking", description: "ACH or address for paper check.", sort_order: 30, required: true },
];

const FORM_BY_CATEGORY: Record<string, string> = { i9: "i9", w4: "w4", w9: "w9" };

function OnboardingPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadPeople() {
    const [{ data: emps }, { data: cons }] = await Promise.all([
      supabase.from("employees").select("id, full_name, start_date").order("full_name"),
      supabase.from("contractors").select("id, full_name").order("full_name"),
    ]);
    const list: Person[] = [
      ...((emps ?? []) as any[]).map((e) => ({ id: e.id, full_name: e.full_name, start_date: e.start_date, kind: "employee" as const })),
      ...((cons ?? []) as any[]).map((c) => ({ id: c.id, full_name: c.full_name, kind: "contractor" as const })),
    ];
    setPeople(list);
    if (!selected && list.length > 0) setSelected(list[0].id);
  }

  async function loadTasks() {
    const [{ data: t }, { data: f }] = await Promise.all([
      supabase.from("onboarding_tasks").select("*").order("sort_order"),
      supabase.from("hr_forms").select("id, employee_id, contractor_id, form_type, status"),
    ]);
    setTasks((t ?? []) as Task[]);
    setForms((f ?? []) as Form[]);
  }

  useEffect(() => { loadPeople(); loadTasks(); }, []);

  const person = useMemo(() => people.find((p) => p.id === selected) || null, [people, selected]);
  const personTasks = useMemo(() => {
    if (!person) return [];
    return tasks.filter((t) => (person.kind === "employee" ? t.employee_id === person.id : t.contractor_id === person.id))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [tasks, person]);

  // Sync hr_forms.signed → task.completed for I-9 / W-4 / W-9
  useEffect(() => {
    if (!person) return;
    const updates: Promise<any>[] = [];
    for (const t of personTasks) {
      const ft = FORM_BY_CATEGORY[t.category];
      if (!ft) continue;
      const match = forms.find((f) =>
        f.form_type === ft &&
        (person.kind === "employee" ? f.employee_id === person.id : f.contractor_id === person.id)
      );
      if (match?.status === "signed" && t.status !== "completed") {
        updates.push(
          supabase.from("onboarding_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", t.id)
        );
      }
    }
    if (updates.length > 0) Promise.all(updates).then(() => loadTasks());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forms, personTasks.length, person?.id]);

  async function seedDefaults() {
    if (!person) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const template = person.kind === "employee" ? EMP_TEMPLATE : CON_TEMPLATE;
      const rows = template
        .filter((tpl) => !personTasks.some((t) => t.category === tpl.category))
        .map((tpl) => ({
          owner_id: user.id,
          employee_id: person.kind === "employee" ? person.id : null,
          contractor_id: person.kind === "contractor" ? person.id : null,
          title: tpl.title,
          description: tpl.description,
          category: tpl.category,
          required: tpl.required,
          sort_order: tpl.sort_order,
          status: "pending",
        }));
      if (rows.length === 0) { toast.info("Default checklist already in place"); return; }
      const { error } = await supabase.from("onboarding_tasks").insert(rows);
      if (error) throw error;
      toast.success(`Added ${rows.length} task${rows.length === 1 ? "" : "s"}`);
      loadTasks();
    } catch (e: any) {
      toast.error(e.message || "Failed to seed checklist");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(t: Task, status: Task["status"]) {
    const patch: any = { status };
    patch.completed_at = status === "completed" ? new Date().toISOString() : null;
    const { error } = await supabase.from("onboarding_tasks").update(patch).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    loadTasks();
  }

  const completed = personTasks.filter((t) => t.status === "completed").length;
  const required = personTasks.filter((t) => t.required).length;
  const requiredDone = personTasks.filter((t) => t.required && t.status === "completed").length;
  const pct = personTasks.length === 0 ? 0 : Math.round((completed / personTasks.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Onboarding checklist</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Track I-9, W-4, W-9, and other onboarding steps for every new hire and contractor. Completion syncs automatically when signed forms are filed.
          </p>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Add employees or contractors first to start onboarding.</p>
          <div className="flex justify-center gap-2">
            <Button asChild variant="outline" className="rounded-full"><Link to="/app/employees">Add employee</Link></Button>
            <Button asChild variant="outline" className="rounded-full"><Link to="/app/contractors">Add contractor</Link></Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-[320px]"><SelectValue placeholder="Choose a person" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name} · {p.kind === "employee" ? "W-2" : "1099"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {person && personTasks.length === 0 && (
              <Button onClick={seedDefaults} disabled={busy} className="gap-2 rounded-full bg-foreground text-white">
                <Sparkles className="h-4 w-4" /> Use default checklist
              </Button>
            )}
          </div>

          {person && (
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="border-b px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-medium">{person.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {person.kind === "employee" ? "W-2 employee" : "1099 contractor"}
                    {person.start_date ? ` · starts ${new Date(person.start_date).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-2xl font-semibold tracking-tight">{pct}%</div>
                    <div className="text-xs text-muted-foreground">{completed}/{personTasks.length} done · {requiredDone}/{required} required</div>
                  </div>
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>

              {personTasks.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No tasks yet. Use the default checklist or add your own.</p>
                  <Button onClick={seedDefaults} disabled={busy} className="gap-2 rounded-full">
                    <Sparkles className="h-4 w-4" /> Generate default checklist
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {personTasks.map((t) => {
                    const done = t.status === "completed";
                    const ft = FORM_BY_CATEGORY[t.category];
                    return (
                      <li key={t.id} className="flex items-start gap-4 px-5 py-4">
                        <button
                          onClick={() => setStatus(t, done ? "pending" : "completed")}
                          className="mt-0.5 flex-shrink-0"
                          title={done ? "Mark incomplete" : "Mark complete"}
                        >
                          {done ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : t.status === "in_progress" ? (
                            <Clock className="h-5 w-5 text-amber-500" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                            {t.required && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Required</span>}
                            {ft && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><FileText className="h-3 w-3" /> Form {ft.toUpperCase()}</span>}
                          </div>
                          {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                          {done && t.completed_at && (
                            <div className="text-[11px] text-muted-foreground mt-1">Completed {new Date(t.completed_at).toLocaleString()}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {!done && (
                            <Select value={t.status} onValueChange={(v) => setStatus(t, v as Task["status"])}>
                              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_progress">In progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="skipped">Skipped</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {ft && (
                            <Button asChild variant="ghost" size="sm" className="gap-1">
                              <Link to="/app/documents">Upload <ArrowRight className="h-3 w-3" /></Link>
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
