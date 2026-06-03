-- Columna para guardar el token de push notifications por usuario
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Política para que cada usuario pueda actualizar su propio push_token
DROP POLICY IF EXISTS "profiles_update_own_push_token" ON public.profiles;
CREATE POLICY "profiles_update_own_push_token" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
