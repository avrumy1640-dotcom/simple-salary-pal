import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, RefreshCw, Shield, User, Clock, Key, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/app/auth-debug")({
  component: AuthDebugPage,
});

function AuthDebugPage() {
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [roleData, setRoleData] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [companiesData, setCompaniesData] = useState<any>(null);
  const [timestamp, setTimestamp] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setTimestamp(new Date().toISOString());

    try {
      const { data: sessionDataRaw } = await supabase.auth.getSession();
      setSessionData(sessionDataRaw.session);

      const { data: userDataRaw } = await supabase.auth.getUser();
      setUserData(userDataRaw.user);

      if (userDataRaw.user) {
        const uid = userDataRaw.user.id;
        const [{ data: roles }, { data: profile }, { data: companies }] = await Promise.all([
          supabase.from("user_roles").select("role,company_id").eq("user_id", uid),
          supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
          supabase.from("company_users").select("company_id,is_default").eq("user_id", uid),
        ]);
        setRoleData(roles);
        setProfileData(profile);
        setCompaniesData(companies);
      }
    } catch (e) {
      toast.error("Failed to load auth debug data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const buildReport = () => {
    const report = {
      generatedAt: timestamp,
      url: typeof window !== "undefined" ? window.location.href : "",
      session: {
        exists: !!sessionData,
        expires_at: sessionData?.expires_at ? new Date(sessionData.expires_at * 1000).toISOString() : null,
        provider: sessionData?.user?.app_metadata?.provider ?? null,
      },
      user: userData
        ? {
            id: userData.id,
            email: userData.email,
            confirmed_at: userData.confirmed_at,
            created_at: userData.created_at,
            last_sign_in_at: userData.last_sign_in_at,
            providers: userData.app_metadata?.providers ?? [],
          }
        : null,
      roles: roleData ?? [],
      profile: profileData ?? null,
      companyMemberships: companiesData ?? [],
    };
    return JSON.stringify(report, null, 2);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReport());
      toast.success("Troubleshooting report copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const roleBadges = (roleData ?? []).map((r: any) => r.role);
  const primaryRole = roleBadges[0] ?? "unknown";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auth Debug</h1>
          <p className="text-sm text-slate-500">Inspect session, user, role, and profile state.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={copyReport}>
            <Copy className="mr-2 h-4 w-4" />
            Copy report
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-32 w-full rounded-xl" />
          <div className="skeleton h-32 w-full rounded-xl" />
          <div className="skeleton h-32 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Key className="h-4 w-4 text-primary" />
                Session
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Session present" value={sessionData ? "Yes" : "No"} />
              <Row label="Expires at" value={sessionData?.expires_at ? new Date(sessionData.expires_at * 1000).toLocaleString() : "—"} />
              <Row label="Provider" value={sessionData?.user?.app_metadata?.provider ?? "email"} />
              <Row label="Timestamp" value={timestamp} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <User className="h-4 w-4 text-primary" />
                User
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {userData ? (
                <>
                  <Row label="Email" value={userData.email ?? "—"} />
                  <Row label="User ID" value={userData.id} />
                  <Row label="Confirmed" value={userData.confirmed_at ? "Yes" : "No"} />
                  <Row label="Created" value={userData.created_at ? new Date(userData.created_at).toLocaleString() : "—"} />
                  <Row label="Last sign-in" value={userData.last_sign_in_at ? new Date(userData.last_sign_in_at).toLocaleString() : "—"} />
                  <Row label="Providers" value={(userData.app_metadata?.providers ?? []).join(", ") || "email"} />
                </>
              ) : (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  No user returned from getUser()
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Shield className="h-4 w-4 text-primary" />
                Roles & Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-slate-500">Detected roles</span>
                <div className="flex flex-wrap gap-1">
                  {roleBadges.length > 0 ? (
                    roleBadges.map((r: string) => (
                      <Badge key={r} variant="secondary" className="capitalize">
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-amber-600">None found</span>
                  )}
                </div>
              </div>
              <Row label="Account type" value={profileData?.account_type ?? "—"} />
              <Row label="Full name" value={profileData?.full_name ?? "—"} />
              <Row label="Company name" value={profileData?.company_name ?? "—"} />
              <Row label="Company memberships" value={companiesData ? `${companiesData.length} found` : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Clock className="h-4 w-4 text-primary" />
                Quick checks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <CheckRow ok={!!sessionData} label="Supabase session exists" />
              <CheckRow ok={!!userData} label="User object resolved" />
              <CheckRow ok={roleBadges.length > 0} label="At least one role assigned" />
              <CheckRow ok={profileData?.account_type === "employer" || profileData?.account_type === "employee"} label="Profile account_type set" />
              <CheckRow ok={!!companiesData && companiesData.length > 0} label="Company membership exists" />
              <CheckRow ok={primaryRole !== "employee"} label="Can access admin portal (non-employee role)" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-28 shrink-0 text-slate-500">{label}</span>
      <span className="font-mono text-xs break-all text-foreground">{value}</span>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} />
      <span className={ok ? "text-emerald-700" : "text-rose-700"}>{label}</span>
    </div>
  );
}
