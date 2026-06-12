import { createFileRoute, redirect } from "@tanstack/react-router";
import { EmployeeShell } from "@/components/EmployeeShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/employee")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/auth" });
  },
  component: EmployeeShell,
});
