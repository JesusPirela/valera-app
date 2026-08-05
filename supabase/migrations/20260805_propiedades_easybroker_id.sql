-- Guarda el public_id de EasyBroker de cada propiedad publicada, para saber si
-- ya está publicada (evitar duplicados) y poder actualizar/republicar con PATCH.
ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS easybroker_id text;
