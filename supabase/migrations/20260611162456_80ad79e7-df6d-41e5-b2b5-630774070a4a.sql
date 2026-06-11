-- Helper: notify employee on PTO decision
CREATE OR REPLACE FUNCTION public.tg_pto_decision_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_kind notification_kind;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','denied','declined','rejected') THEN RETURN NEW; END IF;

  SELECT user_id INTO v_user_id FROM employees WHERE id = NEW.employee_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_kind := CASE WHEN NEW.status = 'approved' THEN 'pto_approved'::notification_kind ELSE 'pto_denied'::notification_kind END;

  INSERT INTO notifications (company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
  VALUES (
    NEW.company_id, v_user_id, v_kind,
    CASE WHEN NEW.status = 'approved' THEN 'Time off approved' ELSE 'Time off declined' END,
    'Your ' || NEW.pto_type || ' request for ' || NEW.start_date::text || ' – ' || NEW.end_date::text || ' (' || NEW.hours::text || ' hrs) was ' || NEW.status || '.',
    '/employee/timeoff', 'pto_entries', NEW.id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pto_decision_notify ON public.pto_entries;
CREATE TRIGGER tg_pto_decision_notify
AFTER UPDATE OF status ON public.pto_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_pto_decision_notify();

-- Expense decision notify
CREATE OR REPLACE FUNCTION public.tg_expense_decision_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_kind notification_kind;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','denied','declined','rejected','reimbursed') THEN RETURN NEW; END IF;

  SELECT user_id INTO v_user_id FROM employees WHERE id = NEW.employee_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_kind := CASE WHEN NEW.status IN ('approved','reimbursed') THEN 'expense_approved'::notification_kind ELSE 'expense_denied'::notification_kind END;

  INSERT INTO notifications (company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
  VALUES (
    NEW.company_id, v_user_id, v_kind,
    CASE WHEN NEW.status IN ('approved','reimbursed') THEN 'Expense approved' ELSE 'Expense declined' END,
    'Your ' || NEW.category || ' expense for $' || NEW.amount::text || ' was ' || NEW.status ||
      COALESCE(' — ' || NEW.decline_reason, '') || '.',
    '/employee/expenses', 'expense_requests', NEW.id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_expense_decision_notify ON public.expense_requests;
CREATE TRIGGER tg_expense_decision_notify
AFTER UPDATE OF status ON public.expense_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_expense_decision_notify();

-- General request answered notify
CREATE OR REPLACE FUNCTION public.tg_general_request_answered_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.status = OLD.status AND COALESCE(NEW.response,'') = COALESCE(OLD.response,'') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('answered','resolved','closed') THEN RETURN NEW; END IF;

  SELECT user_id INTO v_user_id FROM employees WHERE id = NEW.employee_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO notifications (company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
  VALUES (
    NEW.company_id, v_user_id, 'request_answered'::notification_kind,
    'Your request was answered',
    LEFT(COALESCE(NEW.response, 'Your "' || NEW.subject || '" request was ' || NEW.status || '.'), 280),
    '/employee/requests', 'general_requests', NEW.id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_general_request_answered_notify ON public.general_requests;
CREATE TRIGGER tg_general_request_answered_notify
AFTER UPDATE ON public.general_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_general_request_answered_notify();

-- Payroll paid notify (notify every paid employee)
CREATE OR REPLACE FUNCTION public.tg_payroll_paid_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN RETURN NEW; END IF;

  INSERT INTO notifications (company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
  SELECT
    NEW.company_id,
    e.user_id,
    'payroll_paid'::notification_kind,
    'Payday — you got paid',
    'Your paycheck of $' || pi.net_pay::text || ' for ' || NEW.period_start::text || ' – ' || NEW.period_end::text || ' is on its way for ' || NEW.pay_date::text || '.',
    '/employee/paystubs',
    'payroll_items',
    pi.id
  FROM payroll_items pi
  JOIN employees e ON e.id = pi.employee_id
  WHERE pi.run_id = NEW.id AND e.user_id IS NOT NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_payroll_paid_notify ON public.payroll_runs;
CREATE TRIGGER tg_payroll_paid_notify
AFTER UPDATE OF status ON public.payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_paid_notify();
