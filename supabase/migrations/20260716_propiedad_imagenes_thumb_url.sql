-- Columna para guardar la URL del thumbnail pregenerado al subir la imagen.
-- Cuando existe, las vistas de lista la usan directamente (sin pasar por
-- Supabase Image Transformations), eliminando el consumo de créditos.
ALTER TABLE public.propiedad_imagenes
  ADD COLUMN IF NOT EXISTS thumb_url text;

SELECT pg_notify('pgrst','reload schema');
