-- Cuándo publicó por última vez cada persona.
--
-- Sustituye a publicaciones_semana_por_usuario, que solo servía para una
-- ventana fija de 7 días. Con la fecha de la última publicación, la pantalla
-- puede responder "quién no publicó hoy / ayer / en 7 días / en 30" sin una
-- consulta por cada periodo.
--
-- Se devuelve también el conteo de los últimos 30 días, que es lo que se enseña
-- al lado del nombre: una fecha sola no dice si alguien publica mucho o poco,
-- solo cuándo fue la última vez.
--
-- Solo aparece quien ha publicado alguna vez. Quien no aparece es justamente
-- quien lleva cero desde siempre, y eso lo resuelve la pantalla sin traer filas
-- de más.
DROP FUNCTION IF EXISTS public.publicaciones_semana_por_usuario();

CREATE OR REPLACE FUNCTION public.ultima_publicacion_por_usuario()
RETURNS TABLE(user_id uuid, ultima timestamptz, total_30d integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text;
BEGIN
  SELECT p.role INTO v_rol FROM public.profiles p WHERE p.id = auth.uid();
  -- IS DISTINCT FROM y no <>: con un rol nulo, "<>" no bloquea.
  IF v_rol IS DISTINCT FROM 'admin' AND v_rol IS DISTINCT FROM 'supervisor' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT pl.user_id,
         MAX(pl.created_at),
         COUNT(*) FILTER (WHERE pl.created_at > now() - interval '30 days')::int
    FROM public.publicacion_log pl
   GROUP BY pl.user_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.ultima_publicacion_por_usuario() TO authenticated;
