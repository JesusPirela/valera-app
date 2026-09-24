-- Propiedades que le quedan a un cliente, dentro de su propia ficha.
--
-- El asesor tenía el presupuesto y la zona del cliente escritos en la ficha, y
-- el inventario en otra pantalla, pero cruzarlos era trabajo manual: abrir
-- propiedades, filtrar a ojo y acordarse de lo que había. Esto lo hace solo.
--
-- POR QUÉ EL RANGO LLEGA YA CALCULADO
-- clientes.presupuesto es TEXTO LIBRE y se escribe de mil formas:
-- "$900mil_a_$1.2m", "1,600,000", "9k", "1.4M", "15,000", "?". Interpretarlo en
-- SQL sería ilegible y difícil de corregir, así que lo hace la app
-- (lib/match-propiedades.ts) y aquí llega ya como dos números. De 1,755
-- clientes con presupuesto y zona, el 96% resulta interpretable.
--
-- POR QUÉ LA ZONA SE BUSCA EN EL TÍTULO Y LA DIRECCIÓN
-- propiedades.zona NO es la colonia, es el ESTADO: 1,875 de 2,248 dicen
-- "queretaro". El cliente, en cambio, busca por fraccionamiento ("Real Solare",
-- "Juriquilla", "El Marqués"), y eso solo aparece dentro del título y la
-- dirección. De las 304 zonas distintas que piden los clientes, solo 7 coinciden
-- con propiedades.zona, así que cruzar por esa columna no sirve de nada.
-- Buscar en el texto sí funciona, con el costo de algún falso positivo.
--
-- LOS TRES NIVELES
-- Con coincidencia exacta de zona y presupuesto se cubre al 62% de los
-- clientes. Para que al resto no se le quede la sección vacía, se devuelven
-- también dos tandas más flojas, cada una MARCADA para que la pantalla pueda
-- decir por qué aparece y el asesor no crea que están en su zona:
--   1 = en su zona y en su presupuesto
--   2 = en su zona, pero se pasa de presupuesto (hasta un 15%)
--   3 = en su presupuesto, pero en otra zona

CREATE TABLE IF NOT EXISTS public.sugerencias_descartadas (
  cliente_id   uuid NOT NULL REFERENCES public.clientes(id)    ON DELETE CASCADE,
  propiedad_id uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  descartado_por uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, propiedad_id)
);

ALTER TABLE public.sugerencias_descartadas ENABLE ROW LEVEL SECURITY;

-- Se descarta sobre el cliente, así que manda quién es responsable de ese
-- cliente. Admin y supervisor ven y tocan todo, como en el resto de la app.
DROP POLICY IF EXISTS sugerencias_descartadas_ver ON public.sugerencias_descartadas;
CREATE POLICY sugerencias_descartadas_ver ON public.sugerencias_descartadas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.responsable_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor','gerente'))
  );

DROP POLICY IF EXISTS sugerencias_descartadas_escribir ON public.sugerencias_descartadas;
CREATE POLICY sugerencias_descartadas_escribir ON public.sugerencias_descartadas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.responsable_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor','gerente'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = cliente_id AND c.responsable_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor','gerente'))
  );

-- DROP antes del CREATE: cambiar las columnas que devuelve un RETURNS TABLE no
-- se puede con CREATE OR REPLACE, Postgres lo rechaza.
DROP FUNCTION IF EXISTS public.sugerir_propiedades(uuid, numeric, numeric, text[], text, int);

CREATE FUNCTION public.sugerir_propiedades(
  p_cliente_id uuid,
  p_min        numeric,
  p_max        numeric,
  p_zonas      text[],
  p_operacion  text,
  p_limite     int DEFAULT 24
)
RETURNS TABLE(
  id uuid, codigo text, titulo text, direccion text, precio numeric,
  operacion text, tipo text, recamaras smallint, banos smallint, m2 numeric,
  imagen_url text, nivel int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $fn$
  WITH disponibles AS (
    SELECT pr.*, lower(unaccent(coalesce(pr.titulo,'') || ' ' || coalesce(pr.direccion,''))) AS texto
      FROM public.propiedades pr
     WHERE pr.estado = 'disponible'
       AND pr.precio > 0
       AND pr.operacion = p_operacion
       AND NOT EXISTS (
             SELECT 1 FROM public.sugerencias_descartadas d
              WHERE d.cliente_id = p_cliente_id AND d.propiedad_id = pr.id)
  ), zonas AS (
    SELECT lower(unaccent(z)) AS z
      FROM unnest(coalesce(p_zonas, ARRAY[]::text[])) AS z
     WHERE length(trim(z)) >= 4
  ), clasificadas AS (
    SELECT d.*,
           EXISTS (SELECT 1 FROM zonas WHERE d.texto LIKE '%' || zonas.z || '%') AS en_zona,
           (d.precio BETWEEN p_min AND p_max)                                    AS en_precio,
           (d.precio > p_max AND d.precio <= p_max * 1.15)                       AS poco_arriba
      FROM disponibles d
  )
  SELECT c.id, c.codigo, c.titulo, c.direccion, c.precio, c.operacion, c.tipo,
         c.recamaras, c.banos, c.m2,
         -- Primera foto, para la tarjeta. Se prefiere el thumbnail
         -- pregenerado: la original pesa hasta 3MB y aquí se ve a 240px.
         (SELECT coalesce(i.thumb_url, i.url) FROM public.propiedad_imagenes i
           WHERE i.propiedad_id = c.id ORDER BY i.orden NULLS LAST LIMIT 1) AS imagen_url,
         CASE WHEN c.en_zona AND c.en_precio   THEN 1
              WHEN c.en_zona AND c.poco_arriba THEN 2
              ELSE 3 END AS nivel
    FROM clasificadas c
   WHERE (c.en_zona AND (c.en_precio OR c.poco_arriba))
      OR c.en_precio
   ORDER BY CASE WHEN c.en_zona AND c.en_precio   THEN 1
                 WHEN c.en_zona AND c.poco_arriba THEN 2
                 ELSE 3 END,
            c.precio
   LIMIT greatest(1, least(p_limite, 60));
$fn$;

GRANT EXECUTE ON FUNCTION public.sugerir_propiedades(uuid, numeric, numeric, text[], text, int) TO authenticated;
