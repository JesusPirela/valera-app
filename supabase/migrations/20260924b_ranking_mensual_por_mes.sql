-- El ranking MENSUAL mostraba métricas HISTÓRICAS.
--
-- get_ranking_mensual solo calculaba el XP por mes (suma de xp_transactions
-- desde el inicio del mes). Todo lo demás —citas realizadas, cierres,
-- propiedades publicadas, clientes y cursos— se contaba SIN filtro de fecha,
-- es decir, de toda la vida.
--
-- Se notó porque Brith Solis aparecía con 48 citas en el mensual y 20 en el
-- histórico, lo cual es imposible. El desglose real era:
--   48 = todas sus citas realizadas, sin filtro de coordinador  (lo que mostraba el mensual)
--   20 = todas sus citas realizadas, coordinadas por la casa    (el histórico ya corregido)
--    2 = sus citas del mes coordinadas por la casa              (lo correcto para el mensual)
--
-- Ahora TODAS las métricas del mensual son del mes en curso, y se aplican los
-- mismos criterios del histórico: solo citas coordinadas por la casa y el bono
-- de cierres (1,500 por venta, 1,000 por renta) sumado al XP del mes.
--
-- Aplicada a producción el 2026-09-24 y verificada.
CREATE OR REPLACE FUNCTION public.get_ranking_mensual()
RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text,
              xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer,
              rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer,
              clientes_registrados integer, cursos_completados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_ini timestamptz := (date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City')) AT TIME ZONE 'America/Mexico_City');
  v_coord uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
    'd0a9694f-f73a-428f-a455-5f039e4b84dc',  -- Chucho
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5',  -- Carlos Carbajal
    '9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',  -- Andrés Valera (admin)
    '90605894-18ed-46ae-a031-5a7ac6193810'   -- Andrés Valera (supervisor)
  ]::uuid[];
  v_xp_venta int := 1500;
  v_xp_renta int := 1000;
BEGIN
  RETURN QUERY
  WITH mensual AS (
    SELECT xt.user_id, SUM(xt.cantidad)::int AS xp_mes
    FROM public.xp_transactions xt
    WHERE xt.created_at >= v_ini
    GROUP BY xt.user_id
  ), base AS (
    SELECT us.id AS uid, p.nombre AS nom, p.avatar_url AS av, p.color_acento AS col,
           p.figura_acento AS fig, m.xp_mes, us.streak_dias AS racha,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'venta'
                AND c.updated_at >= v_ini) AS v_ventas,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'renta'
                AND c.updated_at >= v_ini) AS v_rentas,
           (SELECT COUNT(*)::int FROM public.citas_coordinacion ct
              WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'
                AND ct.coordinado_por = ANY(v_coord)
                AND ct.fecha_cita >= v_ini) AS v_citas,
           (SELECT COUNT(DISTINCT pp.propiedad_id)::int FROM public.propiedad_publicacion pp
              WHERE pp.user_id = us.id AND pp.veces_publicada > 0
                AND pp.fecha_publicacion >= v_ini) AS v_props,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.created_at >= v_ini) AS v_cli,
           (SELECT COUNT(*)::int FROM public.vu_certificados vc
              WHERE vc.user_id = us.id AND vc.emitido_at >= v_ini) AS v_cur
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
