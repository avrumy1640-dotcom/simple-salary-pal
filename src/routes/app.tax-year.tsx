import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useCompany } from "@/hooks/useCompany";
import {
  listTaxYearRuns,
  listTaxYearForms,
  generateW2Run,
  generate1099NecRun,
  setTaxYearRunStatus,
  exportEfw2,
  export1099Iris,
} from "@/lib/tax-year-forms.functions";
import { downloadTaxFormPdf } from "@/lib/tax-year-pdf.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, FileDown, RefreshCw, Lock, FileSpreadsheet, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tax-year")({
  head: () => ({ meta: [{ title: "Year-end tax forms — Paylo" }] }),
  component: TaxYearPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Could not load year-end forms</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

const YEARS = (() => {
  const now = new Date().getFullYear();
  return [now, now - 1, now - 2, now - 3];
})();

function TaxYearPage() {
  const { current } = useCompany();
  const fetchRuns = useServerFn(listTaxYearRuns);
  const fetchForms = useServerFn(listTaxYearForms);
  const genW2 = useServerFn(generateW2Run);
  const gen1099 = useServerFn(generate1099NecRun);
  const setStatus = useServerFn(setTaxYearRunStatus);
  const efw2 = useServerFn(exportEfw2);
  const iris = useServerFn(export1099Iris);
  const dlPdf = useServerFn(downloadTaxFormPdf);

  const [year, setYear] = useState<number>(YEARS[1] ?? YEARS[0]);
  const [runs, setRuns] = useState<any[]>([]);
  const [forms, setForms] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [busyKind, setBusyKind] = useState<"w2" | "1099nec" | null>(null);

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const rows = await fetchRuns({ data: { company_id: current.company_id } });
      setRuns(rows);
      const yrRows = rows.filter((r: any) => r.tax_year === year);
      const next: Record<string, any[]> = {};
      for (const r of yrRows) {
        next[r.id] = await fetchForms({ data: { run_id: r.id } });
      }
      setForms(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [current?.company_id, year]);

  const yearRuns = useMemo(() => runs.filter((r) => r.tax_year === year), [runs, year]);
  const w2Run = yearRuns.find((r) => r.kind === "w2");
  const necRun = yearRuns.find((r) => r.kind === "1099nec");

  const generate = async (kind: "w2" | "1099nec") => {
    if (!current) return;
    setBusyKind(kind);
    try {
      const fn = kind === "w2" ? genW2 : gen1099;
      const res = await fn({ data: { company_id: current.company_id, tax_year: year } });
      toast.success(`${kind === "w2" ? "W-2" : "1099-NEC"} run generated`, {
        description: `${res.recipients} recipients aggregated.`,
      });
      await reload();
    } catch (e: any) {
      toast.error("Generation failed", { description: e.message });
    } finally {
      setBusyKind(null);
    }
  };

  const downloadFile = (filename: string, content: string, mime = "text/plain") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };
  const downloadB64 = (filename: string, b64: string, mime: string) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportFile = async (run: any) => {
    try {
      const res = run.kind === "w2" ? await efw2({ data: { run_id: run.id } }) : await iris({ data: { run_id: run.id } });
      downloadFile(res.filename, res.content);
    } catch (e: any) {
      toast.error("Export failed", { description: e.message });
    }
  };

  const downloadPdfFor = async (formId: string) => {
    try {
      const res = await dlPdf({ data: { form_id: formId } });
      downloadB64(res.filename, res.base64, res.mime);
    } catch (e: any) {
      toast.error("Could not generate PDF", { description: e.message });
    }
  };

  const lockRun = async (run: any) => {
    try {
      await setStatus({ data: { run_id: run.id, status: "filed" } });
      toast.success("Marked as filed");
      await reload();
    } catch (e: any) {
      toast.error("Could not mark filed", { description: e.message });
    }
  };

  if (!current) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Landmark className="h-5 w-5" /> Year-end tax forms
          </h1>
          <p className="text-sm text-muted-foreground">
            Aggregate paid payroll and contractor payments into W-2s and 1099-NECs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="w2">
        <TabsList>
          <TabsTrigger value="w2">W-2 (Employees)</TabsTrigger>
          <TabsTrigger value="1099">1099-NEC (Contractors)</TabsTrigger>
        </TabsList>

        <TabsContent value="w2" className="space-y-4">
          <RunCard
            kind="w2"
            year={year}
            run={w2Run}
            busy={busyKind === "w2"}
            forms={w2Run ? forms[w2Run.id] ?? [] : []}
            onGenerate={() => generate("w2")}
            onExport={() => w2Run && exportFile(w2Run)}
            onLock={() => w2Run && lockRun(w2Run)}
            onDownloadPdf={downloadPdfFor}
          />
        </TabsContent>

        <TabsContent value="1099" className="space-y-4">
          <RunCard
            kind="1099nec"
            year={year}
            run={necRun}
            busy={busyKind === "1099nec"}
            forms={necRun ? forms[necRun.id] ?? [] : []}
            onGenerate={() => generate("1099nec")}
            onExport={() => necRun && exportFile(necRun)}
            onLock={() => necRun && lockRun(necRun)}
            onDownloadPdf={downloadPdfFor}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function statusVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "filed") return "default";
  if (s === "corrected") return "secondary";
  return "outline";
}

function RunCard(props: {
  kind: "w2" | "1099nec";
  year: number;
  run: any | undefined;
  forms: any[];
  busy: boolean;
  onGenerate: () => void;
  onExport: () => void;
  onLock: () => void;
  onDownloadPdf: (id: string) => void;
}) {
  const { kind, year, run, forms, busy, onGenerate, onExport, onLock, onDownloadPdf } = props;
  const label = kind === "w2" ? "W-2" : "1099-NEC";
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            {label} — {year}
            {run && <Badge variant={statusVariant(run.status)}>{run.status}</Badge>}
          </CardTitle>
          <CardDescription>
            {run
              ? `Generated ${run.generated_at ? new Date(run.generated_at).toLocaleString() : "—"} · ${forms.length} recipient(s)`
              : "No run yet. Generate after the year's payroll is finalized."}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onGenerate} disabled={busy || run?.status === "filed"}>
            {busy ? "Generating…" : run ? "Regenerate" : "Generate"}
          </Button>
          {run && (
            <Button variant="outline" onClick={onExport}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              {kind === "w2" ? "EFW2" : "IRIS JSON"}
            </Button>
          )}
          {run && run.status !== "filed" && (
            <Button variant="secondary" onClick={onLock}>
              <Lock className="h-4 w-4 mr-1" /> Mark filed
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!run && (
          <div className="rounded border border-dashed p-6 text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Run the generator to preview each recipient's totals.
          </div>
        )}
        {run && forms.length === 0 && (
          <div className="text-sm text-muted-foreground">No recipients qualified this year.</div>
        )}
        {forms.length > 0 && (
          <div className="overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  {kind === "w2" ? (
                    <>
                      <TableHead className="text-right">Box 1 wages</TableHead>
                      <TableHead className="text-right">Box 2 fed tax</TableHead>
                      <TableHead className="text-right">Box 3 SS wages</TableHead>
                      <TableHead className="text-right">Box 5 Medicare</TableHead>
                    </>
                  ) : (
                    <TableHead className="text-right">Box 1 NEC</TableHead>
                  )}
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.recipient_name}</TableCell>
                    {kind === "w2" ? (
                      <>
                        <TableCell className="text-right">${Number(f.box_1_wages).toFixed(2)}</TableCell>
                        <TableCell className="text-right">${Number(f.box_2_fed_tax).toFixed(2)}</TableCell>
                        <TableCell className="text-right">${Number(f.box_3_ss_wages).toFixed(2)}</TableCell>
                        <TableCell className="text-right">${Number(f.box_5_medicare_wages).toFixed(2)}</TableCell>
                      </>
                    ) : (
                      <TableCell className="text-right">${Number(f.nec_box_1_nonemployee_comp).toFixed(2)}</TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => onDownloadPdf(f.id)}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
