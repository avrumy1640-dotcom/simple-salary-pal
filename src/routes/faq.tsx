import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import { ScrollReveal } from "@/components/motion/ScrollReveal";
import { useState } from "react";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Paylo" },
      { name: "description", content: "Frequently asked questions about Paylo's payroll, HR, time tracking, and compliance features." },
      { property: "og:title", content: "FAQ — Paylo" },
      { property: "og:description", content: "Frequently asked questions about Paylo's payroll, HR, time tracking, and compliance features." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/faq" },
    ],
    links: [{ rel: "canonical", href: "/faq" }],
  }),
  component: FaqPage,
});

const faqs = [
  {
    q: "What is Paylo and who is it for?",
    a: "Paylo is an all-in-one payroll and HR platform built for small and growing businesses. If you have employees or contractors to pay, taxes to file, and hours to track, Paylo replaces your spreadsheet chaos with one intelligent system.",
  },
  {
    q: "How long does setup take?",
    a: "Most companies are up and running in under 10 minutes. Enter your company details, add your employees, and you're ready to run your first payroll. Our onboarding wizard guides you through every step.",
  },
  {
    q: "Does Paylo handle tax filings?",
    a: "Yes. Paylo automatically calculates federal, state, and local taxes, generates W-2s, W-3s, 1099-NECs, and files your quarterly 941s and annual 940. We keep tax tables updated so you never have to worry about rate changes.",
  },
  {
    q: "Can employees access their own information?",
    a: "Absolutely. Every employee gets a self-service portal where they can view pay stubs, update personal info, request time off, clock in and out, and access tax documents. It reduces HR busywork by 80%.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — every plan starts with a 14-day free trial. No credit card required. Your first payroll is on us, so you can experience the full platform before committing.",
  },
  {
    q: "Can I switch plans later?",
    a: "Of course. You can upgrade or downgrade at any time. We'll prorate the difference and make sure your transition is seamless.",
  },
  {
    q: "Does Paylo support contractors?",
    a: "Yes. You can pay both W-2 employees and 1099 contractors from the same dashboard. At year-end, we generate and file 1099-NEC forms automatically.",
  },
  {
    q: "How secure is my data?",
    a: "Bank-level security. We use 256-bit encryption, SOC 2 Type II compliance, and role-based access controls. Your data is never sold or shared with third parties for marketing.",
  },
  {
    q: "What integrations does Paylo support?",
    a: "We integrate with major accounting software (QuickBooks, Xero), time clocks, benefits providers, and banking institutions. Our open API lets developers build custom integrations too.",
  },
  {
    q: "What happens if I need help?",
    a: "Starter plans get email support with 24-hour response times. Growth and Pro plans get priority support, and Pro includes a dedicated account manager. We also have an extensive help center and video tutorials.",
  },
];

function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 grid-bg opacity-60" />

      {/* NAV */}
      <header className="sticky top-0 z-30 border-b bg-background/82 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-brand text-sm font-extrabold text-primary-foreground shadow-glow">P</div>
            <span className="font-display text-xl font-extrabold text-gradient">Paylo</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <Link to="/" className="transition-colors hover:text-foreground">Home</Link>
            <Link to="/pricing" className="transition-colors hover:text-foreground">Pricing</Link>
            <Link to="/about" className="transition-colors hover:text-foreground">About</Link>
            <Link to="/contact" className="transition-colors hover:text-foreground">Contact</Link>
            <Link to="/auth" className="transition-colors hover:text-foreground">Sign in</Link>
          </nav>
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            Get started <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-7xl px-5 pt-16 pb-12 text-center md:px-8 md:pt-24">
        <ScrollReveal>
          <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-[10px] font-extrabold uppercase text-primary border border-primary/30">FAQ</span>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl md:text-6xl text-white">
            Questions? We've got answers.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/70 md:text-lg">
            Everything you need to know about Paylo. Can't find what you're looking for? Reach out to our team.
          </p>
        </ScrollReveal>
      </section>

      {/* FAQ LIST */}
      <section className="mx-auto max-w-3xl px-5 pb-24 md:px-8">
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl border border-primary/15 bg-card overflow-hidden transition-all duration-300 hover:border-primary/30"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
              >
                <span className="text-base font-semibold text-white">{faq.q}</span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && (
                <div className="px-6 pb-5">
                  <p className="text-sm leading-relaxed text-white/70">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <ScrollReveal className="relative overflow-hidden rounded-[40px] surface-hero p-10 text-foreground shadow-float md:p-16">
          <div aria-hidden className="absolute inset-0 grid-bg opacity-20" />
          <div className="relative z-10 text-center">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold leading-tight md:text-4xl text-white">
              Still have questions?
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/75">
              Our team is happy to help. Reach out and we'll get back to you within 24 hours.
            </p>
            <Link to="/contact" className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-glow transition-all hover:-translate-y-0.5">
              Contact us <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 md:px-8">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-muted-foreground">
            <Link to="/about" className="hover:text-foreground">About</Link>
            <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link to="/faq" className="hover:text-foreground">FAQ</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
          </div>
          <div className="flex items-center gap-2 opacity-60">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">P</div>
            <span className="text-sm font-semibold tracking-tight">paylo</span>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            © {new Date().getFullYear()} Paylo · Payroll for small business
          </p>
        </div>
      </footer>
    </div>
  );
}
