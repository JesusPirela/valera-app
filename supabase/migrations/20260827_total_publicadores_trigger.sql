-- Agrega total_publicadores a propiedades y lo mantiene sincronizado con un trigger.
-- Antes se calculaba en el cliente con una RPC separada y un Map de React,
-- lo que causaba que los badges leyeran 0 por problemas de timing/estado.
-- Con esto la columna llega directamente en la query de propiedades.

-- 1. Columna
ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS total_publicadores INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill con datos actuales
UPDATE public.propiedades p
SET total_publicadores = COALESCE((
  SELECT COUNT(DISTINCT pp.user_id)::integer
  FROM public.propiedad_publicacion pp
  WHERE pp.propiedad_id = p.id
    AND pp.veces_publicada > 0
), 0);

-- 3. Función del trigger
CREATE OR REPLACE FUNCTION public.sync_total_publicadores()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(NEW.propiedad_id, OLD.propiedad_id);
  UPDATE public.propiedades
  SET total_publicadores = (
    SELECT COUNT(DISTINCT user_id)::integer
    FROM public.propiedad_publicacion
    WHERE propiedad_id = pid
      AND veces_publicada > 0
  )
  WHERE id = pid;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Trigger en propiedad_publicacion
DROP TRIGGER IF EXISTS trg_sync_total_publicadores ON public.propiedad_publicacion;
CREATE TRIGGER trg_sync_total_publicadores
  AFTER INSERT OR UPDATE OR DELETE ON public.propiedad_publicacion
  FOR EACH ROW EXECUTE FUNCTION public.sync_total_publicadores();
