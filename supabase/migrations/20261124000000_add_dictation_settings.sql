-- Add dictation preferences without changing the existing profiles schema.
CREATE TABLE IF NOT EXISTS public.dictation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  dictation_language TEXT NOT NULL DEFAULT 'cantonese',
  voice_name TEXT,
  speed NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dictation_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dictation_settings' AND policyname = 'Users can view own dictation settings') THEN
    CREATE POLICY "Users can view own dictation settings"
      ON public.dictation_settings FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dictation_settings' AND policyname = 'Users can insert own dictation settings') THEN
    CREATE POLICY "Users can insert own dictation settings"
      ON public.dictation_settings FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dictation_settings' AND policyname = 'Users can update own dictation settings') THEN
    CREATE POLICY "Users can update own dictation settings"
      ON public.dictation_settings FOR UPDATE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_dictation_settings_updated_at') THEN
    CREATE TRIGGER update_dictation_settings_updated_at
      BEFORE UPDATE ON public.dictation_settings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

-- Preserve the homework profile/role behavior and add dictation defaults.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data ->> 'role')::public.app_role, 'student'));

  INSERT INTO public.dictation_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Backfill preferences for users who existed before this migration.
INSERT INTO public.dictation_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
