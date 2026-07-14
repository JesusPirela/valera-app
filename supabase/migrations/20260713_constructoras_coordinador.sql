-- Ampliar tabla constructoras con info de coordinador para agendar citas
ALTER TABLE public.constructoras
  ADD COLUMN IF NOT EXISTS coordinador_nombre TEXT,
  ADD COLUMN IF NOT EXISTS email             TEXT,
  ADD COLUMN IF NOT EXISTS cargo             TEXT,
  ADD COLUMN IF NOT EXISTS notas             TEXT;

SELECT pg_notify('pgrst', 'reload schema');
