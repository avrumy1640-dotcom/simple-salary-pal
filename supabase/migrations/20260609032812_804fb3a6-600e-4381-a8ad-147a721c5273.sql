
CREATE POLICY "hr docs read own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hr-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "hr docs insert own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hr-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "hr docs update own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'hr-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "hr docs delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'hr-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
