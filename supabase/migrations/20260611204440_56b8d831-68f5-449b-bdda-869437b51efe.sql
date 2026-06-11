-- Lock down audit_events inserts to server-side triggers only.
DROP POLICY IF EXISTS members_insert_audit ON public.audit_events;
CREATE POLICY audit_events_no_client_insert ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- Allow employees to read their own bank connections.
CREATE POLICY bank_connections_self_select ON public.bank_connections
  FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id(company_id));
