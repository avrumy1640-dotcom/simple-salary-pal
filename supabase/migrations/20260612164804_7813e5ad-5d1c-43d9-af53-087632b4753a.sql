
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================
-- PII SECRETS (encrypted vault)
-- =========================================================================
CREATE TYPE public.pii_kind AS ENUM (
  'ssn',
  'bank_account',
  'bank_routing',
  'tax_id',
  'drivers_license',
  'passport'
);

CREATE TABLE public.pii_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES public.contractors(id) ON DELETE CASCADE,
  dd_account_id uuid REFERENCES public.direct_deposit_accounts(id) ON DELETE CASCADE,
  kind public.pii_kind NOT NULL,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  last4_hint text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pii_subject_chk CHECK (
    (employee_id IS NOT NULL)::int +
    (contractor_id IS NOT NULL)::int +
    (dd_account_id IS NOT NULL)::int >= 1
  )
);
CREATE UNIQUE INDEX idx_pii_secrets_emp_kind ON public.pii_secrets(employee_id, kind)
  WHERE employee_id IS NOT NULL AND dd_account_id IS NULL;
CREATE UNIQUE INDEX idx_pii_secrets_dd_kind ON public.pii_secrets(dd_account_id, kind)
  WHERE dd_account_id IS NOT NULL;
CREATE INDEX idx_pii_secrets_company ON public.pii_secrets(company_id);

GRANT ALL ON public.pii_secrets TO service_role;
-- Intentionally NO authenticated grant. Access only via server fns.

ALTER TABLE public.pii_secrets ENABLE ROW LEVEL SECURITY;
-- No policies. Service role bypasses RLS; authenticated users get nothing.

CREATE TRIGGER set_updated_at_pii_secrets BEFORE UPDATE ON public.pii_secrets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- PII ACCESS LOG (append-only)
-- =========================================================================
CREATE TYPE public.pii_access_action AS ENUM ('read','write','delete','attempt_denied');

CREATE TABLE public.pii_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL,
  kind public.pii_kind NOT NULL,
  action public.pii_access_action NOT NULL,
  reason text,
  success boolean NOT NULL DEFAULT true,
  ip_address text,
  user_agent text,
  context jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pii_log_company_time ON public.pii_access_log(company_id, occurred_at DESC);
CREATE INDEX idx_pii_log_employee ON public.pii_access_log(employee_id, occurred_at DESC);
CREATE INDEX idx_pii_log_actor ON public.pii_access_log(actor_id, occurred_at DESC);

GRANT SELECT ON public.pii_access_log TO authenticated;
GRANT ALL ON public.pii_access_log TO service_role;

ALTER TABLE public.pii_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY pii_log_admin_read ON public.pii_access_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), company_id, ARRAY['owner','admin','auditor']::app_role[]));

-- Append-only enforcement
CREATE OR REPLACE FUNCTION public.tg_pii_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'pii_access_log is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_pii_log_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER pii_log_no_update BEFORE UPDATE ON public.pii_access_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_pii_log_immutable();
CREATE TRIGGER pii_log_no_delete BEFORE DELETE ON public.pii_access_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_pii_log_immutable();
