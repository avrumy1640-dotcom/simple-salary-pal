CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_first      text := NEW.raw_user_meta_data->>'first_name';
  v_last       text := NEW.raw_user_meta_data->>'last_name';
  v_full       text := COALESCE(NEW.raw_user_meta_data->>'full_name',
                                 NULLIF(TRIM(CONCAT_WS(' ', v_first, v_last)), ''));
  v_company    text := NEW.raw_user_meta_data->>'company_name';
  v_acct_type  text := LOWER(NULLIF(NEW.raw_user_meta_data->>'account_type', ''));
  v_company_id uuid;
BEGIN
  IF v_acct_type NOT IN ('employer','employee') THEN
    v_acct_type := NULL;
  END IF;

  INSERT INTO public.profiles (id, full_name, first_name, last_name, company_name, account_type)
  VALUES (NEW.id, v_full, v_first, v_last, v_company, v_acct_type)
  ON CONFLICT (id) DO UPDATE
    SET full_name    = COALESCE(EXCLUDED.full_name,    public.profiles.full_name),
        first_name   = COALESCE(EXCLUDED.first_name,   public.profiles.first_name),
        last_name    = COALESCE(EXCLUDED.last_name,    public.profiles.last_name),
        company_name = COALESCE(EXCLUDED.company_name, public.profiles.company_name),
        account_type = COALESCE(public.profiles.account_type, EXCLUDED.account_type),
        updated_at   = now();

  IF v_acct_type = 'employer' THEN
    INSERT INTO public.companies (owner_id, legal_name)
    VALUES (NEW.id, COALESCE(NULLIF(v_company, ''), 'My Company'))
    RETURNING id INTO v_company_id;

    INSERT INTO public.company_users (company_id, user_id, is_default, accepted_at)
    VALUES (v_company_id, NEW.id, true, now())
    ON CONFLICT (company_id, user_id) DO UPDATE
      SET is_default = true,
          accepted_at = COALESCE(public.company_users.accepted_at, now());

    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, v_company_id, 'owner')
    ON CONFLICT (user_id, company_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $function$;