-- Cuántas publicaciones lleva cada persona en los últimos 7 días.
--
-- Lo que ya existía era el total de toda la vida, que sirve para premiar pero
-- no para actuar: alguien con 400 acumuladas puede llevar tres semanas sin
-- publicar y en la lista se ve igual de bien que quien publicó ayer.
--
-- Medido hoy: de 49 personas que podrían publicar, 32 lo hicieron en la última
-- semana. Las otras 17 no aparecen en ningún lado, porque la app solo sabe
-- enseñar quién SÍ publica. Esta función es la mitad que faltaba.
--
-- Devuelve solo a quien publicó algo; quien no aparece es justamente quien
-- lleva cero, y eso lo resuelve la pantalla sin traer filas de más.
CREATE OR REPLACE FUNCTION public.publicaciones_semana_por_usuario()
RETURNS TABLE(user_id uuid, total integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text;
BEGIN
  SELECT p.role INTO v_rol FROM public.profiles p WHERE p.id = auth.uid();
  -- IS DISTINCT FROM y no <>: con un rol nulo, "<>" no bloquea.
  IF v_rol IS DISTINCT FROM 'admin' AND v_rol IS DISTINCT FROM 'supervisor' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT pl.user_id, COUNT(*)::int
    FROM public.publicacion_log pl
   WHERE pl.created_at > now() - interval '7 days'
   GROUP BY pl.user_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.publicaciones_semana_por_usuario() TO authenticated;
