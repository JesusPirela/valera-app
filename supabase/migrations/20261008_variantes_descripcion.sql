-- Facebook Marketplace rechaza publicaciones duplicadas, y medido: la misma
-- propiedad la publican 8.3 personas en promedio (máximo 58), y el 94% de las
-- veces pegando la MISMA descripción guardada (17,317 descargas de fotos
-- contra solo 1,014 generaciones con IA). El texto no es malo: es uno solo
-- compartido por todos.
--
-- No se puede llamar a la IA en cada copia (cuotas gratis, tope de 5/día,
-- tarda segundos y puede fallar). En su lugar: se generan VARIAS versiones por
-- propiedad de antemano, en lote, y al copiar cada persona recibe una distinta.
-- Instantáneo, gratis y sin tope, porque ya no hay llamada a ninguna IA.
--
-- La propiedades.descripcion original NO se toca: sigue siendo la fuente de
-- los datos y el respaldo si una propiedad aún no tiene variantes.

CREATE TABLE IF NOT EXISTS public.propiedad_descripcion_variantes (
  id           bigserial PRIMARY KEY,
  propiedad_id uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  idx          smallint NOT NULL,
  texto        text NOT NULL,
  modelo       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (propiedad_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_variantes_propiedad
  ON public.propiedad_descripcion_variantes (propiedad_id, idx);

ALTER TABLE public.propiedad_descripcion_variantes ENABLE ROW LEVEL SECURITY;

-- Cualquiera que ya entró a la app puede leerlas (es el texto para publicar,
-- la misma información que ya ve en la descripción). Solo el job las escribe,
-- y ese corre con service_role, que no pasa por RLS.
DROP POLICY IF EXISTS "variantes_lectura" ON public.propiedad_descripcion_variantes;
CREATE POLICY "variantes_lectura" ON public.propiedad_descripcion_variantes
  FOR SELECT TO authenticated USING (true);

-- ── La variante que le toca a QUIEN llama ────────────────────────────────────
-- El índice sale de hash(propiedad + usuario). Eso da las dos cosas que
-- importan:
--   · dos personas distintas → textos distintos para la misma propiedad
--     (es el eje del problema: 8 en promedio, 58 en el peor caso);
--   · la misma persona → SIEMPRE el mismo texto. Si vuelve a copiar porque le
--     borraron el anuncio o quiere corregirlo, le sale igual. No le cambia el
--     texto debajo de los pies.
--
-- Devuelve NULL si la propiedad todavía no tiene variantes; la app entonces
-- copia la descripción guardada, igual que hoy. Así nada se rompe mientras el
-- banco se llena.
--
-- Se usa OFFSET sobre el orden de idx (no "WHERE idx = k") porque si una
-- generación falló puede haber huecos: con 6 variantes y los idx 0,1,2,4,5,7
-- un "WHERE idx = 3" no devolvería nada.
CREATE OR REPLACE FUNCTION public.variante_descripcion(p_propiedad_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_n     int;
  v_k     int;
  v_texto text;
BEGIN
  IF v_uid IS NULL OR p_propiedad_id IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_n
    FROM public.propiedad_descripcion_variantes v
   WHERE v.propiedad_id = p_propiedad_id;

  IF v_n = 0 THEN RETURN NULL; END IF;

  -- abs() porque hashtext devuelve negativos; mod() sobre un negativo daría un
  -- OFFSET negativo y la consulta fallaría.
  v_k := abs(hashtext(p_propiedad_id::text || v_uid::text)) % v_n;

  SELECT v.texto INTO v_texto
    FROM public.propiedad_descripcion_variantes v
   WHERE v.propiedad_id = p_propiedad_id
   ORDER BY v.idx
   OFFSET v_k LIMIT 1;

  RETURN v_texto;
END $fn$;

GRANT EXECUTE ON FUNCTION public.variante_descripcion(uuid) TO authenticated;

-- ── Qué propiedades le faltan variantes, y cuántas ───────────────────────────
-- Cuántas versiones necesita cada propiedad depende de cuánta gente la
-- publica, porque es lo único que determina cuántos duplicados ve Facebook:
--   · 10+ personas  → 10 versiones
--   · menos         →  6 versiones
-- Se omiten las descripciones de menos de 120 caracteres: ahí no hay
-- información que reacomodar y reescribirlas sería inventar datos.
--
-- Solo para el job (service_role). No se da a authenticated: enumera el
-- inventario completo y nadie en la app la necesita.
CREATE OR REPLACE FUNCTION public.propiedades_sin_variantes(p_limite int DEFAULT 50)
RETURNS TABLE(propiedad_id uuid, codigo text, faltan int, objetivo int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  WITH objetivos AS (
    SELECT p.id,
           p.codigo,
           CASE WHEN (SELECT COUNT(DISTINCT pl.user_id)
                        FROM public.publicacion_log pl
                       WHERE pl.propiedad_id = p.id) >= 10
                THEN 10 ELSE 6 END AS meta
      FROM public.propiedades p
     WHERE p.descripcion IS NOT NULL
       AND length(trim(p.descripcion)) >= 120
  )
  SELECT o.id, o.codigo,
         (o.meta - COALESCE(v.n, 0))::int AS faltan,
         o.meta::int
    FROM objetivos o
    LEFT JOIN (SELECT propiedad_id, COUNT(*)::int AS n
                 FROM public.propiedad_descripcion_variantes
                GROUP BY propiedad_id) v ON v.propiedad_id = o.id
   WHERE COALESCE(v.n, 0) < o.meta
   -- A lo ANCHO primero: las que tienen MENOS versiones van antes. Si se
   -- ordenara por meta, las 635 calientes llegarían a 10 mientras el resto del
   -- inventario sigue en 0, y una propiedad con 0 versiones no sirve de nada
   -- (todos copian el mismo texto guardado). Así todas llegan pronto a 3, que
   -- es donde empieza el beneficio, y después se profundiza.
   ORDER BY COALESCE(v.n, 0) ASC, o.meta DESC
   LIMIT p_limite;
$fn$;

REVOKE ALL ON FUNCTION public.propiedades_sin_variantes(int) FROM public;
REVOKE ALL ON FUNCTION public.propiedades_sin_variantes(int) FROM authenticated;

-- ── Cuánta gente ya publicó esta propiedad (para espaciar) ───────────────────
-- Publicar la misma propiedad el mismo día desde varias cuentas es la señal
-- más fuerte de spam: hubo 138 ocasiones con 5+ asesores publicando lo mismo
-- el mismo día (récord 13). Esto alimenta el aviso en la ficha; no bloquea
-- nada, solo informa para que el asesor decida esperar o elegir otra.
CREATE OR REPLACE FUNCTION public.publicaciones_recientes(p_propiedad_id uuid)
RETURNS TABLE(hoy int, semana int, total int, ultima timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT
    COUNT(DISTINCT pl.user_id) FILTER (
      WHERE (pl.created_at AT TIME ZONE 'America/Mexico_City')::date = hoy_mx())::int,
    COUNT(DISTINCT pl.user_id) FILTER (WHERE pl.created_at >= now() - interval '7 days')::int,
    COUNT(DISTINCT pl.user_id)::int,
    MAX(pl.created_at)
  FROM public.publicacion_log pl
 WHERE pl.propiedad_id = p_propiedad_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.publicaciones_recientes(uuid) TO authenticated;
