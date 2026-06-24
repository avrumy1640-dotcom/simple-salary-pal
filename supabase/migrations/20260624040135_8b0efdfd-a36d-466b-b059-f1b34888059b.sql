DROP POLICY IF EXISTS "Employees update own receipts" ON storage.objects;
CREATE POLICY "Employees update own receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING ((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
WITH CHECK ((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "hr docs read own (verified)" ON storage.objects;
CREATE POLICY "hr docs read own (verified)"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  (bucket_id = 'hr-documents'::text)
  AND EXISTS (
    SELECT 1
    FROM hr_documents d
    JOIN employees e ON e.id = d.employee_id
    WHERE d.storage_path = objects.name
      AND e.user_id = auth.uid()
  )
);