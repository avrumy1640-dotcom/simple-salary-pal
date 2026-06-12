import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  listEmployeeTaxProfiles,
  upsertEmployeeTaxProfile,
  deleteEmployeeTaxProfile,
  listJurisdictions,
  listReciprocity,
} from '@/lib/tax-profile.functions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';

export const Route = createFileRoute('/employee/tax-profile')({
  component: EmployeeTaxProfilePage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Tax profile unavailable</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function EmployeeTaxProfilePage() {
  const [employee, setEmployee] = useState<{ id: string; company_id: string; full_name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { setLoading(false); return; }
      const { data: emp } = await supabase
        .from('employees')
        .select('id, company_id, full_name')
        .eq('user_id', session.session.user.id)
        .maybeSingle();
      setEmployee(emp ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;
  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle>No employee record</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Ask your HR admin to link your employee record to this account.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tax profile</h1>
        <p className="text-sm text-muted-foreground">
          Federal and state withholding setup. Add a row for each state where you live or work.
        </p>
      </header>
      <TaxProfileCard employeeId={employee.id} companyId={employee.company_id} canEdit={true} />
    </div>
  );
}

export function TaxProfileCard({
  employeeId,
  companyId,
  canEdit,
}: {
  employeeId: string;
  companyId: string;
  canEdit: boolean;
}) {
  const list = useServerFn(listEmployeeTaxProfiles);
  const upsert = useServerFn(upsertEmployeeTaxProfile);
  const remove = useServerFn(deleteEmployeeTaxProfile);
  const jurisdictionsFn = useServerFn(listJurisdictions);
  const reciprocityFn = useServerFn(listReciprocity);
  const qc = useQueryClient();

  const profiles = useQuery({
    queryKey: ['tax-profiles', employeeId],
    queryFn: () => list({ data: { employee_id: employeeId } }),
  });
  const jurisdictions = useQuery({ queryKey: ['tax-jurisdictions'], queryFn: () => jurisdictionsFn() });
  const reciprocity = useQuery({ queryKey: ['state-reciprocity'], queryFn: () => reciprocityFn() });

  const upsertMut = useMutation({
    mutationFn: (input: Parameters<typeof upsertEmployeeTaxProfile>[0]['data']) => upsert({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-profiles', employeeId] });
      toast.success('Tax profile saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-profiles', employeeId] });
      toast.success('Removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft(companyId, employeeId));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (profiles.data as any[] | undefined) ?? [];
  const hasFederal = rows.some((r) => r.jurisdiction?.kind === 'federal');
  const residentState = rows.find((r) => r.jurisdiction?.kind === 'state' && r.is_resident)?.jurisdiction?.code as string | undefined;

  // Compute reciprocity hints (rows where home_state == residentState)
  const reciprocalWorkStates = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((reciprocity.data as any[] | undefined) ?? [])
      .filter((r) => residentState && r.home_state === residentState)
      .map((r) => r.work_state as string),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Withholding jurisdictions</CardTitle>
          <CardDescription>Federal is required. Add states where you live or work.</CardDescription>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setDraft(emptyDraft(companyId, employeeId))}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{draft.id ? 'Edit jurisdiction' : 'Add jurisdiction'}</DialogTitle>
              </DialogHeader>
              <ProfileForm
                draft={draft}
                setDraft={setDraft}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                jurisdictions={(jurisdictions.data as any[] | undefined) ?? []}
                requireFederal={!hasFederal}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={async () => {
                    await upsertMut.mutateAsync(draft);
                    setOpen(false);
                  }}
                  disabled={!draft.jurisdiction_id || upsertMut.isPending}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {profiles.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jurisdictions yet. Add Federal first, then your state.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const code = r.jurisdiction?.code as string | undefined;
              const reciprocal = code && reciprocalWorkStates.has(code) && !r.is_resident;
              return (
                <div key={r.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.jurisdiction?.name ?? r.jurisdiction_id}</span>
                      <Badge variant="outline">{r.jurisdiction?.kind}</Badge>
                      {r.is_resident && <Badge>Resident</Badge>}
                      {r.is_work_location && <Badge variant="secondary">Work</Badge>}
                      {r.exempt && <Badge variant="destructive">Exempt</Badge>}
                      {reciprocal && <Badge variant="outline" title="Reciprocity available — file certificate to suppress withholding here">Reciprocity</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.filing_status} · {r.dependents_under17} u17 · {r.dependents_other} other · extra ${Number(r.extra_withholding).toFixed(2)}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDraft({
                            id: r.id,
                            company_id: r.company_id,
                            employee_id: r.employee_id,
                            jurisdiction_id: r.jurisdiction_id,
                            is_resident: r.is_resident,
                            is_work_location: r.is_work_location,
                            filing_status: r.filing_status,
                            allowances: r.allowances ?? 0,
                            dependents_under17: r.dependents_under17 ?? 0,
                            dependents_other: r.dependents_other ?? 0,
                            extra_withholding: Number(r.extra_withholding ?? 0),
                            exempt: r.exempt ?? false,
                            exempt_reason: r.exempt_reason ?? '',
                          });
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Remove this jurisdiction?')) deleteMut.mutate(r.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DraftState {
  id?: string;
  company_id: string;
  employee_id: string;
  jurisdiction_id: string;
  is_resident: boolean;
  is_work_location: boolean;
  filing_status: 'single' | 'married' | 'married_separate' | 'head_of_household';
  allowances: number;
  dependents_under17: number;
  dependents_other: number;
  extra_withholding: number;
  exempt: boolean;
  exempt_reason: string;
}

function emptyDraft(company_id: string, employee_id: string): DraftState {
  return {
    company_id,
    employee_id,
    jurisdiction_id: '',
    is_resident: false,
    is_work_location: true,
    filing_status: 'single',
    allowances: 0,
    dependents_under17: 0,
    dependents_other: 0,
    extra_withholding: 0,
    exempt: false,
    exempt_reason: '',
  };
}

function ProfileForm({
  draft,
  setDraft,
  jurisdictions,
  requireFederal,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  jurisdictions: Array<{ id: string; code: string; name: string; kind: string }>;
  requireFederal: boolean;
}) {
  const set = <K extends keyof DraftState>(k: K, v: DraftState[K]) => setDraft({ ...draft, [k]: v });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Jurisdiction</Label>
        <Select value={draft.jurisdiction_id} onValueChange={(v) => set('jurisdiction_id', v)}>
          <SelectTrigger><SelectValue placeholder="Select federal or state" /></SelectTrigger>
          <SelectContent>
            {jurisdictions.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.kind === 'federal' ? '🇺🇸 ' : ''}{j.name} ({j.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {requireFederal && <p className="text-xs text-amber-600">Add the federal jurisdiction first.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Filing status</Label>
          <Select value={draft.filing_status} onValueChange={(v) => set('filing_status', v as DraftState['filing_status'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="married">Married filing jointly</SelectItem>
              <SelectItem value="married_separate">Married filing separately</SelectItem>
              <SelectItem value="head_of_household">Head of household</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Extra withholding (per paycheck)</Label>
          <Input
            type="number"
            step="0.01"
            value={draft.extra_withholding}
            onChange={(e) => set('extra_withholding', Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>Dependents under 17</Label>
          <Input
            type="number"
            value={draft.dependents_under17}
            onChange={(e) => set('dependents_under17', Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>Other dependents</Label>
          <Input
            type="number"
            value={draft.dependents_other}
            onChange={(e) => set('dependents_other', Number(e.target.value))}
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Resident</Label>
          <p className="text-xs text-muted-foreground">Your home state.</p>
        </div>
        <Switch checked={draft.is_resident} onCheckedChange={(v) => set('is_resident', v)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Work location</Label>
          <p className="text-xs text-muted-foreground">Where you perform work.</p>
        </div>
        <Switch checked={draft.is_work_location} onCheckedChange={(v) => set('is_work_location', v)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Exempt from withholding</Label>
          <p className="text-xs text-muted-foreground">Requires a valid reason (e.g. reciprocity certificate on file).</p>
        </div>
        <Switch checked={draft.exempt} onCheckedChange={(v) => set('exempt', v)} />
      </div>
      {draft.exempt && (
        <div className="space-y-2">
          <Label>Exempt reason</Label>
          <Input value={draft.exempt_reason} onChange={(e) => set('exempt_reason', e.target.value)} />
        </div>
      )}
    </div>
  );
}
