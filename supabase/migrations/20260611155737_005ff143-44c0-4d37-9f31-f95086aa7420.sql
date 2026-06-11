
-- Restrict notifications SELECT to the recipient only (notifications are personal)
DROP POLICY IF EXISTS users_read_own_notifications ON public.notifications;
CREATE POLICY users_read_own_notifications ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- Restrict hr-documents bucket uploads to HR/admin/owner roles
DROP POLICY IF EXISTS "hr docs insert own" ON storage.objects;
CREATE POLICY "hr docs insert admins only" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hr-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role])
    )
  );

-- Also restrict update/delete on hr-documents to admins (employees should not mutate their own HR docs)
DROP POLICY IF EXISTS "hr docs update own" ON storage.objects;
CREATE POLICY "hr docs update admins only" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hr-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['owner'::app_role,'admin'::app_role,'hr_admin'::app_role])
    )
  );
