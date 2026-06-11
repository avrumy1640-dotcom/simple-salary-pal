import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { completeAccountSetup } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";


const authSearch = z.object({
  confirmed: z.string().optional(),
  reset: z.string().optional(),
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
type AuthMode = "signin" | "signup" | "setup";

type FieldErrors = Partial<Record<"fullName" | "email" | "password" | "confirmPassword" | "accountType" | "companyName", string>>;

const ADMIN_ROLES = new Set(["owner", "admin", "payroll_admin", "hr_admin", "recruiter", "benefits_admin", "accountant", "auditor", "manager", "supervisor"]);

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function authErrorMessage(message: string, context: "signin" | "signup" | "reset" = "signup") {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("user already") || m.includes("already exists") || m.includes("duplicate")) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (m.includes("invalid email") || m.includes("email address is invalid")) {
    return "Please enter a valid email address.";
  }
  if (m.includes("password") && (m.includes("short") || m.includes("weak") || m.includes("6 characters") || m.includes("8 characters"))) {
    return "Password must be at least 8 characters.";
  }
  if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("wrong") || m.includes("email not confirmed")) {
    return context === "signin" ? "Incorrect email or password. Please try again." : "Something went wrong. Please try again.";
  }
  if (m.includes("not found") || m.includes("user not found")) {
    return "No account found with this email. Please create an account.";
  }
  return context === "signin" ? "Something went wrong. Please try again." : message || "Something went wrong. Please try again.";
}

async function getUserDestination(uid: string) {
  try {
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid).limit(1),
      supabase.from("profiles").select("account_type").eq("id", uid).maybeSingle(),
    ]);
    const r = roles?.[0]?.role;
    if (r && ADMIN_ROLES.has(r)) return "/app/dashboard" as const;
    if ((profile as any)?.account_type === "employer") return "/app/dashboard" as const;
    if ((profile as any)?.account_type === "employee" || r === "employee") return "/employee/home" as const;
    return null;
  } catch (e) {
    console.error("[auth] post-signin routing error:", e);
    return null;
  }
}

async function routeByCurrentUser(navigate: ReturnType<typeof useNavigate>, uid: string, setMode: (mode: AuthMode) => void) {
  const destination = await getUserDestination(uid);
  if (destination) navigate({ to: destination, replace: true });
  else setMode("setup");
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const setupAccount = useServerFn(completeAccountSetup);
  const [mode, setMode] = useState<AuthMode>(search.mode ?? "signin");
  const [accountType, setAccountType] = useState<AccountType>("employer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("My Company");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => {
    if (mode === "signup") return "Create your account";
    if (mode === "setup") return "Finish account setup";
    return "Sign in";
  }, [mode]);

  useEffect(() => {
    if (search.confirmed === "1") {
      toast.success("Email confirmed! You can sign in now.");
    }
    if (search.reset === "1") {
      toast.success("Password updated. Please sign in.");
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const user = data.session.user;
      setEmail(user.email ?? "");
      setFullName((user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? "");
      await routeByCurrentUser(navigate, user.id, setMode);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validateSignup() {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = "Enter your full name.";
    if (!isValidEmail(email)) next.email = "Please enter a valid email address.";
    if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (confirmPassword !== password) next.confirmPassword = "Passwords must match.";
    if (!accountType) next.accountType = "Choose Employer or Employee.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateSignin() {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!isValidEmail(email)) next.email = "Please enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateSetup() {
    const next: FieldErrors = {};
    if (accountType === "employer" && !companyName.trim()) next.companyName = "Enter your company name.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!validateSignup()) return;
        const { firstName, lastName } = splitName(fullName);

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?confirmed=1`,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              full_name: fullName.trim(),
              company_name: accountType === "employer" ? "My Company" : null,
              account_type: accountType,
            },
          },
        });
        if (error) throw error;

        let user = data.user ?? data.session?.user ?? null;
        if (!data.session || !user) {
          const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) throw signInError;
          user = signIn.user;
        }
        if (!user) throw new Error("Something went wrong. Please try again.");

        const setup = await setupAccount({ data: { accountType, fullName: fullName.trim(), companyName: "My Company" } });
        toast.success("Account created. Welcome.");
        navigate({ to: setup.destination === "employer" ? "/app/dashboard" : "/employee/home", replace: true });
      } else {
        if (!validateSignin()) return;
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (data.user) await routeByCurrentUser(navigate, data.user.id, setMode);
      }
    } catch (err) {
      console.error("[auth] submit error:", err);
      const raw = err instanceof Error ? err.message : "Something went wrong";
      toast.error(authErrorMessage(raw, mode === "signin" ? "signin" : "signup"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
      extraParams: { prompt: "select_account" },
    });
    setLoading(false);
    if (result.error) { toast.error("Something went wrong. Please try again."); return; }
    if (result.redirected) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setEmail(user.email ?? "");
      setFullName((user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? "");
      await routeByCurrentUser(navigate, user.id, setMode);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    if (!validateSetup()) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const name = fullName.trim() || (user?.user_metadata?.full_name as string | undefined) || (user?.user_metadata?.name as string | undefined) || user?.email?.split("@")[0] || "User";
      const setup = await setupAccount({ data: { accountType, fullName: name, companyName: accountType === "employer" ? companyName.trim() : undefined } });
      toast.success("Account created. Welcome.");
      navigate({ to: setup.destination === "employer" ? "/app/dashboard" : "/employee/home", replace: true });
    } catch (err) {
      console.error("[auth] setup error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
          <h1 className="font-display text-3xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Pick up where you left off." : mode === "setup" ? "Choose the workspace you need." : "Start with email and password."}
          </p>

          {mode !== "setup" && (
            <>
              <Button
                variant="outline"
                type="button"
                className="mt-6 w-full border-border bg-card text-foreground hover:bg-muted hover:border-primary/30 transition-all"
                onClick={handleGoogle}
                disabled={loading}
              >
                Continue with Google
              </Button>

              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {mode === "setup" ? (
            <form onSubmit={handleSetup} className="mt-6 space-y-4 text-left">
              <AccountTypePicker accountType={accountType} setAccountType={setAccountType} />
              {errors.accountType && <p className="text-xs font-medium text-destructive">{errors.accountType}</p>}
              {accountType === "employer" && (
                <div>
                  <Label htmlFor="setupCompany" className="text-foreground">Company name</Label>
                  <Input id="setupCompany" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required maxLength={120} />
                  {errors.companyName && <p className="mt-1 text-xs font-medium text-destructive">{errors.companyName}</p>}
                </div>
              )}
              <Button type="submit" className="w-full bg-primary font-bold text-primary-foreground" disabled={loading}>
                {loading ? "Saving…" : "Continue"}
              </Button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            {mode === "signup" && (
              <>
                <AccountTypePicker accountType={accountType} setAccountType={setAccountType} />
                {errors.accountType && <p className="text-xs font-medium text-destructive">{errors.accountType}</p>}

                <div>
                  <Label htmlFor="fullName" className="text-foreground">Full Name</Label>
                  <Input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
                  {errors.fullName && <p className="mt-1 text-xs font-medium text-destructive">{errors.fullName}</p>}
                </div>
              </>
            )}

            <div>
              <Label htmlFor="email" className="text-foreground">Email Address</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {errors.email && <p className="mt-1 text-xs font-medium text-destructive">{errors.email}</p>}
            </div>
            <div>
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              {errors.password && <p className="mt-1 text-xs font-medium text-destructive">{errors.password}</p>}
              {mode === "signin" && (
                <div className="mt-1 text-center">
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
                </div>
              )}
            </div>
            {mode === "signup" && (
              <div>
                <Label htmlFor="confirmPassword" className="text-foreground">Confirm Password</Label>
                <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
                {errors.confirmPassword && <p className="mt-1 text-xs font-medium text-destructive">{errors.confirmPassword}</p>}
              </div>
            )}

            <Button
              type="submit"
              className="mt-2 w-full bg-primary font-bold text-primary-foreground hover:-translate-y-0.5 transition-all"
              disabled={loading}
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          )}

          {mode !== "setup" && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setErrors({}); setMode(mode === "signin" ? "signup" : "signin"); }}
            >
              {mode === "signin" ? "Create Account" : "Already have an account? Sign in"}
            </button>
          )}
          <Link to="/help/access-denied" className="mt-3 block text-center text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline">
            Seeing access denied?
          </Link>
        </div>

      </div>
    </div>
  );
}

function AccountTypePicker({ accountType, setAccountType }: { accountType: AccountType; setAccountType: (value: AccountType) => void }) {
  return (
    <div>
      <Label className="text-foreground">Account Type</Label>
      <RadioGroup
        value={accountType}
        onValueChange={(v) => setAccountType(v as AccountType)}
        className="mt-2 grid grid-cols-2 gap-2"
      >
        <label className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border p-3 text-center text-sm transition ${accountType === "employer" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
          <RadioGroupItem value="employer" className="sr-only" />
          <div className="font-semibold text-foreground">Employer</div>
          <div className="mt-1 text-xs text-muted-foreground">Run payroll and manage a team</div>
        </label>
        <label className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border p-3 text-center text-sm transition ${accountType === "employee" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
          <RadioGroupItem value="employee" className="sr-only" />
          <div className="font-semibold text-foreground">Employee</div>
          <div className="mt-1 text-xs text-muted-foreground">Access pay, time off, and profile</div>
        </label>
      </RadioGroup>
    </div>
  );
}
