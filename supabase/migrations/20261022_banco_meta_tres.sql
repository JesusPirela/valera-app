-- La meta del banco baja a 3 versiones por propiedad.
--
-- Por qué: el techo de las IAs gratis no es por minuto, es POR DÍA. Medido en
-- dos días seguidos: 365 y 417 versiones. A ese ritmo, la meta anterior (10
-- para las 635 más publicadas y 6 para el resto, ~15,900 en total) tardaba
-- unos 38 días. Con 3 son ~6,700 y quedan unos 15 días, y con 3 versiones cada
-- persona ya recibe un texto distinto en la práctica.
--
-- Primero COBERTURA, después profundidad: vale más que las 2,234 propiedades
-- tengan 3 versiones a que 300 tengan 10 y el resto ninguna. Una propiedad sin
-- versiones no sirve de nada — todos copian el mismo texto guardado.
--
-- Para SUBIR la meta más adelante basta cambiar el DEFAULT de p_meta aquí y
-- volver a aplicar esta función. La cola se recalcula sola y el cron empieza a
-- rellenar lo que falte, sin tocar nada de lo ya generado.
-- Se BORRA la versión de un solo parámetro antes de crear la nueva. Si
-- quedaran las dos, una llamada con un argumento sería ambigua y Postgres
-- respondería "could not choose a best candidate function" — ya nos pasó con
-- get_estadisticas_admin.
DROP FUNCTION IF EXISTS public.propiedades_sin_variantes(int);

CREATE OR REPLACE FUNCTION public.propiedades_sin_variantes(
  p_limite int DEFAULT 50,
  p_meta   int DEFAULT 3
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
   -- A lo ANCHO: primero las que tienen MENOS versiones, para que todas
   -- lleguen a 3 antes de que ninguna pase de ahí.
   ORDER BY COALESCE(v.n, 0) ASC, p.id
   LIMIT p_limite;
$fn$;

REVOKE ALL ON FUNCTION public.propiedades_sin_variantes(int, int) FROM public;
REVOKE ALL ON FUNCTION public.propiedades_sin_variantes(int, int) FROM authenticated;

-- Cómo queda la cola con la meta nueva.
SELECT COUNT(*)              AS propiedades_pendientes,
       COALESCE(SUM(faltan), 0) AS versiones_pendientes
  FROM public.propiedades_sin_variantes(5000);
