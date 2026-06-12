import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMyTaxForms } from "@/lib/tax-year-forms.functions";
import { downloadTaxFormPdf } from "@/lib/tax-year-pdf.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, Landmark } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employee/tax-forms")({
  head: () => ({ meta: [{ title: "My tax forms — Paylo" }] }),
  component: MyTaxFormsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-4 space-y-3">
        <h1 className="text-lg font-semibold">Could not load tax forms</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-4">Not found.</div>,
});

function MyTaxFormsPage() {
  const fetchForms = useServerFn(listMyTaxForms);
  const dlPdf = useServerFn(downloadTaxFormPdf);
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    fetchForms().then(setRows).catch((e) => {
      toast.error("Could not load forms", { description: e.message });
      setRows([]);
    });
  }, []);

  const download = async (id: string) => {
    try {
      const res = await dlPdf({ data: { form_id: id } });
      const bin = atob(res.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: res.mime }));
      const a = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error("Could not open PDF", { description: e.message });
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Landmark className="h-5 w-5" /> My tax forms
        </h1>
        <p className="text-sm text-muted-foreground">Your annual W-2 / 1099-NEC statements.</p>
      </div>

      {rows === null && <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>}

      {rows?.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No tax forms yet. They appear after your employer finalizes the year.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(rows ?? []).map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {r.kind === "w2" ? "Form W-2" : "Form 1099-NEC"} · {r.tax_year}
                </CardTitle>
                <CardDescription>
                  {r.kind === "w2"
                    ? `Wages $${Number(r.box_1_wages).toFixed(2)} · Fed tax $${Number(r.box_2_fed_tax).toFixed(2)}`
                    : `Nonemployee comp $${Number(r.nec_box_1_nonemployee_comp).toFixed(2)}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">PDF</Badge>
                <Button size="sm" variant="outline" onClick={() => download(r.id)}>
                  <FileDown className="h-4 w-4 mr-1" /> Download
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Generated {r.generated_at ? new Date(r.generated_at).toLocaleDateString() : "—"} · SSN ending xxx-xx-{r.recipient_tin_last4 ?? "xxxx"}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
