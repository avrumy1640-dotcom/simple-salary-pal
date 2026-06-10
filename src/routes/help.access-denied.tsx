import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, CheckCircle2, Mail, ShieldAlert, UserRoundCheck } from "lucide-react";

export const Route = createFileRoute("/help/access-denied")({
  head: () => ({
    meta: [
      { title: "Access denied help — Paylo" },
      { name: "description", content: "What to check when Paylo says access denied, including role confirmation and contacting your employer." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/help/access-denied" }],
  }),
  component: AccessDeniedHelpPage,
});

const checks = [
  {
    icon: UserRoundCheck,
    title: "Confirm the account type",
    body: "Employees should enter through the employee portal. Employers, payroll admins, HR admins, managers, and owners should enter the admin workspace.",
  },
  {
    icon: ShieldAlert,
    title: "Confirm your role",
    body: "Access denied usually means your employer has not assigned the role needed for that page, or your invitation has not been connected to your employee record yet.",
  },
  {
    icon: Mail,
    title: "Use the invited email",
    body: "Sign in with the exact email address your employer added. A personal email and work email are treated as different accounts.",
  },
  {
    icon: Building2,
    title: "Ask your employer to verify access",
    body: "Ask an owner, admin, or HR admin to check that your user is active, linked to the right company, and assigned the correct role.",
  },
];

function AccessDeniedHelpPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/auth" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>

        <section className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Access denied
            </div>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
              What to do when a page says access denied
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Access denied does not usually mean your account is broken. It means the app cannot confirm that your current account has permission for the page you opened.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/employee/home" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90">
                Open employee portal
              </Link>
              <Link to="/app/dashboard" className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-3 text-sm font-bold text-foreground transition hover:bg-muted">
                Open admin workspace
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-xl font-bold text-foreground">Fast checklist</h2>
            <div className="mt-5 space-y-4">
              {checks.map((item) => (
                <div key={item.title} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/20 text-foreground">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <h2 className="mt-4 text-lg font-bold text-foreground">If you are an employee</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Go to the employee portal. If your pay stubs, PTO, or profile are missing, ask your employer to link your login email to your employee record.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <h2 className="mt-4 text-lg font-bold text-foreground">If you are an employer</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Make sure you signed up as Employer/Admin or that another owner assigned your account an owner, admin, payroll, HR, manager, or supervisor role.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <h2 className="mt-4 text-lg font-bold text-foreground">What to send your employer</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Send the email you use to sign in, the page you tried to open, and whether you need employee, manager, HR, payroll, admin, or owner access.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}