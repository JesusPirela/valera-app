-- El ranking mensual solo sabía mirar el mes en curso.
--
-- Ahora acepta el mes que se quiera ver. Dos detalles del cómo:
--
-- 1) El parámetro lleva DEFAULT NULL y se BORRA la versión sin parámetros.
--    Si se dejaran las dos, PostgREST no sabría a cuál llamar con {} y
--    respondería 300 "Could not choose the best candidate function" — ya pasó
--    con get_estadisticas_admin. Con una sola función y el default, la app
--    vieja que llama sin argumentos sigue funcionando y recibe el mes actual.
--
-- 2) Hasta ahora las métricas solo filtraban "desde el día 1" (>= v_ini), sin
--    tope por arriba. Para el mes en curso daba igual, pero para un mes pasado
--    habría contado también todo lo que vino después. Se añade el límite
--    superior a todas.

DROP FUNCTION IF EXISTS public.get_ranking_mensual();

CREATE OR REPLACE FUNCTION public.get_ranking_mensual(p_mes date DEFAULT NULL)
RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text,
              xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer,
              rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer,
              clientes_registrados integer, cursos_completados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  -- El mes pedido, o el de hoy en México si no se pide ninguno.
  v_ini timestamptz := (date_trunc('month', COALESCE(p_mes, hoy_mx()))::timestamp AT TIME ZONE 'America/Mexico_City');
  v_fin timestamptz := (date_trunc('month', COALESCE(p_mes, hoy_mx()))::timestamp + interval '1 month') AT TIME ZONE 'America/Mexico_City';
  v_coord uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94','d0a9694f-f73a-428f-a455-5f039e4b84dc',
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5','9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',
    '90605894-18ed-46ae-a031-5a7ac6193810','9c1db0b4-77a8-4235-af35-b53e606546e5'
  ]::uuid[];
  v_xp_venta int := 1500;
  v_xp_renta int := 1000;
BEGIN
  RETURN QUERY
  WITH mensual AS (
    SELECT xt.user_id, SUM(xt.cantidad)::int AS xp_mes
    FROM public.xp_transactions xt
    WHERE xt.created_at >= v_ini AND xt.created_at < v_fin
    GROUP BY xt.user_id
  ), base AS (
    SELECT us.id AS uid, p.nombre AS nom, p.avatar_url AS av, p.color_acento AS col,
           p.figura_acento AS fig, m.xp_mes, us.streak_dias AS racha,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'venta'
                AND c.updated_at >= v_ini AND c.updated_at < v_fin) AS v_ventas,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'renta'
                AND c.updated_at >= v_ini AND c.updated_at < v_fin) AS v_rentas,
           (SELECT COUNT(*)::int FROM public.citas_coordinacion ct
              WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'
                AND ct.coordinado_por = ANY(v_coord)
                AND ct.fecha_cita >= v_ini AND ct.fecha_cita < v_fin) AS v_citas,
           (SELECT COUNT(*)::int FROM public.publicacion_log pl
              WHERE pl.user_id = us.id
                AND pl.created_at >= v_ini AND pl.created_at < v_fin) AS v_props,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.created_at >= v_ini AND c.created_at < v_fin) AS v_cli,
           (SELECT COUNT(*)::int FROM public.vu_certificados vc
              WHERE vc.user_id = us.id
                AND vc.emitido_at >= v_ini AND vc.emitido_at < v_fin) AS v_cur
    FROM mensual m
    JOIN public.user_stats us ON us.id = m.user_id
    JOIN public.profiles p ON p.id = us.id
    WHERE p.role NOT IN ('admin') AND m.xp_mes > 0
  ), calc AS (
    SELECT b.*, (b.xp_mes + b.v_ventas * v_xp_venta + b.v_rentas * v_xp_renta)::int AS xp_total
    FROM base b
  )
  SELECT c.uid, c.nom, c.av, c.col, c.fig, c.xp_total, c.racha,
         RANK() OVER (ORDER BY c.xp_total DESC)::BIGINT,
         c.v_ventas, c.v_rentas, c.v_citas, c.v_props, c.v_cli, c.v_cur
  FROM calc c
  ORDER BY c.xp_total DESC
  LIMIT 50;
END $fn$;

GRANT EXECUTE ON FUNCTION public.get_ranking_mensual(date) TO authenticated;

-- Desde qué mes hay datos, para que la app no ofrezca meses vacíos.
CREATE OR REPLACE FUNCTION public.meses_con_ranking()
RETURNS TABLE(mes date, registros bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT date_trunc('month', (created_at AT TIME ZONE 'America/Mexico_City'))::date AS mes,
         COUNT(*) AS registros
    FROM public.xp_transactions
   GROUP BY 1
   ORDER BY 1 DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.meses_con_ranking() TO authenticated;
