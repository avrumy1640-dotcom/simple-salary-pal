import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { getAdminAccess } from "@/lib/access.functions";

export const Route = createFileRoute("/app")({
  // Server-side gate: anyone without an admin/manager role is bounced
  // before the admin shell mounts. Defense-in-depth on top of RLS.
  beforeLoad: async () => {
    try {
      const res = await getAdminAccess();
      if (!res.hasAccess) {
        throw redirect({ to: "/help/access-denied" });
      }
    } catch (e: any) {
      // Unauthenticated → send to login. Auth middleware throws an
      // Unauthorized Response which we map to a redirect here.
      if (isRedirect(e)) throw e; // pass through redirects
      throw redirect({ to: "/auth" });
    }
  },
  component: AppShell,
});
