import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mail, MessageSquare, Phone, MapPin } from "lucide-react";
import { ScrollReveal } from "@/components/motion/ScrollReveal";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Paylo" },
      { name: "description", content: "Get in touch with the Paylo team. We're here to help with payroll, HR, and compliance questions." },
      { property: "og:title", content: "Contact — Paylo" },
      { property: "og:description", content: "Get in touch with the Paylo team. We're here to help with payroll, HR, and compliance questions." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/contact" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
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
            <Link to="/about" className="transition-colors hover:text-foreground">About</Link>
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
          <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-[10px] font-extrabold uppercase text-primary border border-primary/30">Contact</span>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl md:text-6xl text-white">
            We're here to help
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/70 md:text-lg">
            Whether you have a question about features, pricing, need a demo, or anything else, our team is ready to answer all your questions.
          </p>
        </ScrollReveal>
      </section>

      {/* CONTACT CARDS */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            { icon: <Mail className="h-6 w-6 text-primary" />, title: "Email us", desc: "For general inquiries and support", value: "hello@paylo.app", href: "mailto:hello@paylo.app" },
            { icon: <MessageSquare className="h-6 w-6 text-primary" />, title: "Live chat", desc: "Available during business hours", value: "Start a conversation", href: "#" },
            { icon: <Phone className="h-6 w-6 text-primary" />, title: "Call us", desc: "Mon–Fri, 9am–6pm ET", value: "1-800-PAYLO-01", href: "tel:1-800-PAYLO-01" },
          ].map((c) => (
            <a key={c.title} href={c.href} className="group rounded-[28px] border border-primary/15 bg-card p-8 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow hover:border-primary/40">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 border border-primary/25 transition-transform group-hover:scale-110">{c.icon}</div>
              <h3 className="text-xl font-semibold tracking-tight text-white">{c.title}</h3>
              <p className="mt-2 text-sm text-white/60">{c.desc}</p>
              <p className="mt-3 text-sm font-bold text-primary">{c.value}</p>
            </a>
          ))}
        </div>
      </section>

      {/* OFFICE */}
      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
        <ScrollReveal className="relative overflow-hidden rounded-[40px] surface-hero p-10 text-foreground shadow-float md:p-16">
          <div aria-hidden className="absolute inset-0 grid-bg opacity-20" />
          <div className="relative z-10 flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-primary/10 border border-primary/25">
              <MapPin className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-extrabold text-white">Headquarters</h2>
              <p className="mt-2 text-base text-white/70">
                100 Federal Street, Suite 1900<br />
                Boston, MA 02110<br />
                United States
              </p>
            </div>
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
