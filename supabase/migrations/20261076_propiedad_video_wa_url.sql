-- Copia ligera (<=16MB) del video de recorrido para mandar por WhatsApp.
-- La sube el script supabase/scripts/convertir-videos-wa.ts; no se toca
-- propiedades.video_url ni la app.
ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS video_wa_url TEXT;

SELECT pg_notify('pgrst', 'reload schema');
