-- Retorna los conteos reales de actividad de HOY por categoría (hora MX)
CREATE OR REPLACE FUNCTION public.get_conteos_diarios_mx(
  p_fecha DATE DEFAULT (NOW() AT TIME ZONE 'America/Mexico_City')::DATE
)
RETURNS TABLE (categoria TEXT, conteo INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inicio  TIMESTAMPTZ;
  v_fin     TIMESTAMPTZ;
BEGIN
  -- Rango del día en hora México convertido a UTC
  v_inicio := (p_fecha::TIMESTAMP AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC';
  v_fin    := ((p_fecha + 1)::TIMESTAMP AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT 'propiedad'::TEXT,
    (SELECT COUNT(*)::INTEGER FROM public.propiedad_publicacion
     WHERE user_id = v_user_id
       AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin)

  UNION ALL
  SELECT 'crm'::TEXT,
    (SELECT COUNT(*)::INTEGER FROM public.clientes
     WHERE responsable_id = v_user_id
       AND created_at >= v_inicio AND created_at < v_fin)

  UNION ALL
  SELECT 'seguimiento'::TEXT,
    (SELECT COUNT(*)::INTEGER FROM public.recordatorios
     WHERE user_id = v_user_id AND completado = true
       AND updated_at >= v_inicio AND updated_at < v_fin)

  UNION ALL
  SELECT 'interaccion'::TEXT,
    (SELECT COUNT(*)::INTEGER FROM public.interacciones
     WHERE user_id = v_user_id
       AND created_at >= v_inicio AND created_at < v_fin)

  UNION ALL
  SELECT 'curso'::TEXT,
    (SELECT COUNT(*)::INTEGER FROM public.vu_progreso
     WHERE user_id = v_user_id
       AND created_at >= v_inicio AND created_at < v_fin);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conteos_diarios_mx(DATE) TO authenticated;
