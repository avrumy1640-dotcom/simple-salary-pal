
CREATE TABLE IF NOT EXISTS public.provider_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version int NOT NULL DEFAULT 1,
  last4_hint text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);
GRANT ALL ON public.provider_secrets TO service_role;
ALTER TABLE public.provider_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only service_role can access ciphertext,
-- exclusively via server functions in src/lib/provider-integrations.functions.ts.
