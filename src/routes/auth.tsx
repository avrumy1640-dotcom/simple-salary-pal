import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { completeAccountSetup, claimEmployeeAccounts } from "@/lib/auth.functions";
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
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (m.includes("already registered") || m.includes("user already") || m.includes("already exists") || m.includes("duplicate")) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (m.includes("email not confirmed")) {
    return "Please check your email and click the confirmation link before signing in.";
  }
  if (m.includes("password") && (m.includes("short") || m.includes("weak") || m.includes("6 characters") || m.includes("8 characters") || m.includes("at least"))) {
    return "Password must be at least 8 characters.";
  }
  if (m.includes("invalid email") || m.includes("email address is invalid")) {
    return "Please enter a valid email address.";
  }
  if (context === "signin" && (m.includes("not found") || m.includes("user not found"))) {
    return "Incorrect email or password. Please try again.";
  }
  return "Something went wrong. Please try again.";
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

async function routeByCurrentUser(
  navigate: ReturnType<typeof useNavigate>,
  uid: string,
  setMode: (mode: AuthMode) => void,
  claim: () => Promise<unknown>,
) {
  const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", uid).maybeSingle();
  if ((profile as any)?.account_type === "employee") {
    try { await claim(); } catch (e) { console.error("[auth] claim error:", e); }
  }
  const destination = await getUserDestination(uid);
  if (destination) navigate({ to: destination, replace: true });
  else setMode("setup");
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const setupAccount = useServerFn(completeAccountSetup);
  const claimAccounts = useServerFn(claimEmployeeAccounts);
  const [mode, setMode] = useState<AuthMode>(search.mode ?? "signin");
  const [accountType, setAccountType] = useState<AccountType>("employer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("My Company");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => {
    if (mode === "signup") return "Create your account";
    if (mode === "setup") return "Finish account setup";
    return "Welcome back";
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
      await routeByCurrentUser(navigate, user.id, setMode, claimAccounts);
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
    if (loading) return;
    setErrors({});
    setFormError(null);
    if (mode === "signup" ? !validateSignup() : !validateSignin()) return;
    setLoading(true);
    try {
      if (mode === "signup") {
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
        if (data.user?.identities && data.user.identities.length === 0) {
          throw new Error("An account with this email already exists. Please sign in instead.");
        }

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
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (data.user) await routeByCurrentUser(navigate, data.user.id, setMode, claimAccounts);
      }
    } catch (err) {
      console.error("[auth] submit error:", err);
      const raw = err instanceof Error ? err.message : "Something went wrong";
      const msg = authErrorMessage(raw, mode === "signin" ? "signin" : "signup");
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (loading) return;
    setFormError(null);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth/callback`,
        extraParams: { prompt: "select_account" },
      });
      if (result.error) {
        setFormError("Something went wrong. Please try again.");
        return;
      }
      if (result.redirected) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? "");
        setFullName((user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? "");
        await routeByCurrentUser(navigate, user.id, setMode, claimAccounts);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErrors({});
    setFormError(null);
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
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = mode === "signin" ? "Sign in" : "Create account";

  return (
    <div className="min-h-screen bg-white px-4 py-10 grid place-items-center">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex flex-col items-center gap-2">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground">P</div>
          <span className="text-xl font-bold tracking-tight text-foreground">Paylo</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <h1 className="text-center text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to your account to continue."
              : mode === "setup"
                ? "Choose the workspace you need."
                : "Get started in less than a minute."}
          </p>

          {mode !== "setup" && (
            <>
              <Button
                variant="outline"
                type="button"
                className="mt-6 w-full"
                onClick={handleGoogle}
                disabled={loading}
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </Button>

              <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {mode === "setup" ? (
            <form onSubmit={handleSetup} className="space-y-5 text-left">
              <AccountTypePicker accountType={accountType} setAccountType={setAccountType} />
              {errors.accountType && <p className="text-sm font-medium text-destructive">{errors.accountType}</p>}
              {accountType === "employer" && (
                <div className="space-y-1.5">
                  <Label htmlFor="setupCompany">Company name</Label>
                  <Input id="setupCompany" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required maxLength={120} />
                  {errors.companyName && <p className="text-sm font-medium text-destructive">{errors.companyName}</p>}
                </div>
              )}
              {formError && (
                <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {formError}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (<><Loader2 className="animate-spin" /> Saving…</>) : "Continue"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              {mode === "signup" && (
                <>
                  <AccountTypePicker accountType={accountType} setAccountType={setAccountType} />
                  {errors.accountType && <p className="text-sm font-medium text-destructive">{errors.accountType}</p>}

                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} />
                    {errors.fullName && <p className="text-sm font-medium text-destructive">{errors.fullName}</p>}
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
                {errors.email && <p className="text-sm font-medium text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                />
                {errors.password && <p className="text-sm font-medium text-destructive">{errors.password}</p>}
              </div>

              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
                  {errors.confirmPassword && <p className="text-sm font-medium text-destructive">{errors.confirmPassword}</p>}
                </div>
              )}

              {formError && (
                <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {formError}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
                {loading ? (<><Loader2 className="animate-spin" /> Please wait…</>) : submitLabel}
              </Button>
            </form>
          )}

          {mode !== "setup" && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => { setErrors({}); setFormError(null); setMode("signup"); }}
                  >
                    Create account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => { setErrors({}); setFormError(null); setMode("signin"); }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          )}

          <Link to="/help/access-denied" className="mt-4 block text-center text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
            Seeing access denied?
          </Link>
        </div>
      </div>
    </div>
  );
}

function AccountTypePicker({ accountType, setAccountType }: { accountType: AccountType; setAccountType: (value: AccountType) => void }) {
  return (
    <div className="space-y-2">
      <Label>Account type</Label>
      <RadioGroup
        value={accountType}
        onValueChange={(v) => setAccountType(v as AccountType)}
        className="grid grid-cols-2 gap-2"
      >
        <label className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border p-3 text-center text-sm transition ${accountType === "employer" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
          <RadioGroupItem value="employer" className="sr-only" />
          <div className="font-semibold text-foreground">Employer</div>
          <div className="mt-1 text-xs text-muted-foreground">Run payroll and manage a team</div>
        </label>
        <label className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border p-3 text-center text-sm transition ${accountType === "employee" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
          <RadioGroupItem value="employee" className="sr-only" />
          <div className="font-semibold text-foreground">Employee</div>
          <div className="mt-1 text-xs text-muted-foreground">Access pay, time off, and profile</div>
        </label>
      </RadioGroup>
    </div>
  );
}
