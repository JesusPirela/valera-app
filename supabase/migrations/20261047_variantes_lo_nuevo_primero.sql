-- Una propiedad recién creada ya no espera su turno detrás de 1,306.
--
-- El problema medido hoy: de 2,279 propiedades con descripción, 1,306 no
-- tienen ninguna versión, y la cola las ordenaba por "menos versiones primero,
-- luego por id". El id es un uuid, o sea al azar: una propiedad dada de alta
-- hoy caía en una bolsa de 1,306 en orden aleatorio. Encima el cron solo corre
-- de 07 a 11 UTC (1 a 6 de la mañana en México), así que ni siquiera empezaba
-- a mirarla hasta la madrugada. En la práctica, quien da de alta una propiedad
-- no veía sus 3 versiones en semanas.
--
-- Dos cambios:
--
-- 1. Dentro del grupo de "menos versiones", primero las más RECIENTES. La
--    propiedad que alguien acaba de subir es la que va a copiar y publicar
--    hoy; una de hace dos años puede esperar.
--
-- 2. p_horas, para pedir SOLO las creadas en las últimas N horas. Con eso se
--    puede tener una corrida de día dedicada a lo nuevo, que no toca el
--    rezago y que en un día sin altas no gasta nada de cuota.
--
-- Se BORRA la versión de dos parámetros antes de crear la nueva. Si quedaran
-- las dos, una llamada con un argumento sería ambigua y Postgres respondería
-- "could not choose a best candidate function" — ya nos pasó con
-- get_estadisticas_admin.
DROP FUNCTION IF EXISTS public.propiedades_sin_variantes(int, int);

CREATE OR REPLACE FUNCTION public.propiedades_sin_variantes(
  p_limite int DEFAULT 50,
  p_meta   int DEFAULT 3,
  p_horas  int DEFAULT NULL
)
RETURNS TABLE(propiedad_id uuid, codigo text, faltan int, objetivo int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT p.id,
         p.codigo,
         (p_meta - COALESCE(v.n, 0))::int AS faltan,
         p_meta AS objetivo
    FROM public.propiedades p
    LEFT JOIN (SELECT propiedad_id, COUNT(*)::int AS n
                 FROM public.propiedad_descripcion_variantes
                GROUP BY propiedad_id) v ON v.propiedad_id = p.id
   WHERE p.descripcion IS NOT NULL
     -- Menos de 120 caracteres no es una descripción: no hay información que
     -- reacomodar y reescribirla sería inventar datos.
     AND length(trim(p.descripcion)) >= 120
     AND COALESCE(v.n, 0) < p_meta
     -- Solo lo recién creado, cuando se pide así.
     AND (p_horas IS NULL OR p.created_at > now() - make_interval(hours => p_horas))
   -- A lo ANCHO: primero las que tienen MENOS versiones, para que todas
   -- lleguen a 3 antes de que ninguna pase de ahí. Y dentro de ese grupo, lo
   -- más reciente primero, que es lo que alguien va a publicar hoy.
   ORDER BY COALESCE(v.n, 0) ASC, p.created_at DESC
   LIMIT p_limite;
$fn$;

REVOKE ALL ON FUNCTION public.propiedades_sin_variantes(int, int, int) FROM public;
REVOKE ALL ON FUNCTION public.propiedades_sin_variantes(int, int, int) FROM authenticated;
