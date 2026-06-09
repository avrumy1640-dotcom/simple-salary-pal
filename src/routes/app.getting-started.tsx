import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Circle, ArrowRight, BookOpen, Calculator, Building2, Users, Wallet, Receipt } from "lucide-react";

export const Route = createFileRoute("/app/getting-started")({
  head: () => ({ meta: [{ title: "Getting started — Paylo" }] }),
  component: GettingStartedPage,
});

interface Status {
  hasCompany: boolean;
  hasEmployees: boolean;
  hasTime: boolean;
  hasPayroll: boolean;
}

function GettingStartedPage() {
  const [s, setS] = useState<Status>({ hasCompany: false, hasEmployees: false, hasTime: false, hasPayroll: false });

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { count: ec }, { count: tc }, { count: pc }] = await Promise.all([
        supabase.from("company_settings").select("onboarding_complete").maybeSingle(),
        supabase.from("employees").select("*", { count: "exact", head: true }),
        supabase.from("time_entries").select("*", { count: "exact", head: true }),
        supabase.from("payroll_runs").select("*", { count: "exact", head: true }),
      ]);
      setS({
        hasCompany: !!cs?.onboarding_complete,
        hasEmployees: (ec ?? 0) > 0,
        hasTime: (tc ?? 0) > 0,
        hasPayroll: (pc ?? 0) > 0,
      });
    })();
  }, []);

  const steps = [
    { done: s.hasCompany, title: "Set up your company", desc: "Add your business name, EIN, and pay schedule.", to: "/app/settings", icon: Building2 },
    { done: s.hasEmployees, title: "Add your employees", desc: "Enter pay info, tax withholding, and direct deposit.", to: "/app/employees", icon: Users },
    { done: s.hasTime, title: "Log time (for hourly staff)", desc: "Track hours and overtime each pay period.", to: "/app/time", icon: Receipt },
    { done: s.hasPayroll, title: "Run your first payroll", desc: "Review the numbers, approve, and you're done.", to: "/app/payroll", icon: Wallet },
  ];

  const completed = steps.filter((x) => x.done).length;
  const progress = (completed / steps.length) * 100;

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border bg-gradient-to-br from-[oklch(0.96_0.04_258)] to-card p-6 md:p-8">
        <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-foreground">WELCOME</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Let's get your payroll running.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          New to payroll? No problem. Follow these four steps and you'll be paying your team in minutes.
          We'll explain every field along the way — no jargon.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-sm font-medium text-muted-foreground">{completed} of {steps.length}</span>
        </div>
      </div>

      <div className="grid gap-4">
        {steps.map((step, i) => (
          <Link
            key={step.title}
            to={step.to}
            className="group flex items-center gap-5 rounded-2xl border bg-card p-5 transition-all hover:border-foreground hover:shadow-md"
          >
            <div className="flex-shrink-0">
              {step.done ? (
                <CheckCircle2 className="h-7 w-7 text-[oklch(0.65_0.16_155)]" />
              ) : (
                <Circle className="h-7 w-7 text-muted-foreground/40" />
              )}
            </div>
            <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl bg-accent text-foreground">
              <step.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {i + 1}</div>
              <h3 className="mt-0.5 text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-foreground" />
          <h2 className="text-lg font-semibold">Payroll, explained simply</h2>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Glossary term="Gross pay" def="What an employee earns before any taxes or deductions come out." />
          <Glossary term="Net pay" def="Take-home pay — what actually lands in their bank account." />
          <Glossary term="FICA" def="Social Security (6.2%) + Medicare (1.45%) — required federal payroll taxes." />
          <Glossary term="W-4" def="The form employees fill out so you know how much federal tax to withhold." />
          <Glossary term="Pay period" def="The window of work the paycheck covers — usually 1 or 2 weeks." />
          <Glossary term="Pay date" def="The day your team actually gets paid (often a few days after the period ends)." />
          <Glossary term="Pre-tax deduction" def="Money taken out before taxes (like 401k or health insurance) — lowers taxable income." />
          <Glossary term="Direct deposit" def="Sends paychecks straight to your employee's bank account." />
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border bg-card p-5">
        <Calculator className="h-6 w-6 text-foreground" />
        <div className="flex-1">
          <h3 className="font-semibold">Need help with a calculation?</h3>
          <p className="text-sm text-muted-foreground">Every payroll preview shows you exactly how each number is calculated — taxes, deductions, net pay — line by line.</p>
        </div>
        <Link to="/app/payroll" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">Open payroll</Link>
      </div>
    </div>
  );
}

function Glossary({ term, def }: { term: string; def: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="font-semibold text-foreground">{term}</div>
      <div className="mt-1 text-sm text-muted-foreground">{def}</div>
    </div>
  );
}
