
-- Tighten self-update policies to prevent status tampering / privilege escalation

-- expense_requests: only allow employee to cancel their own pending request
DROP POLICY IF EXISTS "Employee cancel own pending expenses" ON public.expense_requests;
CREATE POLICY "Employee cancel own pending expenses"
  ON public.expense_requests FOR UPDATE
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status = 'cancelled'
  );

-- general_requests: only allow employee to cancel/close their own open request
DROP POLICY IF EXISTS "Employee cancel own open requests" ON public.general_requests;
CREATE POLICY "Employee cancel own open requests"
  ON public.general_requests FOR UPDATE
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status = 'open'
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status IN ('cancelled','closed')
  );

-- pto_entries: employee may keep pending or cancel; never self-approve
DROP POLICY IF EXISTS pto_self_update_pending ON public.pto_entries;
CREATE POLICY pto_self_update_pending
  ON public.pto_entries FOR UPDATE
  USING (
    employee_id = public.current_employee_id(company_id)
    AND status = 'pending'
  )
  WITH CHECK (
    employee_id = public.current_employee_id(company_id)
    AND status IN ('pending','cancelled')
  );

-- shift_swap_requests: requester may only cancel their own pending swap
DROP POLICY IF EXISTS employee_cancel_own_swaps ON public.shift_swap_requests;
CREATE POLICY employee_cancel_own_swaps
  ON public.shift_swap_requests FOR UPDATE
  USING (
    requested_by_employee_id = public.current_employee_id(company_id)
    AND status = 'pending'::swap_request_status
  )
  WITH CHECK (
    requested_by_employee_id = public.current_employee_id(company_id)
    AND status = 'cancelled'::swap_request_status
  );

-- onboarding_tasks: employees may only toggle completion fields on their own tasks
CREATE OR REPLACE FUNCTION public.tg_onboarding_tasks_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_self boolean := (OLD.employee_id IS NOT NULL
                        AND OLD.employee_id = public.current_employee_id(OLD.company_id));
  v_is_admin boolean;
BEGIN
  IF NOT v_is_self THEN
    RETURN NEW;
  END IF;
  v_is_admin := public.has_any_role(
    auth.uid(), OLD.company_id,
    ARRAY['owner','admin','hr_admin','manager','supervisor']::app_role[]
  );
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Employees can only modify status and completed_at on their own tasks
  IF NEW.title            IS DISTINCT FROM OLD.title
     OR NEW.description   IS DISTINCT FROM OLD.description
     OR NEW.category      IS DISTINCT FROM OLD.category
     OR NEW.required      IS DISTINCT FROM OLD.required
     OR NEW.due_date      IS DISTINCT FROM OLD.due_date
     OR NEW.sort_order    IS DISTINCT FROM OLD.sort_order
     OR NEW.company_id    IS DISTINCT FROM OLD.company_id
     OR NEW.owner_id      IS DISTINCT FROM OLD.owner_id
     OR NEW.employee_id   IS DISTINCT FROM OLD.employee_id
     OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id
     OR NEW.template_id   IS DISTINCT FROM OLD.template_id
     OR NEW.template_task_id IS DISTINCT FROM OLD.template_task_id
     OR NEW.assignee_user_id IS DISTINCT FROM OLD.assignee_user_id
  THEN
    RAISE EXCEPTION 'Employees may only update completion status on their own onboarding tasks'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Restrict status values employees can set
  IF NEW.status NOT IN ('pending','in_progress','completed','skipped') THEN
    RAISE EXCEPTION 'Invalid status for employee self-update on onboarding task'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_onboarding_tasks_self_update_guard ON public.onboarding_tasks;
CREATE TRIGGER tg_onboarding_tasks_self_update_guard
  BEFORE UPDATE ON public.onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_onboarding_tasks_self_update_guard();
