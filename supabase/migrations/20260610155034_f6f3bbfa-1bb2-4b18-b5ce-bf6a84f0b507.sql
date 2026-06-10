
-- ============== PHASE 5: ONBOARDING ==============

ALTER TABLE public.onboarding_tasks
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.onboarding_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_task_id uuid REFERENCES public.onboarding_template_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.onboarding_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES public.contractors(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'in_progress',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR contractor_id IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_assignments TO authenticated;
GRANT ALL ON public.onboarding_assignments TO service_role;
ALTER TABLE public.onboarding_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onb_assign_admin_manage" ON public.onboarding_assignments
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));
CREATE POLICY "onb_assign_self_view" ON public.onboarding_assignments
  FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

CREATE TRIGGER trg_onb_assignments_updated BEFORE UPDATE ON public.onboarding_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Server-side function to assign a template (idempotent per (assignment, template_task))
CREATE OR REPLACE FUNCTION public.assign_onboarding_template(
  _company_id uuid, _template_id uuid,
  _employee_id uuid, _contractor_id uuid,
  _start_date date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_assignment_id uuid; v_owner uuid; r record;
BEGIN
  IF NOT public.has_any_role(auth.uid(), _company_id, ARRAY['owner','admin','hr_admin']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT owner_id INTO v_owner FROM public.companies WHERE id = _company_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'company not found'; END IF;

  INSERT INTO public.onboarding_assignments(company_id, template_id, employee_id, contractor_id, assigned_by, start_date)
  VALUES (_company_id, _template_id, _employee_id, _contractor_id, auth.uid(), _start_date)
  RETURNING id INTO v_assignment_id;

  FOR r IN SELECT * FROM public.onboarding_template_tasks WHERE template_id = _template_id ORDER BY sort_order
  LOOP
    INSERT INTO public.onboarding_tasks(
      owner_id, company_id, employee_id, contractor_id, title, description, category,
      required, sort_order, status, template_id, template_task_id, due_date
    )
    VALUES (
      v_owner, _company_id, _employee_id, _contractor_id, r.title, r.description, COALESCE(r.category,'general'),
      r.is_required, r.sort_order, 'pending', _template_id, r.id,
      _start_date + (r.day_offset || ' days')::interval
    );
  END LOOP;
  RETURN v_assignment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.assign_onboarding_template(uuid,uuid,uuid,uuid,date) TO authenticated;

-- ============== PHASE 5: DOCUMENT SIGNATURES ==============

-- Fix overly-narrow RLS on hr_document_signatures
DROP POLICY IF EXISTS "Owners manage their signature history" ON public.hr_document_signatures;

ALTER TABLE public.hr_document_signatures
  ADD COLUMN IF NOT EXISTS consent_text text,
  ADD COLUMN IF NOT EXISTS signature_hash text;

-- Backfill company_id from documents where missing
UPDATE public.hr_document_signatures s
   SET company_id = d.company_id
  FROM public.hr_documents d
 WHERE s.document_id = d.id AND s.company_id IS NULL;

ALTER TABLE public.hr_document_signatures
  ALTER COLUMN company_id SET NOT NULL;

-- Trigger: stamp company_id from document on insert; verify signer is owner of document or admin
CREATE OR REPLACE FUNCTION public.tg_hr_doc_sig_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc_company uuid; v_doc_employee uuid; v_emp uuid;
BEGIN
  SELECT company_id, employee_id INTO v_doc_company, v_doc_employee
    FROM public.hr_documents WHERE id = NEW.document_id;
  IF v_doc_company IS NULL THEN RAISE EXCEPTION 'document not found'; END IF;
  NEW.company_id := v_doc_company;
  -- If signer claims to be the employee, verify
  IF NEW.signed_by_user_id IS NOT NULL AND v_doc_employee IS NOT NULL THEN
    SELECT user_id INTO v_emp FROM public.employees WHERE id = v_doc_employee;
    IF v_emp IS DISTINCT FROM NEW.signed_by_user_id
       AND NOT public.has_any_role(auth.uid(), v_doc_company, ARRAY['owner','admin','hr_admin']::app_role[]) THEN
      RAISE EXCEPTION 'signer mismatch';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_doc_sig_validate ON public.hr_document_signatures;
CREATE TRIGGER trg_hr_doc_sig_validate BEFORE INSERT OR UPDATE ON public.hr_document_signatures
  FOR EACH ROW EXECUTE FUNCTION public.tg_hr_doc_sig_validate();

CREATE POLICY "hrdocsig_admin_manage" ON public.hr_document_signatures
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin']::app_role[]));

CREATE POLICY "hrdocsig_member_view" ON public.hr_document_signatures
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "hrdocsig_self_insert" ON public.hr_document_signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.hr_documents d
       JOIN public.employees e ON e.id = d.employee_id
       WHERE d.id = document_id AND e.user_id = auth.uid()
    )
  );

-- ============== PHASE 5: COMPLIANCE ALERT GENERATOR ==============

CREATE OR REPLACE FUNCTION public.generate_compliance_alerts(_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0; r record;
BEGIN
  IF NOT public.has_any_role(auth.uid(), _company_id, ARRAY['owner','admin','hr_admin','auditor']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- I-9 missing past 3 days from start_date
  FOR r IN
    SELECT e.id, e.full_name, e.start_date
      FROM public.employees e
     WHERE e.company_id = _company_id
       AND e.lifecycle_status IN ('onboarding','active')
       AND e.start_date IS NOT NULL
       AND e.start_date <= CURRENT_DATE - INTERVAL '3 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_forms f
          WHERE f.employee_id = e.id AND f.form_type = 'i9' AND f.status = 'signed'
       )
  LOOP
    INSERT INTO public.compliance_alerts(company_id, employee_id, alert_type, severity, status, title, description, due_date)
    SELECT _company_id, r.id, 'i9_overdue', 'high', 'open',
           'I-9 overdue for ' || r.full_name,
           'Form I-9 was due within 3 business days of start date (' || r.start_date || ').',
           r.start_date + 3
     WHERE NOT EXISTS (
       SELECT 1 FROM public.compliance_alerts a
        WHERE a.company_id = _company_id AND a.employee_id = r.id
          AND a.alert_type = 'i9_overdue' AND a.status = 'open'
     );
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END LOOP;

  -- W-4 missing
  FOR r IN
    SELECT e.id, e.full_name FROM public.employees e
     WHERE e.company_id = _company_id AND e.lifecycle_status IN ('onboarding','active')
       AND NOT EXISTS (SELECT 1 FROM public.hr_forms f WHERE f.employee_id = e.id AND f.form_type='w4' AND f.status='signed')
  LOOP
    INSERT INTO public.compliance_alerts(company_id, employee_id, alert_type, severity, status, title, description)
    SELECT _company_id, r.id, 'w4_missing', 'medium', 'open',
           'W-4 missing for ' || r.full_name,
           'No signed federal W-4 on file. Default withholding will apply.'
     WHERE NOT EXISTS (
       SELECT 1 FROM public.compliance_alerts a
        WHERE a.company_id = _company_id AND a.employee_id = r.id
          AND a.alert_type = 'w4_missing' AND a.status = 'open'
     );
  END LOOP;

  -- Missing direct deposit for active employee
  FOR r IN
    SELECT e.id, e.full_name FROM public.employees e
     WHERE e.company_id = _company_id AND e.lifecycle_status='active'
       AND COALESCE(e.direct_deposit_enabled,false) = false
  LOOP
    INSERT INTO public.compliance_alerts(company_id, employee_id, alert_type, severity, status, title, description)
    SELECT _company_id, r.id, 'direct_deposit_missing', 'low', 'open',
           'Direct deposit not set up for ' || r.full_name,
           'Employee will receive a paper check until banking details are added.'
     WHERE NOT EXISTS (
       SELECT 1 FROM public.compliance_alerts a
        WHERE a.company_id = _company_id AND a.employee_id = r.id
          AND a.alert_type = 'direct_deposit_missing' AND a.status='open'
     );
  END LOOP;

  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_compliance_alerts(uuid) TO authenticated;

-- Add missing enum values if not present
DO $$ BEGIN
  ALTER TYPE compliance_alert_type ADD VALUE IF NOT EXISTS 'i9_overdue';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE compliance_alert_type ADD VALUE IF NOT EXISTS 'w4_missing';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE compliance_alert_type ADD VALUE IF NOT EXISTS 'direct_deposit_missing';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============== PHASE 6: BENEFITS ↔ DEDUCTIONS ==============

ALTER TABLE public.deductions
  ADD COLUMN IF NOT EXISTS enrollment_id uuid REFERENCES public.benefit_enrollments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS uq_deductions_per_enrollment
  ON public.deductions(enrollment_id) WHERE enrollment_id IS NOT NULL;

-- Election event log (ESIGN/UETA record)
CREATE TABLE IF NOT EXISTS public.benefit_election_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.benefit_enrollments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  plan_id uuid REFERENCES public.benefit_plans(id),
  coverage_tier benefit_coverage_tier,
  employee_monthly_cost numeric(12,2),
  employer_monthly_cost numeric(12,2),
  signed_name text,
  signed_ip text,
  signed_user_agent text,
  consent_text text,
  qualifying_event text,
  effective_date date,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.benefit_election_events TO authenticated;
GRANT ALL ON public.benefit_election_events TO service_role;
ALTER TABLE public.benefit_election_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ben_elect_admin_manage" ON public.benefit_election_events
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','benefits_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','benefits_admin']::app_role[]));

CREATE POLICY "ben_elect_self_view" ON public.benefit_election_events
  FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));

-- Trigger: sync enrollment status → deduction lifecycle
CREATE OR REPLACE FUNCTION public.tg_benefit_enrollment_sync_deduction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid; v_periods_per_year integer := 24; v_per_period numeric(12,2);
  v_plan_name text; v_plan_type text;
BEGIN
  SELECT owner_id INTO v_owner FROM public.companies WHERE id = NEW.company_id;
  SELECT periods_per_year INTO v_periods_per_year
    FROM public.pay_schedules WHERE company_id = NEW.company_id
    ORDER BY created_at LIMIT 1;
  IF v_periods_per_year IS NULL OR v_periods_per_year = 0 THEN v_periods_per_year := 24; END IF;

  SELECT name, plan_type::text INTO v_plan_name, v_plan_type
    FROM public.benefit_plans WHERE id = NEW.plan_id;

  -- Active enrollment → create/update deduction
  IF NEW.status = 'active' THEN
    v_per_period := ROUND((COALESCE(NEW.employee_monthly_cost,0) * 12.0 / v_periods_per_year)::numeric, 2);
    INSERT INTO public.deductions(
      owner_id, company_id, employee_id, name, category, pre_tax, amount, amount_type, active, enrollment_id, source
    ) VALUES (
      v_owner, NEW.company_id, NEW.employee_id,
      COALESCE(v_plan_name,'Benefit') || ' (' || COALESCE(v_plan_type,'plan') || ')',
      COALESCE(v_plan_type,'other'),
      v_plan_type IN ('medical','dental','vision','hsa','fsa','retirement_401k'),
      v_per_period, 'fixed', true, NEW.id, 'benefit_enrollment'
    )
    ON CONFLICT (enrollment_id) WHERE enrollment_id IS NOT NULL
    DO UPDATE SET amount = EXCLUDED.amount, active = true, updated_at = now();
  ELSIF NEW.status IN ('terminated','waived','cancelled') THEN
    UPDATE public.deductions SET active = false, updated_at = now()
     WHERE enrollment_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_benefit_enrollment_sync_deduction ON public.benefit_enrollments;
CREATE TRIGGER trg_benefit_enrollment_sync_deduction
  AFTER INSERT OR UPDATE OF status, employee_monthly_cost ON public.benefit_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.tg_benefit_enrollment_sync_deduction();

-- Self-enrollment policy: employees may insert/update their OWN benefit_enrollments
-- only when an open_enrollment_window is active OR within 30 days of hire.
CREATE OR REPLACE FUNCTION public.employee_can_self_enroll(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = _employee_id AND e.user_id = auth.uid()
       AND (
         e.start_date IS NOT NULL AND e.start_date >= CURRENT_DATE - INTERVAL '30 days'
         OR EXISTS (
           SELECT 1 FROM public.open_enrollment_windows w
            WHERE w.company_id = e.company_id AND w.is_active
              AND now() BETWEEN w.starts_at AND w.ends_at
         )
       )
  );
$$;
GRANT EXECUTE ON FUNCTION public.employee_can_self_enroll(uuid) TO authenticated;

CREATE POLICY "ben_enroll_self_propose" ON public.benefit_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.current_employee_id(company_id)
    AND status = 'pending'
    AND public.employee_can_self_enroll(employee_id)
  );

CREATE POLICY "ben_enroll_self_update_pending" ON public.benefit_enrollments
  FOR UPDATE TO authenticated
  USING (employee_id = public.current_employee_id(company_id) AND status = 'pending')
  WITH CHECK (employee_id = public.current_employee_id(company_id) AND status = 'pending');
