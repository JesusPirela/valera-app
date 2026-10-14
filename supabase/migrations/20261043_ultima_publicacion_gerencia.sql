-- Gerencia también puede consultar la última publicación de cada quien.
--
-- La función nació para la lista de Usuarios, que es de admin y supervisor.
-- Ahora la usa la pantalla de Bloques, que es de admin y GERENTE: un gerente
-- abriendo Bloques se topaba con "No autorizado" y los filtros salían vacíos
-- sin decir por qué.
--
-- Se alinea con get_bloques_resumen, que ya deja pasar a gerente.
CREATE OR REPLACE FUNCTION public.ultima_publicacion_por_usuario()
RETURNS TABLE(user_id uuid, ultima timestamptz, total_30d integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text;
BEGIN
  SELECT p.role INTO v_rol FROM public.profiles p WHERE p.id = auth.uid();
  -- Lista explícita y no "NOT IN": con un rol nulo, "NOT IN" deja pasar.
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'supervisor', 'gerente') THEN
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
