import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Clock, Users, FileText } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paylo — Simple payroll for small business" },
      { name: "description", content: "Run payroll in minutes. Manage employees, track time, calculate taxes, and generate payslips — built for SMBs." },
    ],
  }),
  component: Landing,
});

function Feature({ icon: Icon, title, desc }: { icon: typeof Users; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">P</div>
            <span className="text-lg font-semibold tracking-tight">Paylo</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Built for US small businesses
        </div>
        <h1 className="mt-6 text-5xl font-semibold tracking-tight md:text-6xl">
          Payroll, made <span className="text-primary">painless</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Add your team, log hours, and run payroll in a few clicks. No spreadsheets, no headaches.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/auth">
            <Button size="lg" className="gap-2">Start free <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> Federal & FICA taxes</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> Unlimited employees</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> CSV exports</span>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature icon={Users} title="Employee directory" desc="Hourly or salary, all in one tidy list." />
          <Feature icon={Clock} title="Time tracking" desc="Log hours per pay period in seconds." />
          <Feature icon={FileText} title="Run payroll" desc="Auto-calculated gross, taxes, and net pay." />
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Paylo. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
