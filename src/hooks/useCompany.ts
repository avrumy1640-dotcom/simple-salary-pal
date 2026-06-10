import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyMembership {
  company_id: string;
  legal_name: string;
  is_default: boolean;
  roles: string[];
}

const STORAGE_KEY = "paylo:current_company_id";

export function useCompany() {
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: cu } = await supabase
        .from("company_users")
        .select("company_id, is_default, companies(legal_name)")
        .eq("user_id", user.id);

      const { data: roles } = await supabase
        .from("user_roles").select("company_id, role").eq("user_id", user.id);

      const list: CompanyMembership[] = (cu ?? []).map((row: any) => ({
        company_id: row.company_id,
        legal_name: row.companies?.legal_name ?? "Untitled company",
        is_default: !!row.is_default,
        roles: (roles ?? []).filter((r: any) => r.company_id === row.company_id).map((r: any) => r.role),
      }));
      setMemberships(list);

      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const initial = list.find((m) => m.company_id === stored)?.company_id
        ?? list.find((m) => m.is_default)?.company_id
        ?? list[0]?.company_id
        ?? null;
      setCurrentId(initial);
      setLoading(false);
    })();
  }, []);

  function setCurrent(id: string) {
    setCurrentId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }

  const current = memberships.find((m) => m.company_id === currentId) ?? null;
  function hasRole(...roles: string[]) {
    if (!current) return false;
    return current.roles.some((r) => roles.includes(r));
  }

  return { memberships, current, currentId, setCurrent, hasRole, loading };
}
