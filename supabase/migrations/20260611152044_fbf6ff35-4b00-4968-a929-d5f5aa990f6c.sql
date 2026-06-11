
CREATE TABLE public.pay_on_demand_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_amount numeric(12,2) NOT NULL CHECK (requested_amount > 0),
  service_fee numeric(12,2) NOT NULL DEFAULT 0,
  total_payout numeric(12,2) NOT NULL,
  payout_method text,
  available_at_request numeric(12,2),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','paid','cancelled')),
  decline_reason text,
  notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pod_company_status ON public.pay_on_demand_requests(company_id, status);
CREATE INDEX idx_pod_employee ON public.pay_on_demand_requests(employee_id, requested_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_on_demand_requests TO authenticated;
GRANT ALL ON public.pay_on_demand_requests TO service_role;

ALTER TABLE public.pay_on_demand_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee can view own pod requests"
  ON public.pay_on_demand_requests FOR SELECT
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[])
  );

CREATE POLICY "Employee can create own pod request"
  ON public.pay_on_demand_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid() AND company_id = pay_on_demand_requests.company_id)
  );

CREATE POLICY "Employee can cancel own pending"
  ON public.pay_on_demand_requests FOR UPDATE
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (status IN ('pending','cancelled'));

CREATE POLICY "Admins manage pod requests"
  ON public.pay_on_demand_requests FOR UPDATE
  TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]));

CREATE TRIGGER trg_pod_updated_at
  BEFORE UPDATE ON public.pay_on_demand_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Notify employee on approve/decline
CREATE OR REPLACE FUNCTION public.tg_pod_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_managers(
      NEW.company_id, 'swap_requested'::notification_kind,
      'New Pay On-Demand request',
      'Amount $' || NEW.requested_amount::text,
      '/app/pay-on-demand', 'pay_on_demand_requests', NEW.id
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved','declined') THEN
    SELECT user_id INTO v_user FROM public.employees WHERE id = NEW.employee_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications(company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
      VALUES (NEW.company_id, v_user,
              CASE WHEN NEW.status='approved' THEN 'swap_approved'::notification_kind ELSE 'swap_denied'::notification_kind END,
              'Pay On-Demand ' || NEW.status,
              CASE WHEN NEW.status='declined' THEN COALESCE(NEW.decline_reason,'No reason given') ELSE 'Amount $' || NEW.requested_amount::text || ' approved' END,
              '/employee/pay-on-demand', 'pay_on_demand_requests', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pod_notify
  AFTER INSERT OR UPDATE ON public.pay_on_demand_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_pod_notify();
