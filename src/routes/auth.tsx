import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Paylo" }] }),
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
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, company_name: companyName },
          },
        });
        if (error) throw error;
        toast.success("Account created! You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/dashboard` });
    if (result.error) { toast.error("Google sign-in failed"); return; }
    if (result.redirected) return;
    navigate({ to: "/app/dashboard" });
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      {/* Floating orbs */}
      <div aria-hidden className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-[#2563EB]/30 blur-3xl orb-1" />
      <div aria-hidden className="absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-[#F5C518]/12 blur-3xl orb-2" />
      <div aria-hidden className="absolute inset-0 grid-bg opacity-30" />

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="mb-6 flex flex-col items-center justify-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-brand text-xl font-extrabold text-white shadow-glow">P</div>
          <span className="font-display text-3xl font-bold tracking-tight text-white">Paylo</span>
        </Link>

        <div className="mb-8 flex h-12 items-center justify-center">
          <span className="script-typer text-3xl sm:text-4xl">Welcome back</span>
        </div>

        <div className="surface-glass rounded-[2rem] border border-white/12 p-6 shadow-float md:p-7">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#F5C518]/35 bg-[#F5C518]/10 px-3 py-1 text-xs font-bold text-[#F5C518]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5C518] pulse-dot" />
            Secure HR + payroll access
          </div>
          <h1 className="font-display text-3xl font-bold text-white">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-white/60">
            {mode === "signin" ? "Pick up where you left off." : "Start running payroll in minutes."}
          </p>

          <Button variant="outline" type="button" className="mt-6 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-[#F5C518]/40 hover:shadow-gold" onClick={handleGoogle}>
            Continue with Google
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-white/50">
            <div className="h-px flex-1 bg-white/10" /> OR <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="company" className="text-white/80">Company name</Label>
                  <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="name" className="text-white/80">Your name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email" className="text-white/80">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password" className="text-white/80">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="mt-2 w-full gradient-brand font-bold text-white hover:shadow-glow" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-white/60 hover:text-[#F5C518] transition-colors"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
