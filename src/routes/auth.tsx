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
  try {
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid).limit(1),
      supabase.from("profiles").select("account_type").eq("id", uid).maybeSingle(),
    ]);
    const adminRoles = new Set(["owner","admin","payroll_admin","hr_admin","recruiter","benefits_admin","accountant","auditor","manager","supervisor"]);
    const r = roles?.[0]?.role;
    if (r && adminRoles.has(r)) { navigate({ to: "/app/dashboard" }); return; }
    if ((profile as any)?.account_type === "employer") { navigate({ to: "/app/dashboard" }); return; }
    navigate({ to: "/employee/home" });
  } catch (e) {
    console.error("[auth] post-signin routing error, falling back:", e);
    navigate({ to: "/employee/home" });
  }
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

  function friendlyError(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes("already registered") || m.includes("user already") || m.includes("already exists")) {
      return "An account with this email already exists. Try signing in instead.";
    }
    if (m.includes("invalid login") || m.includes("invalid credentials")) {
      return "Incorrect email or password. Please try again.";
    }
    if (m.includes("email not confirmed")) {
      return "Please confirm your email first. Check your inbox for the verification link.";
    }
    if (m.includes("password") && (m.includes("short") || m.includes("weak") || m.includes("6 characters"))) {
      return "Please choose a stronger password with at least 8 characters.";
    }
    if (m.includes("network") || m.includes("fetch")) {
      return "Connection problem. Please check your internet and try again.";
    }
    if (m.includes("rate") || m.includes("too many")) {
      return "Too many attempts. Please wait a moment and try again.";
    }
    return msg;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!firstName.trim() || !lastName.trim()) throw new Error("Please enter your first and last name.");
        if (accountType === "employer" && !companyName.trim()) throw new Error("Please enter your company name.");
        if (password.length < 8) throw new Error("Please choose a stronger password with at least 8 characters.");

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

        // With auto-confirm enabled, signUp returns a session. If not, sign in directly.
        if (!data.session) {
          const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) throw signInError;
          if (signIn.user) {
            toast.success("Account created successfully. Welcome to the app.");
            await routeByRoleOrProfile(navigate, signIn.user.id);
          }
        } else {
          toast.success("Account created successfully. Welcome to the app.");
          await routeByRoleOrProfile(navigate, data.session.user.id);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (data.user) await routeByRoleOrProfile(navigate, data.user.id);
      }
    } catch (err) {
      console.error("[auth] submit error:", err);
      const raw = err instanceof Error ? err.message : "Something went wrong";
      toast.error(friendlyError(raw));
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

        <div className="surface-glass rounded-[2rem] p-6 shadow-float text-center md:p-7">
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

          <form onSubmit={handleSubmit} className="space-y-4 text-center">
            {mode === "signup" && (
              <>
                <div>
                  <Label className="text-foreground">I'm signing up as</Label>
                  <RadioGroup
                    value={accountType}
                    onValueChange={(v) => setAccountType(v as AccountType)}
                    className="mt-2 grid grid-cols-2 gap-2"
                  >
                    <label className={`flex flex-col items-center justify-center cursor-pointer rounded-lg border p-3 text-sm text-center ${accountType==="employer" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="employer" className="sr-only" />
                      <div className="flex items-center gap-1.5 font-semibold">Employer / Admin</div>
                      <div className="text-xs text-muted-foreground">Run payroll & manage a team</div>
                    </label>
                    <label className={`flex flex-col items-center justify-center cursor-pointer rounded-lg border p-3 text-sm text-center ${accountType==="employee" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="employee" className="sr-only" />
                      <div className="flex items-center gap-1.5 font-semibold">Employee</div>
                      <div className="text-xs text-muted-foreground">Access pay & time off</div>
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
                <div className="mt-1 text-center">
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
          <Link to="/help/access-denied" className="mt-3 block text-center text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline">
            Seeing access denied?
          </Link>
        </div>

      </div>
    </div>
  );
}
