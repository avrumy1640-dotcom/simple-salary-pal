import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EmployeeRecord {
  id: string;
  company_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  job_title: string | null;
  pay_type: string;
  pay_rate: number;
  state: string | null;
  start_date: string | null;
  address_line1: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  bank_account_type: string | null;
  bank_routing_last4: string | null;
  bank_account_last4: string | null;
  direct_deposit_enabled: boolean;
  pto_balance_hours: number;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  work_location_id: string | null;
  department_id: string | null;
}

/**
 * Resolve the employee record for the currently signed-in user by matching
 * auth email -> employees.email. Returns null if no row exists.
 */
export function useMyEmployee() {
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (alive) {
          setEmployee(null);
          setLoading(false);
        }
        return;
      }
      let { data } = await supabase.from("employees").select("*").eq("user_id", user.id).limit(1);
      if ((!data || data.length === 0) && user.email) {
        const fallback = await supabase
          .from("employees")
          .select("*")
          .ilike("email", user.email)
          .limit(1);
        data = fallback.data;
      }
      if (!alive) return;
      setEmployee((data && (data[0] as EmployeeRecord)) || null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  return { employee, loading, reload: () => setRefresh((r) => r + 1) };
}
