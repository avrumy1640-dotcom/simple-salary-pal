import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, Lock, Eye, Trash2, Server } from "lucide-react";
import { ScrollReveal } from "@/components/motion/ScrollReveal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Paylo" },
      { name: "description", content: "Paylo's privacy policy. Learn how we collect, use, and protect your personal and business data." },
      { property: "og:title", content: "Privacy Policy — Paylo" },
      { property: "og:description", content: "Paylo's privacy policy. Learn how we collect, use, and protect your personal and business data." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/privacy" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyPage,
});

const sections = [
  {
    icon: <Eye className="h-5 w-5 text-primary" />,
    title: "Information we collect",
    content: `We collect information you provide directly to us, such as your name, email address, phone number, company details, and payment information. We also collect data generated through your use of the platform, including payroll records, time tracking entries, and employee information you choose to store.

Additionally, we automatically collect certain technical information when you use Paylo, including IP addresses, browser type, device information, and usage patterns through cookies and similar technologies.`,
  },
  {
    icon: <Lock className="h-5 w-5 text-primary" />,
    title: "How we use your information",
    content: `We use the information we collect to:

• Provide, maintain, and improve our payroll and HR services
• Process transactions and send related information
• Send technical notices, updates, security alerts, and support messages
• Respond to your comments and questions and provide customer service
• Monitor and analyze trends, usage, and activities in connection with our services
• Detect, investigate, and prevent fraudulent transactions and other illegal activities
• Personalize and improve your experience on our platform`,
  },
  {
    icon: <ShieldCheck className="h-5 w-5 text-primary" />,
    title: "How we share information",
    content: `We do not sell your personal information. We may share information with:

• Service providers who perform services on our behalf (payment processors, cloud hosting, customer support)
• Regulatory authorities and law enforcement when required by law
• Business partners with your explicit consent
• In connection with a merger, acquisition, or sale of assets

All third-party service providers are bound by strict confidentiality agreements and data processing terms.`,
  },
  {
    icon: <Server className="h-5 w-5 text-primary" />,
    title: "Data security",
    content: `We implement industry-standard security measures to protect your data:

• 256-bit AES encryption for data at rest and in transit
• SOC 2 Type II certified infrastructure
• Role-based access controls with principle of least privilege
• Regular security audits and penetration testing
• Automated threat detection and anomaly monitoring
• Secure data centers with 99.99% uptime SLA`,
  },
  {
    icon: <Trash2 className="h-5 w-5 text-primary" />,
    title: "Data retention and deletion",
    content: `We retain your information for as long as your account is active or as needed to provide you services. If you cancel your account, we will delete or anonymize your data within 90 days, except where we are required to retain it for legal, tax, or regulatory purposes.

You can request a full export of your data at any time through your account settings or by contacting our support team.`,
  },
];

function PrivacyPage() {
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
          <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-[10px] font-extrabold uppercase text-primary border border-primary/30">Legal</span>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl md:text-6xl text-white">
            Privacy Policy
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/70 md:text-lg">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </ScrollReveal>
      </section>

      {/* CONTENT */}
      <section className="mx-auto max-w-3xl px-5 pb-24 md:px-8">
        <div className="space-y-10">
          <p className="text-base leading-8 text-white/70">
            Paylo, Inc. ("Paylo," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website, software, and services (collectively, the "Services").
          </p>

          {sections.map((s) => (
            <div key={s.title} className="rounded-[28px] border border-primary/15 bg-card p-8">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/25">{s.icon}</div>
                <h2 className="text-xl font-semibold tracking-tight text-white">{s.title}</h2>
              </div>
              <div className="whitespace-pre-line text-sm leading-relaxed text-white/70">{s.content}</div>
            </div>
          ))}

          <div className="rounded-[28px] border border-primary/15 bg-card p-8">
            <h2 className="text-xl font-semibold tracking-tight text-white">Your rights</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Depending on your location, you may have rights to access, correct, delete, or restrict processing of your personal data. You may also have the right to object to processing and the right to data portability. To exercise these rights, contact us at privacy@paylo.app.
            </p>
          </div>

          <div className="rounded-[28px] border border-primary/15 bg-card p-8">
            <h2 className="text-xl font-semibold tracking-tight text-white">Changes to this policy</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date. We encourage you to review this policy periodically.
            </p>
          </div>

          <div className="rounded-[28px] border border-primary/15 bg-card p-8">
            <h2 className="text-xl font-semibold tracking-tight text-white">Contact us</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              If you have any questions about this Privacy Policy, please contact us at privacy@paylo.app or through our <Link to="/contact" className="text-primary hover:underline">contact page</Link>.
            </p>
          </div>
        </div>
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
