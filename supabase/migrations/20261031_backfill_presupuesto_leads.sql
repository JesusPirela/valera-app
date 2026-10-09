-- Recupera el presupuesto de los leads de campaña a los que se les perdió.
--
-- El sync leía la respuesta por el texto EXACTO de la pregunta
-- ('¿cuál_es_tu_presupuesto_para_tu_nuevo_hogar?'). Otra campaña preguntaba
-- '...para_tu_casa?' y, por esa palabra, el dato se quedaba en
-- leads_campania.extra sin pasar nunca al CRM. Ya está corregido en la función
-- para los que lleguen; esto arregla los que ya estaban.
--
-- No se inventa nada: el valor sale de la respuesta que la persona dio en el
-- formulario de Facebook, tal cual se recibió.
--
-- Solo toca filas con el campo VACÍO. Si alguien ya escribió un presupuesto a
-- mano en el CRM, ese manda: es más reciente y más fiable que la opción que el
-- lead eligió en el anuncio.
BEGIN;

CREATE TABLE IF NOT EXISTS public.backfill_presupuesto_respaldo AS
  SELECT id, presupuesto, zona_busqueda, now() AS respaldado_at
    FROM public.clientes WHERE false;

INSERT INTO public.backfill_presupuesto_respaldo (id, presupuesto, zona_busqueda, respaldado_at)
SELECT c.id, c.presupuesto, c.zona_busqueda, now()
  FROM public.clientes c
  JOIN public.leads_campania lc ON lc.cliente_id = c.id
 WHERE c.presupuesto IS NULL OR c.zona_busqueda IS NULL;

WITH respuestas AS (
  SELECT lc.cliente_id,
         -- Sin unaccent: "presupuesto" y "zona" no llevan acento, así que no
         -- hace falta depender de una extensión que vive fuera de public.
         MAX(e.value) FILTER (WHERE lower(e.key) LIKE '%presupuesto%') AS presupuesto,
         MAX(e.value) FILTER (WHERE lower(e.key) LIKE '%zona%')        AS zona
    FROM public.leads_campania lc
    CROSS JOIN LATERAL jsonb_each_text(lc.extra) e
   WHERE lc.extra IS NOT NULL AND lc.cliente_id IS NOT NULL
   GROUP BY lc.cliente_id
)
UPDATE public.clientes c
   SET presupuesto   = COALESCE(c.presupuesto,   r.presupuesto),
       zona_busqueda = COALESCE(c.zona_busqueda, r.zona)
  FROM respuestas r
 WHERE c.id = r.cliente_id
   AND ((c.presupuesto IS NULL AND r.presupuesto IS NOT NULL)
     OR (c.zona_busqueda IS NULL AND r.zona IS NOT NULL));

COMMIT;

-- Comprobación: no debe quedar ningún lead con el dato en extra y el campo vacío.
SELECT COUNT(*) FILTER (WHERE c.presupuesto IS NULL)   AS aun_sin_presupuesto,
       COUNT(*) FILTER (WHERE c.zona_busqueda IS NULL) AS aun_sin_zona
  FROM public.clientes c
  JOIN public.leads_campania lc ON lc.cliente_id = c.id
 WHERE lc.extra IS NOT NULL;
