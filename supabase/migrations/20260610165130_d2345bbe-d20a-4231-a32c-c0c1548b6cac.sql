
-- Profiles: capture name + account intent
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS account_type text CHECK (account_type IN ('employer','employee'));

-- Rewrite signup handler to branch on account_type and not assume "owner"
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first      text := NEW.raw_user_meta_data->>'first_name';
  v_last       text := NEW.raw_user_meta_data->>'last_name';
  v_full       text := COALESCE(NEW.raw_user_meta_data->>'full_name',
                                 NULLIF(TRIM(CONCAT_WS(' ', v_first, v_last)), ''));
  v_company    text := NEW.raw_user_meta_data->>'company_name';
  v_acct_type  text := LOWER(COALESCE(NEW.raw_user_meta_data->>'account_type', 'employer'));
  v_company_id uuid;
BEGIN
  IF v_acct_type NOT IN ('employer','employee') THEN
    v_acct_type := 'employer';
  END IF;

  INSERT INTO public.profiles (id, full_name, first_name, last_name, company_name, account_type)
  VALUES (NEW.id, v_full, v_first, v_last, v_company, v_acct_type)
  ON CONFLICT (id) DO UPDATE
    SET full_name    = COALESCE(EXCLUDED.full_name,    public.profiles.full_name),
        first_name   = COALESCE(EXCLUDED.first_name,   public.profiles.first_name),
        last_name    = COALESCE(EXCLUDED.last_name,    public.profiles.last_name),
        company_name = COALESCE(EXCLUDED.company_name, public.profiles.company_name),
        account_type = COALESCE(public.profiles.account_type, EXCLUDED.account_type);

  IF v_acct_type = 'employer' THEN
    INSERT INTO public.companies (owner_id, legal_name)
    VALUES (NEW.id, COALESCE(v_company, 'My Company'))
    RETURNING id INTO v_company_id;

    INSERT INTO public.company_users (company_id, user_id, is_default, accepted_at)
    VALUES (v_company_id, NEW.id, true, now());

    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, v_company_id, 'owner');
  END IF;
  -- Employees: no company/role yet — an employer links them via the Users page.

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth signup if profile/company seeding fails
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

-- Allow employees to read their own profile (already covered) and update names
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
