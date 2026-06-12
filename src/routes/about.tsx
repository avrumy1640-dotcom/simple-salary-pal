import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Users, Target, ShieldCheck, TrendingUp } from "lucide-react";
import { ScrollReveal } from "@/components/motion/ScrollReveal";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Paylo" },
      { name: "description", content: "Learn about Paylo's mission to simplify payroll, HR, and compliance for growing businesses." },
      { property: "og:title", content: "About — Paylo" },
      { property: "og:description", content: "Learn about Paylo's mission to simplify payroll, HR, and compliance for growing businesses." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
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
            <Link to="/faq" className="transition-colors hover:text-foreground">FAQ</Link>
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
          <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-[10px] font-extrabold uppercase text-primary border border-primary/30">About Paylo</span>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl md:text-6xl text-white">
            Payroll should be simple. We built it that way.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/70 md:text-lg">
            Paylo was created by operators who were tired of overpaying for payroll software that still left them doing manual work at 2am. We believe every business deserves institutional-grade tools without the enterprise price tag.
          </p>
        </ScrollReveal>
      </section>

      {/* VALUES */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[
            { icon: <Users className="h-6 w-6 text-primary" />, title: "People-first", desc: "Your team is your greatest asset. We design every feature to make their experience smoother — from onboarding to pay stubs." },
            { icon: <Target className="h-6 w-6 text-primary" />, title: "Radical clarity", desc: "No hidden fees, no surprise charges. Transparent pricing and clear reports so you always know where your money goes." },
            { icon: <ShieldCheck className="h-6 w-6 text-primary" />, title: "Built-in compliance", desc: "Tax rates, filing deadlines, and labor rules change constantly. We keep you ahead of them so you never miss a beat." },
            { icon: <TrendingUp className="h-6 w-6 text-primary" />, title: "Built to scale", desc: "From your first hire to your 500th, Paylo grows with you. Same platform, same simplicity, more power." },
          ].map((v) => (
            <div key={v.title} className="rounded-[28px] border border-primary/15 bg-card p-8">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 border border-primary/25">{v.icon}</div>
              <h3 className="text-xl font-semibold tracking-tight text-white">{v.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MISSION */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <ScrollReveal className="relative overflow-hidden rounded-[40px] surface-hero p-10 text-foreground shadow-float md:p-16">
          <div aria-hidden className="absolute inset-0 grid-bg opacity-20" />
          <div className="relative z-10 text-center">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold leading-tight md:text-4xl text-white">
              Our mission
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/75">
              We exist to give small and growing businesses the same payroll and HR infrastructure that Fortune 500 companies enjoy — without the complexity, the consultant fees, or the 47-page implementation guide.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/75">
              Every feature we ship is measured against one question: "Does this make life easier for the person running payroll?" If the answer is no, we don't build it.
            </p>
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
