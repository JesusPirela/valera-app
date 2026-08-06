-- Permitir indicar para qué propiedad es la cita. Además de propiedad_id (una
-- propiedad de la app), se agrega propiedad_externa para cuando la propiedad NO
-- está en la app: un link o una descripción escrita a mano.
ALTER TABLE public.citas_coordinacion
  ADD COLUMN IF NOT EXISTS propiedad_externa text;
