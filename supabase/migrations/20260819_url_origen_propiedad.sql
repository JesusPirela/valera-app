-- Guardar el link de dónde se importó cada propiedad, para saber la fuente.
ALTER TABLE public.propiedades ADD COLUMN IF NOT EXISTS url_origen text;
COMMENT ON COLUMN public.propiedades.url_origen IS 'URL del anuncio/página de donde se importó la propiedad (si se importó con "Importar URL").';
