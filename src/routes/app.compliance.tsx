import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { ShieldCheck, AlertTriangle, FileBadge, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/compliance")({
  head: () => ({ meta: [{ title: "Compliance — Paylo" }] }),
  component: CompliancePage,
});

function CompliancePage() {
  const [stats, setStats] = useState({ employees: 0, missingI9: 0, missingW4: 0 });

  useEffect(() => {
    (async () => {
      const [{ count: total }, { count: noSsn }] = await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "active").is("ssn_last4", null),
      ]);
      setStats({ employees: total ?? 0, missingI9: noSsn ?? 0, missingW4: noSsn ?? 0 });
    })();
  }, []);

  const items = [
    { id: "i9", label: "Form I-9 verification", status: stats.missingI9 > 0 ? "warning" : "ok", count: stats.missingI9, total: stats.employees, desc: "Employment eligibility verification" },
    { id: "w4", label: "Form W-4 collection", status: stats.missingW4 > 0 ? "warning" : "ok", count: stats.missingW4, total: stats.employees, desc: "Federal withholding certificates" },
    { id: "handbook", label: "Handbook acknowledgments", status: "ok", count: 0, total: stats.employees, desc: "Employee policy sign-off" },
    { id: "filings", label: "Quarterly tax filings", status: "ok", count: 0, total: 0, desc: "Form 941 / state filings" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance center"
        description="I-9, W-4, certifications, and document expiration tracking."
        actions={<Button variant="outline" size="sm">Export audit pack</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Compliance score", value: stats.missingI9 + stats.missingW4 === 0 ? "100%" : "—", icon: ShieldCheck, tone: "success" },
          { label: "Open alerts", value: stats.missingI9 + stats.missingW4, icon: AlertTriangle, tone: (stats.missingI9 + stats.missingW4) > 0 ? "warning" : "default" },
          { label: "Expiring docs", value: 0, icon: FileBadge, tone: "default" },
          { label: "Verified employees", value: stats.employees - stats.missingI9, icon: CheckCircle2, tone: "success" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.tone === "success" ? "text-success" : s.tone === "warning" ? "text-warning" : "text-slate-400"}`} />
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-display text-base font-bold text-slate-900">Compliance checklist</h2>
        </div>
        <div className="divide-y divide-border">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-lg ${it.status === "ok" ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}`}>
                  {it.status === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{it.label}</div>
                  <div className="text-xs text-slate-500">{it.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {it.status === "warning" ? (
                  <Badge variant="secondary" className="bg-warning/15 text-warning hover:bg-warning/15">{it.count} pending</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-success/10 text-success hover:bg-success/10">Up to date</Badge>
                )}
                <Button variant="ghost" size="sm">Review</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
