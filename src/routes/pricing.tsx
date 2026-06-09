import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Paylo" },
      { name: "description", content: "Simple, transparent payroll & HR pricing. Plans for teams of every size. 14-day free trial, no credit card required." },
      { property: "og:title", content: "Pricing — Paylo" },
      { property: "og:description", content: "Simple, transparent payroll pricing. Start free for 14 days." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/pricing" },
    ],
    links: [{ rel: "canonical", href: "/pricing" }],
  }),
  component: PricingPage,
});

type Tier = {
  name: string;
  price: string;
  perEmp: string;
  blurb: string;
  features: string[];
  cta: string;
  highlight?: boolean;
};

const tiers: Tier[] = [
  {
    name: "Starter",
    price: "$40",
    perEmp: "+ $6 per employee",
    blurb: "Everything you need to run your first payroll.",
    features: [
      "Up to 25 employees",
      "Core payroll & direct deposit",
      "Automatic tax calculations",
      "Employee self-service portal",
      "Basic reports",
      "Email support",
    ],
    cta: "Start free trial",
  },
  {
    name: "Growth",
    price: "$80",
    perEmp: "+ $10 per employee",
    blurb: "For growing teams who want time tracking + HR.",
    features: [
      "Up to 100 employees",
      "Everything in Starter",
      "Time & attendance tracking",
      "PTO management",
      "HR profiles & document storage",
      "Priority support",
    ],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$150",
    perEmp: "+ $14 per employee",
    blurb: "Built for multi-state teams and benefits.",
    features: [
      "Unlimited employees",
      "Everything in Growth",
      "Benefits administration",
      "Advanced analytics & reports",
      "Multi-state payroll",
      "Dedicated account manager",
      "Phone support",
    ],
    cta: "Talk to sales",
  },
];

function PricingPage() {
  return (
    <div className="page-in relative min-h-screen overflow-hidden text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 grid-bg opacity-40" />
      <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-primary/80 blur-3xl orb-1" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-60 h-96 w-96 rounded-full bg-muted/90 blur-3xl orb-2" />

      <header className="sticky top-0 z-30 border-b border-primary/20 bg-card/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-brand text-sm font-extrabold text-primary-foreground shadow-glow">P</div>
            <span className="font-display text-xl font-extrabold tracking-tight text-foreground">Paylo</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-white md:flex">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <Link to="/pricing" className="text-foreground">Pricing</Link>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          </nav>
          <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow">
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-24 pt-16 md:px-8 md:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-muted px-3 py-1 text-xs font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Simple, transparent pricing
          </div>
          <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight text-foreground md:text-6xl">
            One price. Everything included.
          </h1>
          <p className="mt-4 text-base text-white md:text-lg">
            Run payroll, file taxes, pay your team. Pick the plan that fits — switch any time.
          </p>
          <p className="mt-2 text-sm font-medium text-white">14-day free trial · No credit card required</p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl items-stretch gap-6 lg:grid-cols-3">
          {tiers.map((t, i) => (
            <div
              key={t.name}
              style={{ animationDelay: `${i * 90}ms` }}
              className={[
                "relative fade-up rounded-[2rem] p-7 transition-all duration-300 hover:-translate-y-2",
                t.highlight
                  ? "lg:scale-[1.04] lg:my-[-12px] bg-card border-2 border-primary/20 shadow-float hover:shadow-glow"
                  : "surface-panel hover:shadow-glow",
              ].join(" ")}
            >
              {t.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-blue-700 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-primary-foreground shadow-glow">
                  Most Popular
                </div>
              )}
              <div className="text-sm font-bold uppercase tracking-[0.16em] text-white">{t.name}</div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-display text-5xl font-extrabold tracking-tight text-foreground">{t.price}</span>
                <span className="text-sm font-semibold text-white">/month</span>
              </div>
              <div className="mt-1 text-sm font-medium text-white">{t.perEmp}</div>
              <p className="mt-4 text-sm text-white">{t.blurb}</p>

              <Link
                to="/auth"
                className={[
                  "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold transition-all hover:-translate-y-0.5",
                  t.highlight
                    ? "bg-primary text-primary-foreground hover:shadow-glow"
                    : "border border-white/20/15 bg-card text-foreground hover:bg-muted hover:shadow-soft",
                ].join(" ")}
              >
                {t.cta} <ArrowRight className="h-4 w-4" />
              </Link>

              <ul className="mt-7 space-y-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary">
                      <Check className="h-3 w-3 text-foreground" strokeWidth={3} />
                    </span>
                    <span className="font-medium leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-3xl rounded-3xl surface-glass p-6 text-center md:p-8">
          <div className="font-display text-2xl font-bold text-foreground">Need something custom?</div>
          <p className="mt-2 text-sm text-white">
            Enterprise teams, accounting firms, and PEOs — we'll build a plan around how you actually work.
          </p>
          <Link to="/auth" className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:-translate-y-0.5 hover:shadow-glow transition-all">
            Talk to us <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
