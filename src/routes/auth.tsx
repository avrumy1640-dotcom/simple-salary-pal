import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Sparkles, ShieldCheck, Building2, User } from "lucide-react";

const authSearch = z.object({
  confirmed: z.string().optional(),
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => authSearch.parse(s),
  head: () => ({
    meta: [
      { title: "Sign in — Paylo" },
      { name: "description", content: "Sign in to your Paylo account to run payroll, manage your team, and file taxes." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  component: AuthPage,
});

type AccountType = "employer" | "employee";

async function routeByRoleOrProfile(navigate: ReturnType<typeof useNavigate>, uid: string) {
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid).limit(1),
    supabase.from("profiles").select("account_type").eq("id", uid).maybeSingle(),
  ]);
  const adminRoles = new Set(["owner","admin","payroll_admin","hr_admin","recruiter","benefits_admin","accountant","auditor","manager","supervisor"]);
  const r = roles?.[0]?.role;
  if (r && adminRoles.has(r)) {
    navigate({ to: "/app/dashboard" });
    return;
  }
  // No admin role — route by intent
  if ((profile as any)?.account_type === "employer") {
    // Employer that has no company yet (shouldn't happen, but route to dashboard to bootstrap)
    navigate({ to: "/app/dashboard" });
    return;
  }
  navigate({ to: "/employee/home" });
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [accountType, setAccountType] = useState<AccountType>("employer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (search.confirmed === "1") {
      toast.success("Email confirmed! You can sign in now.");
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await routeByRoleOrProfile(navigate, data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!firstName.trim() || !lastName.trim()) throw new Error("Please enter your first and last name.");
        if (accountType === "employer" && !companyName.trim()) throw new Error("Please enter your company name.");

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?confirmed=1`,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              full_name: `${firstName.trim()} ${lastName.trim()}`,
              company_name: accountType === "employer" ? companyName.trim() : null,
              account_type: accountType,
            },
          },
        });
        if (error) throw error;
        if (data.user && !data.session) {
          toast.success("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
        } else if (data.session) {
          await routeByRoleOrProfile(navigate, data.session.user.id);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          if (/email not confirmed/i.test(error.message)) {
            throw new Error("Please confirm your email first. Check your inbox for the verification link.");
          }
          throw error;
        }
        if (data.user) await routeByRoleOrProfile(navigate, data.user.id);
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
    if (user) await routeByRoleOrProfile(navigate, user.id);
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl orb-1" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-10 h-[28rem] w-[28rem] rounded-full bg-card/80 blur-3xl orb-2" />
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-30" />

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="mb-6 flex flex-col items-center justify-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-brand text-xl font-extrabold text-primary-foreground shadow-glow">P</div>
          <span className="font-display text-3xl font-bold tracking-tight text-foreground">Paylo</span>
        </Link>

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
            className="mt-6 w-full border-border bg-card text-foreground hover:bg-muted hover:border-primary/30 transition-all"
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
                  <Label className="text-foreground">I'm signing up as</Label>
                  <RadioGroup
                    value={accountType}
                    onValueChange={(v) => setAccountType(v as AccountType)}
                    className="mt-2 grid grid-cols-2 gap-2"
                  >
                    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${accountType==="employer" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="employer" className="mt-0.5" />
                      <div>
                        <div className="flex items-center gap-1.5 font-semibold"><Building2 className="h-3.5 w-3.5" />Employer / Admin</div>
                        <div className="text-xs text-muted-foreground">Run payroll & manage a team</div>
                      </div>
                    </label>
                    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${accountType==="employee" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="employee" className="mt-0.5" />
                      <div>
                        <div className="flex items-center gap-1.5 font-semibold"><User className="h-3.5 w-3.5" />Employee</div>
                        <div className="text-xs text-muted-foreground">Access pay & time off</div>
                      </div>
                    </label>
                  </RadioGroup>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName" className="text-foreground">First name</Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={60} />
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="text-foreground">Last name</Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required maxLength={60} />
                  </div>
                </div>

                {accountType === "employer" && (
                  <div>
                    <Label htmlFor="company" className="text-foreground">Company name</Label>
                    <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required maxLength={120} />
                  </div>
                )}
              </>
            )}

            <div>
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              {mode === "signin" && (
                <div className="mt-1 text-right">
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="mt-2 w-full bg-primary font-bold text-primary-foreground hover:-translate-y-0.5 transition-all"
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
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Secure email verification · Bank-grade encryption
        </div>
      </div>
    </div>
  );
}
