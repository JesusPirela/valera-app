-- "Interesado en" se parte en dos: la PROPIEDAD que fueron a ver y la ZONA.
--
-- Hoy es un solo campo de texto libre y ahí cabe de todo: "real solare fase 1",
-- "casa peñuelas 1.3", "Casa en Venta en San Juan del Río,  Querétaro,  México"
-- y hasta un link. Preguntar "¿en qué zona se atendió?" no se puede contestar
-- con eso.
--
-- OJO con propiedades.zona: NO sirve para esto. Guarda el ESTADO (queretaro,
-- monterrey, puebla), no el desarrollo. La zona de verdad es el PRIMER TRAMO
-- de la dirección, y se comprobó contra los datos: Juriquilla (165),
-- Sulé Zibatá (118), Zibatá (94), El Mirador (85), El Refugio (49),
-- Capital Sur (36), Real Solare (32), Ciudad Maderas (31).

ALTER TABLE public.citas_venta ADD COLUMN IF NOT EXISTS zona_interesada text;

-- ── De un texto cualquiera a la zona ─────────────────────────────────────────
-- Resuelve tres formas de nombrar una propiedad, que son las que aparecen en
-- los datos reales: el código (VR-1234, 24 citas lo traen), un link con el id
-- de la propiedad (6 citas) y el nombre del desarrollo escrito a mano.
CREATE OR REPLACE FUNCTION public.zona_desde_texto(p_texto text)
RETURNS text
-- 'extensions' en el search_path: unaccent vive ahí, no en public.
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $fn$
DECLARE
  v_codigo text;
  v_id     uuid;
  v_dir    text;
BEGIN
  IF p_texto IS NULL OR trim(p_texto) = '' THEN RETURN NULL; END IF;

  -- 1) Código VR, con o sin guion, en cualquier parte del texto.
  v_codigo := (regexp_match(p_texto, '\mVR\s?-?\s?([0-9]{1,6})\M', 'i'))[1];
  IF v_codigo IS NOT NULL THEN
    SELECT direccion INTO v_dir FROM public.propiedades
     WHERE regexp_replace(codigo, '[^0-9]', '', 'g') = v_codigo
     LIMIT 1;
  END IF;

  -- 2) Un link que lleve el id de la propiedad (…?id=<uuid> o /<uuid>).
  IF v_dir IS NULL THEN
    BEGIN
      v_id := ((regexp_match(p_texto, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'))[1])::uuid;
    EXCEPTION WHEN others THEN v_id := NULL;
    END;
    IF v_id IS NOT NULL THEN
      SELECT direccion INTO v_dir FROM public.propiedades WHERE id = v_id;
    END IF;
  END IF;

  -- 3) El nombre del desarrollo escrito a mano. Se busca el primer tramo de
  --    dirección que aparezca dentro del texto, empezando por los más largos
  --    para que "Sulé Zibatá" gane sobre "Zibatá" y no se pierda el detalle.
  IF v_dir IS NULL THEN
    SELECT z.zona INTO v_dir
      FROM (
        SELECT DISTINCT trim(split_part(direccion, ',', 1)) AS zona
          FROM public.propiedades
         WHERE direccion IS NOT NULL AND length(trim(split_part(direccion, ',', 1))) >= 5
      ) z
     WHERE unaccent(lower(p_texto)) LIKE '%' || unaccent(lower(z.zona)) || '%'
     ORDER BY length(z.zona) DESC
     LIMIT 1;
    RETURN v_dir;   -- aquí v_dir ya ES la zona, no una dirección
  END IF;

  RETURN NULLIF(trim(split_part(v_dir, ',', 1)), '');
END $fn$;

GRANT EXECUTE ON FUNCTION public.zona_desde_texto(text) TO authenticated;

-- ── Se llena sola al escribir "interesado en" ────────────────────────────────
-- Solo si la zona está VACÍA: si alguien la escribió a mano, manda esa. El
-- automático ayuda, no corrige a la persona.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_zona()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF (NEW.zona_interesada IS NULL OR trim(NEW.zona_interesada) = '')
     AND NEW.interesado_en IS NOT NULL THEN
    NEW.zona_interesada := public.zona_desde_texto(NEW.interesado_en);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tr_citas_venta_zona ON public.citas_venta;
CREATE TRIGGER tr_citas_venta_zona
  BEFORE INSERT OR UPDATE OF interesado_en, zona_interesada ON public.citas_venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_venta_zona();

-- ── Rellenar lo que ya hay ───────────────────────────────────────────────────
UPDATE public.citas_venta
   SET zona_interesada = public.zona_desde_texto(interesado_en)
 WHERE zona_interesada IS NULL
   AND interesado_en IS NOT NULL
   AND trim(interesado_en) <> '';

-- Cuántas se pudieron resolver.
SELECT COUNT(*) FILTER (WHERE nullif(trim(interesado_en), '') IS NOT NULL) AS con_interesado,
       COUNT(*) FILTER (WHERE zona_interesada IS NOT NULL)                 AS con_zona
  FROM public.citas_venta;
-- Lista de zonas para el selector de la tabla: el primer tramo de las
-- direcciones, que es el desarrollo/colonia. Se piden las que aparecen en 2 o
-- más propiedades para no llenar el menú con erratas de una sola.
CREATE OR REPLACE FUNCTION public.zonas_conocidas()
RETURNS TABLE(zona text, propiedades int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT trim(split_part(direccion, ',', 1)) AS zona, COUNT(*)::int
    FROM public.propiedades
   WHERE direccion IS NOT NULL
     AND length(trim(split_part(direccion, ',', 1))) BETWEEN 3 AND 48
   GROUP BY 1
  HAVING COUNT(*) >= 2
   ORDER BY COUNT(*) DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.zonas_conocidas() TO authenticated;
SELECT COUNT(*) AS zonas_en_el_menu FROM public.zonas_conocidas();
