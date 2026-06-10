
-- ============ notifications ============
DO $$ BEGIN
  CREATE TYPE public.notification_kind AS ENUM (
    'swap_requested','swap_approved','swap_denied','swap_cancelled',
    'shift_published','shift_cancelled','pto_decided','generic'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL,
  title text NOT NULL,
  body text,
  link_path text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company
  ON public.notifications(company_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','hr_admin','manager']::app_role[]));
CREATE POLICY "users_update_own_notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Helper: notify all managers
CREATE OR REPLACE FUNCTION public.notify_managers(
  _company_id uuid, _kind public.notification_kind, _title text, _body text,
  _link text, _entity_type text, _entity_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
  SELECT _company_id, ur.user_id, _kind, _title, _body, _link, _entity_type, _entity_id
    FROM public.user_roles ur
   WHERE ur.company_id = _company_id
     AND ur.role = ANY (ARRAY['owner','admin','hr_admin','manager']::app_role[])
  ON CONFLICT DO NOTHING;
END $$;

-- ============ swap notifications ============
CREATE OR REPLACE FUNCTION public.tg_swap_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requester_name text; v_requester_user uuid;
  v_target_user uuid; v_target_name text;
  v_shift public.shifts%ROWTYPE;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = NEW.shift_id;
  SELECT user_id, full_name INTO v_requester_user, v_requester_name
    FROM public.employees WHERE id = NEW.requested_by_employee_id;
  IF NEW.target_employee_id IS NOT NULL THEN
    SELECT user_id, full_name INTO v_target_user, v_target_name
      FROM public.employees WHERE id = NEW.target_employee_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_managers(
      NEW.company_id, 'swap_requested',
      COALESCE(v_requester_name,'Employee') || ' requested a ' || NEW.request_type,
      'For shift on ' || to_char(COALESCE(v_shift.start_at, now()), 'Mon DD, HH24:MI'),
      '/app/scheduling', 'shift_swap_requests', NEW.id
    );
    IF NEW.request_type = 'swap' AND v_target_user IS NOT NULL THEN
      INSERT INTO public.notifications(company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
      VALUES (NEW.company_id, v_target_user, 'swap_requested',
              COALESCE(v_requester_name,'A coworker') || ' wants to swap a shift with you',
              'On ' || to_char(COALESCE(v_shift.start_at, now()), 'Mon DD, HH24:MI'),
              '/employee/schedule', 'shift_swap_requests', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved','denied','cancelled') THEN
    IF NEW.status = 'cancelled' THEN
      PERFORM public.notify_managers(
        NEW.company_id, 'swap_cancelled',
        COALESCE(v_requester_name,'Employee') || ' cancelled their swap request',
        NULL, '/app/scheduling', 'shift_swap_requests', NEW.id);
    ELSE
      -- Notify the requester
      IF v_requester_user IS NOT NULL THEN
        INSERT INTO public.notifications(company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
        VALUES (NEW.company_id, v_requester_user,
                CASE WHEN NEW.status='approved' THEN 'swap_approved'::notification_kind ELSE 'swap_denied'::notification_kind END,
                'Your ' || NEW.request_type || ' was ' || NEW.status,
                NEW.decision_notes,
                '/employee/schedule', 'shift_swap_requests', NEW.id);
      END IF;
      -- Notify the target on approved swap
      IF NEW.status='approved' AND NEW.request_type='swap' AND v_target_user IS NOT NULL THEN
        INSERT INTO public.notifications(company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
        VALUES (NEW.company_id, v_target_user, 'swap_approved',
                'You picked up a shift via swap',
                'Originally ' || COALESCE(v_requester_name,'a coworker') || '''s shift',
                '/employee/schedule', 'shift_swap_requests', NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_swap_notify ON public.shift_swap_requests;
CREATE TRIGGER tg_swap_notify
  AFTER INSERT OR UPDATE OF status ON public.shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_swap_notify();

-- ============ publish notifications ============
CREATE OR REPLACE FUNCTION public.tg_shift_publish_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS DISTINCT FROM 'published') AND NEW.employee_id IS NOT NULL THEN
    SELECT user_id INTO v_user FROM public.employees WHERE id = NEW.employee_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications(company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
      VALUES (NEW.company_id, v_user, 'shift_published',
              'New shift scheduled',
              to_char(NEW.start_at, 'Dy Mon DD, HH24:MI') || ' – ' || to_char(NEW.end_at, 'HH24:MI'),
              '/employee/schedule', 'shifts', NEW.id);
    END IF;
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'published' AND NEW.employee_id IS NOT NULL THEN
    SELECT user_id INTO v_user FROM public.employees WHERE id = NEW.employee_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications(company_id, user_id, kind, title, body, link_path, entity_type, entity_id)
      VALUES (NEW.company_id, v_user, 'shift_cancelled',
              'A scheduled shift was cancelled',
              to_char(NEW.start_at, 'Dy Mon DD, HH24:MI'),
              '/employee/schedule', 'shifts', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_shift_publish_notify ON public.shifts;
CREATE TRIGGER tg_shift_publish_notify
  AFTER UPDATE OF status ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.tg_shift_publish_notify();

-- ============ attendance report view ============
DROP VIEW IF EXISTS public.attendance_report_v;
CREATE VIEW public.attendance_report_v
WITH (security_invoker = on) AS
WITH scheduled AS (
  SELECT s.company_id, s.employee_id,
         date_trunc('week', s.start_at)::date AS week_start,
         SUM(EXTRACT(EPOCH FROM (s.end_at - s.start_at)) / 3600.0) AS scheduled_hours,
         COUNT(*) AS scheduled_shifts
    FROM public.shifts s
   WHERE s.status = 'published' AND s.employee_id IS NOT NULL
   GROUP BY s.company_id, s.employee_id, date_trunc('week', s.start_at)
),
actual AS (
  SELECT te.company_id, te.employee_id,
         date_trunc('week', te.work_date)::date AS week_start,
         SUM(COALESCE(te.hours, 0)) AS actual_hours
    FROM public.time_entries te
   GROUP BY te.company_id, te.employee_id, date_trunc('week', te.work_date)
)
SELECT
  COALESCE(s.company_id, a.company_id) AS company_id,
  COALESCE(s.employee_id, a.employee_id) AS employee_id,
  COALESCE(s.week_start, a.week_start) AS week_start,
  COALESCE(s.scheduled_hours, 0)::numeric(10,2) AS scheduled_hours,
  COALESCE(s.scheduled_shifts, 0)::integer AS scheduled_shifts,
  COALESCE(a.actual_hours, 0)::numeric(10,2) AS actual_hours,
  (COALESCE(a.actual_hours, 0) - COALESCE(s.scheduled_hours, 0))::numeric(10,2) AS variance_hours
FROM scheduled s
FULL OUTER JOIN actual a
  ON s.company_id = a.company_id AND s.employee_id = a.employee_id AND s.week_start = a.week_start;

GRANT SELECT ON public.attendance_report_v TO authenticated;
