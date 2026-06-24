import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLES = new Set([
  "owner",
  "admin",
  "payroll_admin",
  "hr_admin",
  "recruiter",
  "benefits_admin",
  "accountant",
  "auditor",
  "manager",
  "supervisor",
]);

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Signing you in — Paylo" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallbackPage,
});

async function resolveDestination(uid: string): Promise<"/app/dashboard" | "/employee/home" | "/auth"> {
  try {
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid).limit(1),
      supabase.from("profiles").select("account_type").eq("id", uid).maybeSingle(),
    ]);
    const r = roles?.[0]?.role;
    if (r && ADMIN_ROLES.has(r)) return "/app/dashboard";
    if ((profile as any)?.account_type === "employer") return "/app/dashboard";
    if ((profile as any)?.account_type === "employee" || r === "employee") return "/employee/home";
    return "/auth";
  } catch (e) {
    console.error("[auth/callback] routing error:", e);
    return "/auth";
  }
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function go(uid: string) {
      const dest = await resolveDestination(uid);
      if (cancelled) return;
      if (dest === "/auth") {
        // No role/profile yet — let /auth complete the setup flow.
        navigate({ to: "/auth", replace: true });
      } else {
        navigate({ to: dest, replace: true });
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.user) {
        void go(data.session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) void go(session.user.id);
    });

    const timer = window.setTimeout(() => {
      if (!cancelled) setError("We couldn't complete sign in. Please try again.");
    }, 8000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-white px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">
          {error ?? "Finishing sign in…"}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => navigate({ to: "/auth", replace: true })}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
