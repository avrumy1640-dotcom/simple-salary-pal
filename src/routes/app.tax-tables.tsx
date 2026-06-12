import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { listTaxTablesStatus } from '@/lib/payroll-tax.functions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/app/tax-tables')({
  component: TaxTablesPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Could not load tax tables</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

interface Row {
  code: string;
  name: string;
  kind: string;
  tax_type: string | null;
  effective_start: string | null;
  effective_end: string | null;
  is_active: boolean | null;
}

function TaxTablesPage() {
  const fetchStatus = useServerFn(listTaxTablesStatus);
  const { data, isLoading } = useQuery({
    queryKey: ['tax-tables-status'],
    queryFn: () => fetchStatus(),
  });

  const rows = (data ?? []) as Row[];
  const federal = rows.filter((r) => r.kind === 'federal' && r.tax_type);
  const states = rows.filter((r) => r.kind === 'state');
  const statesWithIncome = new Set(states.filter((r) => r.tax_type === 'income' && r.is_active).map((r) => r.code));
  const statesMissing = Array.from(new Set(states.map((r) => r.code))).filter((c) => !statesWithIncome.has(c));

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tax tables</h1>
        <p className="text-sm text-muted-foreground">
          Versioned bracketed tax data driving payroll withholding. Federal + 50 states + DC + PR jurisdictions seeded.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Federal tables active</CardDescription>
            <CardTitle className="text-3xl">{federal.filter((r) => r.is_active).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>States with income tax data</CardDescription>
            <CardTitle className="text-3xl">{statesWithIncome.size}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>States awaiting data</CardDescription>
            <CardTitle className="text-3xl">{statesMissing.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Federal versions</CardTitle>
          <CardDescription>IRS Publication 15-T plus FICA / Medicare / FUTA flat rates.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax type</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {federal.map((r, i) => (
                  <TableRow key={`${r.code}-${r.tax_type}-${i}`}>
                    <TableCell className="font-medium">{r.tax_type}</TableCell>
                    <TableCell>
                      {r.effective_start} → {r.effective_end ?? '∞'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? 'default' : 'secondary'}>
                        {r.is_active ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>State coverage</CardTitle>
          <CardDescription>
            States needing income-tax tables before Phase B (multi-state withholding) can withhold accurately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statesMissing.length === 0 ? (
            <p className="text-sm text-muted-foreground">All seeded states have active income-tax tables.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {statesMissing.map((c) => (
                <Badge key={c} variant="outline">{c}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
