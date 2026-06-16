-- ══════════════════════════════════════════════════════════════
-- FIX: get_bloques_resumen usaba recordatorios.updated_at (no existe).
-- La columna correcta de seguimientos completados es completado_at
-- (igual que get_actividad_periodo). Sin esto la RPC tronaba y el
-- dashboard de Bloques aparecía sin usuarios.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_bloques_resumen(
  p_dias int DEFAULT 1
)
RETURNS TABLE (
  user_id         uuid,
  nombre          text,
  bloque_id       uuid,
  publicaciones   integer,
  clientes_nuevos integer,
  seguimientos    integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fin    timestamptz;
  v_inicio timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_fin    := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC' + INTERVAL '1 day';
  v_inicio := v_fin - (p_dias || ' days')::INTERVAL;

  RETURN QUERY
  SELECT
    p.id,
    p.nombre,
    p.bloque_id,
    (SELECT COUNT(*)::int FROM public.publicacion_log pl
       WHERE pl.user_id = p.id AND pl.created_at >= v_inicio AND pl.created_at < v_fin),
    (SELECT COUNT(*)::int FROM public.clientes cl
       WHERE cl.responsable_id = p.id AND cl.created_at >= v_inicio AND cl.created_at < v_fin),
    (SELECT COUNT(*)::int FROM public.recordatorios r
       WHERE r.user_id = p.id AND r.completado = true
         AND r.completado_at >= v_inicio AND r.completado_at < v_fin)
  FROM public.profiles p
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor')
  ORDER BY p.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bloques_resumen(int) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
