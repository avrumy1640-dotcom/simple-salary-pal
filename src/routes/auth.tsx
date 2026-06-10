import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Paylo" },
      { name: "description", content: "Sign in to your Paylo account to run payroll, manage your team, and file taxes." },
      { property: "og:title", content: "Sign in — Paylo" },
      { property: "og:description", content: "Sign in to your Paylo account." },
      { property: "og:url", content: "/auth" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await routeByRole(data.session.user.id);
    });
  }, [navigate]);

  async function routeByRole(uid: string) {
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid).limit(1);
    const r = (roles && roles[0]?.role) || "employee";
    const admin = ["owner","admin","payroll_admin","hr_admin","recruiter","benefits_admin","accountant","auditor","manager","supervisor"].includes(r);
    navigate({ to: admin ? "/app/dashboard" : "/employee/home" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/app/dashboard`,
            data: { full_name: fullName, company_name: companyName },
          },
        });
        if (error) throw error;
        toast.success("Account created! You can sign in now.");
        setMode("signin");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await routeByRole(data.user.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
    if (result.error) { toast.error("Google sign-in failed"); return; }
    if (result.redirected) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await routeByRole(user.id);
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      {/* Drifting gradient orbs */}
      <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl orb-1" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-10 h-[28rem] w-[28rem] rounded-full bg-card/80 blur-3xl orb-2" />
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-30" />

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="mb-6 flex flex-col items-center justify-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-brand text-xl font-extrabold text-primary-foreground shadow-glow">P</div>
          <span className="font-display text-3xl font-bold tracking-tight text-foreground">Paylo</span>
        </Link>

        <div className="mb-6 flex h-14 items-center justify-center">
          <span className="script-typer text-3xl text-foreground sm:text-4xl">Welcome back</span>
        </div>

        <div className="surface-glass rounded-[2rem] p-6 shadow-float md:p-7">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1 text-xs font-bold text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Secure HR + payroll access
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Pick up where you left off." : "Start running payroll in minutes."}
          </p>

          <Button
            variant="outline"
            type="button"
            className="mt-6 w-full border-border bg-card text-foreground hover:bg-muted hover:border-primary/30 hover:shadow-glow transition-all"
            onClick={handleGoogle}
          >
            Continue with Google
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="company" className="text-foreground">Company name</Label>
                  <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="name" className="text-foreground">Your name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button
              type="submit"
              className="mt-2 w-full bg-primary font-bold text-primary-foreground hover:-translate-y-0.5 hover:shadow-glow transition-all"
              disabled={loading}
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "New here? Start your 14-day free trial" : "Already have an account? Sign in"}
          </button>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          14-day free trial · No credit card required
        </div>
      </div>
    </div>
  );
}
