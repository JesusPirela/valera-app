-- Ranking MENSUAL: ordena por XP ganado en el mes en curso (hora de México),
-- sumando xp_transactions. Se "reinicia" solo cada mes porque solo cuenta las
-- transacciones del mes actual; no hace falta ningún cron.
-- El ranking histórico (get_ranking) sigue igual, por XP acumulado de siempre.
DROP FUNCTION IF EXISTS public.get_ranking_mensual();
CREATE FUNCTION public.get_ranking_mensual()
 RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text, xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer, rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer, clientes_registrados integer, cursos_completados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ini timestamptz := (date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City')) AT TIME ZONE 'America/Mexico_City');
BEGIN
  RETURN QUERY
  WITH mensual AS (
    SELECT xt.user_id, SUM(xt.cantidad)::int AS xp_mes
    FROM public.xp_transactions xt
    WHERE xt.created_at >= v_ini
    GROUP BY xt.user_id
  )
  SELECT
    us.id,
    p.nombre,
    p.avatar_url,
    p.color_acento,
    p.figura_acento,
    m.xp_mes,
    us.streak_dias,
    RANK() OVER (ORDER BY m.xp_mes DESC)::BIGINT,
    (SELECT COUNT(*)::int FROM public.clientes c
       WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
         AND c.estado = 'compro' AND c.tipo_operacion = 'venta'),
    (SELECT COUNT(*)::int FROM public.clientes c
       WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
         AND c.estado = 'compro' AND c.tipo_operacion = 'renta'),
    (SELECT COUNT(*)::int FROM public.citas_coordinacion ct
       WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'),
    (SELECT COUNT(DISTINCT pp.propiedad_id)::int FROM public.propiedad_publicacion pp
       WHERE pp.user_id = us.id AND pp.veces_publicada > 0),
    (SELECT COUNT(*)::int FROM public.clientes c
       WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL),
    (SELECT COUNT(*)::int FROM public.vu_certificados vc
       WHERE vc.user_id = us.id)
  FROM mensual m
  JOIN public.user_stats us ON us.id = m.user_id
  JOIN public.profiles p ON p.id = us.id
  WHERE p.role NOT IN ('admin') AND m.xp_mes > 0
  ORDER BY m.xp_mes DESC
  LIMIT 50;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_ranking_mensual() TO authenticated;
