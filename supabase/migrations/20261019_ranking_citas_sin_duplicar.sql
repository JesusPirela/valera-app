-- El ranking contaba SOLO las citas del dashboard y se dejaba fuera casi toda
-- la historia.
--
-- Medido: el ranking contaba 197 citas. En el dashboard hay 266 realizadas, y
-- en la tabla de Citas de venta hay 909 filas, de las cuales 794 NO existen en
-- el dashboard (son el Excel histórico). O sea que el trabajo de meses no
-- aparecía en el ranking de nadie.
--
-- Ahora se suman las dos, SIN contar doble: una fila de citas_venta que tiene
-- cita_coordinacion_id es la MISMA cita del dashboard, así que solo se cuentan
-- las que no están ligadas.
--
-- El problema de atribuir las de la tabla: citas_venta no guarda el id del
-- prospectador, solo su nombre ESCRITO. Se resuelve comparando el nombre
-- normalizado (sin acentos, sin signos, en minúsculas). Resultado medido: 674
-- de 794 se pueden atribuir (85%). Las otras 120 son apodos y erratas que no
-- coinciden con ningún usuario; esas no se cuentan, porque asignárselas a quien
-- se parezca sería inventar.

-- ── El resolvedor de nombres ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normaliza_nombre(p text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions' AS $fn$
  SELECT regexp_replace(
           regexp_replace(lower(unaccent(coalesce(p, ''))), '[^a-z0-9 ]', '', 'g'),
           '\s+', ' ', 'g')
$fn$;

GRANT EXECUTE ON FUNCTION public.normaliza_nombre(text) TO authenticated;

-- ── Las citas de la tabla que SÍ cuentan, ya atribuidas ──────────────────────
-- Una vista para que las dos funciones de ranking cuenten exactamente igual.
-- Si cada una lo calculara por su lado, el ranking del mes y el histórico
-- acabarían discrepando, que es el problema que arrastramos.
CREATE OR REPLACE VIEW public.citas_venta_para_ranking AS
  SELECT cv.id,
         pr.id AS prospectador_id,
         cv.fecha_cita
    FROM public.citas_venta cv
    JOIN public.profiles pr
      ON public.normaliza_nombre(pr.nombre) = public.normaliza_nombre(cv.prospecto)
   WHERE cv.cita_coordinacion_id IS NULL        -- las ligadas ya se cuentan en el dashboard
     AND nullif(trim(cv.prospecto), '') IS NOT NULL
     -- Una cita cancelada no es una cita realizada. El resto sí cuenta,
     -- incluidas las 718 sin estado: son registros de citas que ocurrieron,
     -- solo que del Excel viejo, donde ese campo no se llenaba.
     AND COALESCE(public.normaliza_nombre(cv.estado_seguimiento), '') NOT LIKE '%cancel%';

GRANT SELECT ON public.citas_venta_para_ranking TO authenticated;

-- ── Histórico ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text,
              xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer,
              rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer,
              clientes_registrados integer, cursos_completados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_coord uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94','d0a9694f-f73a-428f-a455-5f039e4b84dc',
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5','9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',
    '90605894-18ed-46ae-a031-5a7ac6193810','9c1db0b4-77a8-4235-af35-b53e606546e5'
  ]::uuid[];
  v_xp_venta int := 1500;
  v_xp_renta int := 1000;
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT us.id AS uid, p.nombre AS nom, p.avatar_url AS av, p.color_acento AS col,
           p.figura_acento AS fig, us.xp, us.streak_dias AS racha,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'venta') AS v_ventas,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'renta') AS v_rentas,
           -- Dashboard + tabla, sin duplicar.
           ((SELECT COUNT(*)::int FROM public.citas_coordinacion ct
               WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'
                 AND ct.coordinado_por = ANY(v_coord))
          + (SELECT COUNT(*)::int FROM public.citas_venta_para_ranking cvr
               WHERE cvr.prospectador_id = us.id)) AS v_citas,
           (SELECT COUNT(*)::int FROM public.publicacion_log pl
              WHERE pl.user_id = us.id) AS v_props,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL) AS v_cli,
           (SELECT COUNT(*)::int FROM public.vu_certificados vc
              WHERE vc.user_id = us.id) AS v_cur
    FROM public.user_stats us
    JOIN public.profiles p ON p.id = us.id
    WHERE p.role NOT IN ('admin')
  ), calc AS (
    SELECT b.*, (b.xp + b.v_ventas * v_xp_venta + b.v_rentas * v_xp_renta)::int AS xp_total
    FROM base b
  )
  SELECT c.uid, c.nom, c.av, c.col, c.fig, c.xp_total, c.racha,
         RANK() OVER (ORDER BY c.xp_total DESC)::BIGINT,
         c.v_ventas, c.v_rentas, c.v_citas, c.v_props, c.v_cli, c.v_cur
  FROM calc c
  ORDER BY c.xp_total DESC
  LIMIT 50;
END $fn$;

GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;

-- ── Mensual: lo mismo, acotado al mes ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_ranking_mensual(date);
CREATE OR REPLACE FUNCTION public.get_ranking_mensual(p_mes date DEFAULT NULL)
RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text,
              xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer,
              rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer,
              clientes_registrados integer, cursos_completados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
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
           ((SELECT COUNT(*)::int FROM public.citas_coordinacion ct
               WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'
                 AND ct.coordinado_por = ANY(v_coord)
                 AND ct.fecha_cita >= v_ini AND ct.fecha_cita < v_fin)
          + (SELECT COUNT(*)::int FROM public.citas_venta_para_ranking cvr
               WHERE cvr.prospectador_id = us.id
                 AND cvr.fecha_cita >= v_ini AND cvr.fecha_cita < v_fin)) AS v_citas,
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
