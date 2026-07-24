-- Traducción de fichas al inglés (opcional).
--
-- La ficha (PDF y link) puede mostrarse en inglés. Las etiquetas fijas se
-- traducen en la app; aquí se guarda SOLO el texto libre traducido —título y
-- descripción— para no volver a pedírselo a DeepL en cada vista del link.
--
-- Cada ficha se traduce UNA vez y se reusa. Si luego editan el título o la
-- descripción, el trigger de abajo borra la traducción vieja para que se
-- vuelva a generar la próxima vez que alguien pida la versión en inglés.

ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS titulo_en      text,
  ADD COLUMN IF NOT EXISTS descripcion_en text,
  -- Se guarda el ORIGEN exacto que se tradujo; si el texto actual difiere,
  -- sabemos que la traducción quedó obsoleta.
  ADD COLUMN IF NOT EXISTS titulo_en_src      text,
  ADD COLUMN IF NOT EXISTS descripcion_en_src text,
  ADD COLUMN IF NOT EXISTS traducido_at   timestamptz;

-- Invalida la traducción cuando cambia el texto de origen.
CREATE OR REPLACE FUNCTION public.invalidar_traduccion_ficha()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.titulo IS DISTINCT FROM OLD.titulo THEN
    NEW.titulo_en := NULL;
    NEW.titulo_en_src := NULL;
  END IF;
  IF NEW.descripcion IS DISTINCT FROM OLD.descripcion THEN
    NEW.descripcion_en := NULL;
    NEW.descripcion_en_src := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_invalidar_traduccion ON public.propiedades;
CREATE TRIGGER tr_invalidar_traduccion
  BEFORE UPDATE OF titulo, descripcion ON public.propiedades
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidar_traduccion_ficha();
