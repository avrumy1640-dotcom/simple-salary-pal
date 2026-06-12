import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useCompany } from "@/hooks/useCompany";
import {
  listTaxPayments,
  recordTaxPayment,
  reconcileEmployerTax,
  listYtdSnapshots,
} from "@/lib/employer-tax-recon.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, Plus, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tax-reconciliation")({
  head: () => ({ meta: [{ title: "Tax reconciliation — Paylo" }] }),
  component: TaxReconPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Could not load reconciliation</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

const YEARS = (() => {
  const now = new Date().getFullYear();
  return [now, now - 1, now - 2];
})();

const KINDS = [
  { v: "federal_941", label: "Federal 941 (SS+Medicare+FIT)" },
  { v: "futa", label: "FUTA" },
  { v: "sui", label: "State Unemployment (SUI)" },
  { v: "sdi", label: "State Disability (SDI)" },
  { v: "fli", label: "Family Leave (FLI)" },
  { v: "local", label: "Local Income" },
];

function TaxReconPage() {
  const { current } = useCompany();
  const fetchPayments = useServerFn(listTaxPayments);
  const record = useServerFn(recordTaxPayment);
  const recon = useServerFn(reconcileEmployerTax);
  const fetchYtd = useServerFn(listYtdSnapshots);

  const [year, setYear] = useState<number>(YEARS[0]);
  const [payments, setPayments] = useState<any[]>([]);
  const [variances, setVariances] = useState<any[]>([]);
  const [ytd, setYtd] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const [p, v, y] = await Promise.all([
        fetchPayments({ data: { company_id: current.company_id, year } }),
        recon({ data: { company_id: current.company_id, year } }),
        fetchYtd({ data: { company_id: current.company_id, tax_year: year } }),
      ]);
      setPayments(p);
      setVariances(v);
      setYtd(y);
    } catch (e: any) {
      toast.error("Load failed", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [current?.company_id, year]);

  if (!current) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Landmark className="h-5 w-5" /> Tax reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare accrued employer tax liabilities against confirmed remittances. Review per-employee YTD.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="recon">
        <TabsList>
          <TabsTrigger value="recon">Reconciliation</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="ytd">YTD by employee</TabsTrigger>
        </TabsList>

        <TabsContent value="recon">
          <Card>
            <CardHeader>
              <CardTitle>Accrued vs paid — {year}</CardTitle>
              <CardDescription>
                Variance &gt; 0 means more was withheld/accrued than has been remitted. Negative = overpaid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax</TableHead>
                    <TableHead className="text-right">Accrued</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variances.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No payroll activity yet for {year}.</TableCell></TableRow>
                  )}
                  {variances.map((r) => {
                    const v = Number(r.variance);
                    const clean = Math.abs(v) < 0.01;
                    return (
                      <TableRow key={r.tax_kind}>
                        <TableCell className="font-medium">{r.tax_kind}</TableCell>
                        <TableCell className="text-right">${Number(r.accrued).toFixed(2)}</TableCell>
                        <TableCell className="text-right">${Number(r.paid).toFixed(2)}</TableCell>
                        <TableCell className="text-right">${v.toFixed(2)}</TableCell>
                        <TableCell>
                          {clean ? (
                            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Clean</Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {v > 0 ? "Owed" : "Overpaid"}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Remittances — {year}</CardTitle>
                <CardDescription>Record each tax payment made to IRS / state agencies.</CardDescription>
              </div>
              <RecordPaymentDialog
                open={open}
                onOpenChange={setOpen}
                onSubmit={async (vals) => {
                  if (!current) return;
                  try {
                    await record({ data: { company_id: current.company_id, ...vals } as any });
                    toast.success("Payment recorded");
                    setOpen(false);
                    await reload();
                  } catch (e: any) {
                    toast.error("Could not record", { description: e.message });
                  }
                }}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paid on</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confirmation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">No payments recorded.</TableCell></TableRow>
                  )}
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.paid_on}</TableCell>
                      <TableCell>{p.agency}</TableCell>
                      <TableCell>{p.tax_kind}</TableCell>
                      <TableCell className="text-xs">{p.period_start} → {p.period_end}</TableCell>
                      <TableCell className="text-right">${Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      <TableCell className="text-xs">{p.confirmation_ref ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ytd">
          <Card>
            <CardHeader>
              <CardTitle>Per-employee YTD — {year}</CardTitle>
              <CardDescription>Snapshots maintained automatically as runs are marked paid.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Last pay</TableHead>
                    <TableHead className="text-right">YTD gross</TableHead>
                    <TableHead className="text-right">Fed tax</TableHead>
                    <TableHead className="text-right">SS tax</TableHead>
                    <TableHead className="text-right">Medicare</TableHead>
                    <TableHead className="text-right">State tax</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ytd.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground">No paid runs yet for {year}.</TableCell></TableRow>
                  )}
                  {ytd.map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell className="font-medium">{r.employees?.full_name ?? r.employee_id.slice(0, 8)}</TableCell>
                      <TableCell>{r.pay_date}</TableCell>
                      <TableCell className="text-right">${Number(r.ytd_gross).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(r.ytd_fed_tax).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(r.ytd_ss_tax).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(r.ytd_medicare_tax).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(r.ytd_state_tax).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(r.ytd_net).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RecordPaymentDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (vals: {
    agency: string;
    tax_kind: string;
    period_start: string;
    period_end: string;
    amount: number;
    paid_on: string;
    confirmation_ref?: string;
    status?: "pending" | "submitted" | "confirmed" | "reconciled" | "rejected";
    notes?: string;
  }) => Promise<void>;
}) {
  const { open, onOpenChange, onSubmit } = props;
  const [vals, setVals] = useState({
    agency: "IRS",
    tax_kind: "federal_941",
    period_start: "",
    period_end: "",
    amount: "",
    paid_on: new Date().toISOString().slice(0, 10),
    confirmation_ref: "",
    status: "confirmed" as const,
    notes: "",
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> Record payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record tax payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Agency</Label>
            <Input value={vals.agency} onChange={(e) => setVals({ ...vals, agency: e.target.value })} placeholder="IRS / CA-EDD / NY-DOL" />
          </div>
          <div>
            <Label>Tax</Label>
            <Select value={vals.tax_kind} onValueChange={(v) => setVals({ ...vals, tax_kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k.v} value={k.v}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Period start</Label>
            <Input type="date" value={vals.period_start} onChange={(e) => setVals({ ...vals, period_start: e.target.value })} />
          </div>
          <div>
            <Label>Period end</Label>
            <Input type="date" value={vals.period_end} onChange={(e) => setVals({ ...vals, period_end: e.target.value })} />
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" step="0.01" value={vals.amount} onChange={(e) => setVals({ ...vals, amount: e.target.value })} />
          </div>
          <div>
            <Label>Paid on</Label>
            <Input type="date" value={vals.paid_on} onChange={(e) => setVals({ ...vals, paid_on: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Confirmation ref</Label>
            <Input value={vals.confirmation_ref} onChange={(e) => setVals({ ...vals, confirmation_ref: e.target.value })} placeholder="EFTPS / portal reference" />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              onSubmit({
                ...vals,
                amount: Number(vals.amount || 0),
                confirmation_ref: vals.confirmation_ref || undefined,
                notes: vals.notes || undefined,
              })
            }
            disabled={!vals.amount || !vals.period_start || !vals.period_end}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
