-- Add DELETE policy for homework-photos storage bucket
CREATE POLICY "Users can delete own homework photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'homework-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Add UPDATE policy for homework-photos storage bucket
CREATE POLICY "Users can update own homework photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'homework-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'homework-photos' AND (storage.foldername(name))[1] = auth.uid()::text);