import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/motion/ScrollReveal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Paylo" },
      { name: "description", content: "Paylo's terms of service. Read the agreement governing your use of our payroll and HR platform." },
      { property: "og:title", content: "Terms of Service — Paylo" },
      { property: "og:description", content: "Paylo's terms of service. Read the agreement governing your use of our payroll and HR platform." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: TermsPage,
});

const sections = [
  {
    title: "1. Acceptance of terms",
    content: `By accessing or using Paylo's services, website, or mobile applications (collectively, the "Services"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Services.

These Terms constitute a legally binding agreement between you and Paylo, Inc. ("Paylo," "we," "us," or "our") regarding your use of the Services.`,
  },
  {
    title: "2. Eligibility",
    content: `You must be at least 18 years old and capable of forming a binding contract to use our Services. By using Paylo, you represent and warrant that you meet all eligibility requirements.

If you are using Paylo on behalf of a company, organization, or other entity, you represent and warrant that you have the authority to bind that entity to these Terms.`,
  },
  {
    title: "3. Account registration and security",
    content: `To access certain features of the Services, you must register for an account. You agree to provide accurate, current, and complete information during registration and to keep your account information updated.

You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.`,
  },
  {
    title: "4. Subscription and payment",
    content: `Paylo offers subscription-based plans as described on our Pricing page. By selecting a plan, you agree to pay the applicable fees.

• All fees are billed in advance on a monthly basis
• You may upgrade or downgrade your plan at any time
• We offer a 14-day free trial for new accounts
• Fees are non-refundable except as required by law
• We reserve the right to change pricing with 30 days notice`,
  },
  {
    title: "5. Acceptable use",
    content: `You agree not to use the Services to:

• Violate any applicable law, regulation, or ordinance
• Infringe upon the rights of others
• Upload or transmit viruses, malware, or other harmful code
• Attempt to gain unauthorized access to our systems
• Interfere with or disrupt the integrity of the Services
• Use the Services to process payroll for illegal activities
• Reverse engineer, decompile, or disassemble any part of the Services`,
  },
  {
    title: "6. Data and content",
    content: `You retain all rights to the data and content you upload to Paylo ("Your Content"). By uploading Your Content, you grant us a limited license to use, process, and store it solely for the purpose of providing the Services.

We will not use Your Content for advertising purposes or sell it to third parties. We may use aggregated, anonymized data for analytics and service improvement.`,
  },
  {
    title: "7. Intellectual property",
    content: `Paylo and its licensors own all right, title, and interest in and to the Services, including all intellectual property rights. These Terms do not grant you any right, title, or interest in our trademarks, logos, or brand elements.

You may not use our trademarks without prior written permission. All feedback you provide regarding the Services may be used by us without restriction.`,
  },
  {
    title: "8. Disclaimer of warranties",
    content: `THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

While Paylo provides tax calculations and filing assistance, we are not a certified public accounting firm. You are ultimately responsible for the accuracy of your tax filings and compliance with all applicable laws.`,
  },
  {
    title: "9. Limitation of liability",
    content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAYLO SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICES.

Our total liability to you for any claim arising from these Terms shall not exceed the amount you paid us in the 12 months preceding the claim.`,
  },
  {
    title: "10. Termination",
    content: `You may cancel your account at any time through your account settings or by contacting support. Upon cancellation, your access to the Services will terminate at the end of your current billing period.

We may suspend or terminate your account if you violate these Terms or if required by law. Upon termination, we will delete your data in accordance with our Privacy Policy.`,
  },
  {
    title: "11. Governing law",
    content: `These Terms shall be governed by and construed in accordance with the laws of the Commonwealth of Massachusetts, without regard to its conflict of law principles.

Any dispute arising from these Terms shall be resolved exclusively in the state or federal courts located in Boston, Massachusetts.`,
  },
  {
    title: "12. Changes to terms",
    content: `We may modify these Terms at any time. We will notify you of material changes by email or through the Services at least 30 days before they take effect. Your continued use of the Services after changes take effect constitutes acceptance of the revised Terms.`,
  },
];

function TermsPage() {
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
            Terms of Service
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
            These Terms of Service ("Terms") govern your access to and use of Paylo's payroll, HR, and compliance services. Please read these Terms carefully before using our Services.
          </p>

          {sections.map((s) => (
            <div key={s.title} className="rounded-[28px] border border-primary/15 bg-card p-8">
              <h2 className="text-xl font-semibold tracking-tight text-white">{s.title}</h2>
              <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-white/70">{s.content}</div>
            </div>
          ))}

          <div className="rounded-[28px] border border-primary/15 bg-card p-8">
            <h2 className="text-xl font-semibold tracking-tight text-white">Contact us</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              If you have any questions about these Terms, please contact us at legal@paylo.app or through our <Link to="/contact" className="text-primary hover:underline">contact page</Link>.
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
