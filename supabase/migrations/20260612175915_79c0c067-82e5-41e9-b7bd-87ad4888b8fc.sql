
-- Fix storage policy: expense-receipts missing UPDATE policy
CREATE POLICY "Employees update own receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = (auth.uid())::text)
WITH CHECK (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- Fix HR docs path-guess bypass: drop broad foldername policy, replace with
-- a policy that verifies the caller is the assigned employee on the hr_documents row,
-- OR an authorized admin (covered by existing 'hr-documents admins read').
DROP POLICY IF EXISTS "hr docs read own" ON storage.objects;

CREATE POLICY "hr docs read own (verified)"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'hr-documents'
  AND EXISTS (
    SELECT 1
    FROM public.hr_documents d
    JOIN public.employees e ON e.id = d.employee_id
    WHERE d.storage_path = storage.objects.name
      AND e.user_id = auth.uid()
  )
);
