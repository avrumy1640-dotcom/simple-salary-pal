
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url text;

DROP POLICY IF EXISTS "company_logos_member_read" ON storage.objects;
CREATE POLICY "company_logos_member_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "company_logos_admin_insert" ON storage.objects;
CREATE POLICY "company_logos_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND public.has_any_role(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid,
      ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]
    )
  );

DROP POLICY IF EXISTS "company_logos_admin_update" ON storage.objects;
CREATE POLICY "company_logos_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND public.has_any_role(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid,
      ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]
    )
  );

DROP POLICY IF EXISTS "company_logos_admin_delete" ON storage.objects;
CREATE POLICY "company_logos_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND public.has_any_role(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid,
      ARRAY['owner','admin','hr_admin','payroll_admin']::app_role[]
    )
  );
