-- CUENTAS DE INMOBILIARIA ALIADA · Último punto del bloque: sus números.
--
-- Punto 7 del prompt original ("análisis y métrica de estadísticas
-- generales, personalizado"). Nada de tablas nuevas: todo esto ya se mide en
-- la base por otras razones — property_views para el feed personalizado,
-- total_publicadores para la gamificación de nuestro equipo — y aquí solo se
-- resume filtrado por SU inmobiliaria. Para titular Y agente por igual: es
-- el estado de la operación de la agencia, no un privilegio del titular.
CREATE OR REPLACE FUNCTION public.estadisticas_aliado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inmob uuid := public.mi_inmobiliaria();
  v_res   jsonb;
BEGIN
  IF v_inmob IS NULL THEN RAISE EXCEPTION 'No perteneces a ninguna inmobiliaria aliada'; END IF;

  SELECT jsonb_build_object(
    'disponibles',   count(*) FILTER (WHERE estado = 'disponible'),
    'vendidas',      count(*) FILTER (WHERE estado = 'vendida'),
    'rentadas',      count(*) FILTER (WHERE estado = 'rentada'),
    -- Cuántas veces nuestro equipo impulsó alguna de sus propiedades en
    -- portales externos (la misma cuenta que ya llevan para su gamificación).
    'publicaciones', COALESCE(sum(total_publicadores), 0),
    -- Cuántas veces NUESTROS prospectadores vieron alguna de sus propiedades
    -- en el feed — el único dato de "interés" que ya se mide hoy.
    'vistas', (
      SELECT COALESCE(sum(pv.view_count), 0)
        FROM public.property_views pv
        JOIN public.propiedades p2 ON p2.id = pv.propiedad_id
       WHERE p2.inmobiliaria_id = v_inmob
    )
  ) INTO v_res
  FROM public.propiedades
  WHERE inmobiliaria_id = v_inmob;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.estadisticas_aliado() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.estadisticas_aliado() TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- REVERTIR
--   drop function public.estadisticas_aliado();
