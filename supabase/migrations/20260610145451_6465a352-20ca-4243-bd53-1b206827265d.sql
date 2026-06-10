
-- =========================================================
-- PHASE 1: Multi-tenant security & tenant isolation hardening
-- =========================================================

-- ---------- 1. Add employees.user_id for self-service RLS ----------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);

-- Backfill user_id from auth.users by email match (case-insensitive)
UPDATE public.employees e
SET user_id = u.id
FROM auth.users u
WHERE e.user_id IS NULL
  AND e.email IS NOT NULL
  AND lower(e.email) = lower(u.email);

-- ---------- 2. Backfill company_id on legacy tables ----------
-- Tables where owner_id = company owner: derive company_id from companies.owner_id
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'employees','payroll_runs','payroll_items','deductions',
    'pto_entries','time_entries','hr_documents','hr_forms',
    'onboarding_tasks','contractors','contractor_payments','company_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format($f$
      UPDATE public.%I tgt
      SET company_id = c.id
      FROM public.companies c
      WHERE tgt.company_id IS NULL
        AND c.owner_id = tgt.owner_id
    $f$, t);
  END LOOP;
END $$;

-- bank_connections, time_clock_punches, field_visits: derive via employee
UPDATE public.bank_connections bc
SET company_id = e.company_id
FROM public.employees e
WHERE bc.company_id IS NULL AND bc.employee_id = e.id;

UPDATE public.time_clock_punches p
SET company_id = e.company_id
FROM public.employees e
WHERE p.company_id IS NULL AND p.employee_id = e.id;

UPDATE public.field_visits fv
SET company_id = e.company_id
FROM public.employees e
WHERE fv.company_id IS NULL AND fv.employee_id = e.id;

-- Fallback: any remaining NULLs → the first company owned by owner_id/user_id
UPDATE public.bank_connections bc
SET company_id = (SELECT id FROM public.companies WHERE owner_id = bc.owner_id LIMIT 1)
WHERE bc.company_id IS NULL AND bc.owner_id IS NOT NULL;

UPDATE public.field_visits fv
SET company_id = (SELECT id FROM public.companies WHERE owner_id = fv.user_id LIMIT 1)
WHERE fv.company_id IS NULL AND fv.user_id IS NOT NULL;

UPDATE public.time_clock_punches p
SET company_id = (SELECT id FROM public.companies WHERE owner_id = p.user_id LIMIT 1)
WHERE p.company_id IS NULL AND p.user_id IS NOT NULL;

-- ---------- 3. Helper: current employee id within a company ----------
CREATE OR REPLACE FUNCTION public.current_employee_id(_company_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.employees
  WHERE company_id = _company_id AND user_id = auth.uid()
  LIMIT 1
$$;

-- ---------- 4. Replace legacy owner_id-based policies ----------

-- employees
DROP POLICY IF EXISTS "own employees" ON public.employees;
CREATE POLICY "employees_admin_manage" ON public.employees FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));
CREATE POLICY "employees_manager_view" ON public.employees FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), company_id, 'manager'::app_role));
CREATE POLICY "employees_self_view" ON public.employees FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "employees_self_update_limited" ON public.employees FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- payroll_runs
DROP POLICY IF EXISTS "own runs" ON public.payroll_runs;
CREATE POLICY "payroll_runs_admin_manage" ON public.payroll_runs FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]));
CREATE POLICY "payroll_runs_member_view" ON public.payroll_runs FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- payroll_items (pay stubs)
DROP POLICY IF EXISTS "own items" ON public.payroll_items;
CREATE POLICY "payroll_items_admin_manage" ON public.payroll_items FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]));
CREATE POLICY "payroll_items_self_view" ON public.payroll_items FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

-- deductions
DROP POLICY IF EXISTS "own deductions" ON public.deductions;
CREATE POLICY "deductions_admin_manage" ON public.deductions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','hr_admin']::app_role[]));
CREATE POLICY "deductions_self_view" ON public.deductions FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

-- pto_entries
DROP POLICY IF EXISTS "own pto" ON public.pto_entries;
CREATE POLICY "pto_admin_manage" ON public.pto_entries FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY "pto_self_view" ON public.pto_entries FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));
CREATE POLICY "pto_self_insert" ON public.pto_entries FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id(company_id));
CREATE POLICY "pto_self_update_pending" ON public.pto_entries FOR UPDATE TO authenticated
  USING (employee_id = public.current_employee_id(company_id) AND status = 'pending')
  WITH CHECK (employee_id = public.current_employee_id(company_id));

-- time_entries
DROP POLICY IF EXISTS "own time" ON public.time_entries;
CREATE POLICY "time_entries_admin_manage" ON public.time_entries FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','manager']::app_role[]));
CREATE POLICY "time_entries_self_view" ON public.time_entries FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));
CREATE POLICY "time_entries_self_insert" ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id(company_id));

-- time_clock_punches
DROP POLICY IF EXISTS "Owners manage their punches" ON public.time_clock_punches;
CREATE POLICY "punches_admin_view" ON public.time_clock_punches FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin','manager']::app_role[]));
CREATE POLICY "punches_self_manage" ON public.time_clock_punches FOR ALL TO authenticated
  USING (user_id = auth.uid() AND employee_id = public.current_employee_id(company_id))
  WITH CHECK (user_id = auth.uid() AND employee_id = public.current_employee_id(company_id));

-- field_visits
DROP POLICY IF EXISTS "Owners manage their field visits" ON public.field_visits;
CREATE POLICY "field_visits_admin_view" ON public.field_visits FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY "field_visits_self_manage" ON public.field_visits FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id));

-- hr_documents
DROP POLICY IF EXISTS "owners manage hr documents" ON public.hr_documents;
CREATE POLICY "hr_documents_admin_manage" ON public.hr_documents FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));
CREATE POLICY "hr_documents_self_view" ON public.hr_documents FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

-- hr_forms
DROP POLICY IF EXISTS "owners manage hr forms" ON public.hr_forms;
CREATE POLICY "hr_forms_admin_manage" ON public.hr_forms FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));
CREATE POLICY "hr_forms_self_view" ON public.hr_forms FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

-- onboarding_tasks
DROP POLICY IF EXISTS "owners manage onboarding tasks" ON public.onboarding_tasks;
CREATE POLICY "onboarding_tasks_admin_manage" ON public.onboarding_tasks FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));
CREATE POLICY "onboarding_tasks_self_view" ON public.onboarding_tasks FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));
CREATE POLICY "onboarding_tasks_self_complete" ON public.onboarding_tasks FOR UPDATE TO authenticated
  USING (employee_id = public.current_employee_id(company_id))
  WITH CHECK (employee_id = public.current_employee_id(company_id));

-- contractors
DROP POLICY IF EXISTS "owners manage contractors" ON public.contractors;
CREATE POLICY "contractors_admin_manage" ON public.contractors FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin','hr_admin']::app_role[]));

-- contractor_payments
DROP POLICY IF EXISTS "owners manage contractor payments" ON public.contractor_payments;
CREATE POLICY "contractor_payments_admin_manage" ON public.contractor_payments FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]));

-- bank_connections
DROP POLICY IF EXISTS "owners manage bank connections" ON public.bank_connections;
CREATE POLICY "bank_connections_admin_view" ON public.bank_connections FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]));
CREATE POLICY "bank_connections_admin_manage" ON public.bank_connections FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','payroll_admin']::app_role[]));
CREATE POLICY "bank_connections_self_manage" ON public.bank_connections FOR ALL TO authenticated
  USING (employee_id = public.current_employee_id(company_id))
  WITH CHECK (employee_id = public.current_employee_id(company_id));

-- company_settings
DROP POLICY IF EXISTS "own settings" ON public.company_settings;
CREATE POLICY "company_settings_admin_manage" ON public.company_settings FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin']::app_role[]));
CREATE POLICY "company_settings_member_view" ON public.company_settings FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- ---------- 5. Tighten company_id NOT NULL on critical tables ----------
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'employees','payroll_runs','payroll_items','deductions',
    'pto_entries','time_entries','hr_documents','hr_forms',
    'onboarding_tasks','contractors','contractor_payments',
    'company_settings','bank_connections','time_clock_punches','field_visits'
  ];
  null_count int;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id IS NULL', t) INTO null_count;
    IF null_count = 0 THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;

-- ---------- 6. Generic audit trigger ----------
CREATE OR REPLACE FUNCTION public.tg_audit_row()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_entity_id  uuid;
  v_before     jsonb;
  v_after      jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_company_id := (to_jsonb(OLD) ->> 'company_id')::uuid;
    v_entity_id  := (to_jsonb(OLD) ->> 'id')::uuid;
    v_before := to_jsonb(OLD);
    v_after := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_company_id := (to_jsonb(NEW) ->> 'company_id')::uuid;
    v_entity_id  := (to_jsonb(NEW) ->> 'id')::uuid;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSE
    v_company_id := (to_jsonb(NEW) ->> 'company_id')::uuid;
    v_entity_id  := (to_jsonb(NEW) ->> 'id')::uuid;
    v_before := NULL;
    v_after := to_jsonb(NEW);
  END IF;

  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.audit_events(company_id, actor_id, action, entity_type, entity_id, before, after)
    VALUES (
      v_company_id,
      auth.uid(),
      (lower(TG_OP))::audit_action,
      TG_TABLE_NAME,
      v_entity_id,
      v_before,
      v_after
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
EXCEPTION WHEN OTHERS THEN
  -- never block the underlying operation if audit insert fails
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Apply audit triggers to high-sensitivity tables
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'employees','payroll_runs','payroll_items',
    'user_roles','company_users','deductions',
    'garnishments','tax_records','bank_connections'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row()', t);
  END LOOP;
END $$;

-- ---------- 7. Make sure GRANTs are intact ----------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
