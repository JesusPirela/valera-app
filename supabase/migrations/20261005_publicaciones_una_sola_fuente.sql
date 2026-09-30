-- Las publicaciones se contaban de tres formas distintas.
--
-- Con Brith Solis, el mismo día y sin que nada estuviera mal:
--
--   Gráficas (30 días)     119   eventos de publicacion_log
--   el log, pero del mes   104   eventos de publicacion_log
--   1 a 1 (este mes)        99   propiedades DISTINTAS de propiedad_publicacion
--   Ranking (histórico)    737   propiedades DISTINTAS de propiedad_publicacion
--
-- Dos diferencias se juntaban. Primero la TABLA: las gráficas leen
-- publicacion_log, que guarda un registro por publicación, mientras que el
-- ranking y el 1 a 1 leían propiedad_publicacion, que guarda una fila por
-- propiedad con un contador. Y segundo el CRITERIO: publicar tres veces la
-- misma casa eran 3 para las gráficas y 1 para el ranking.
--
-- Decidido: cada publicación cuenta, también si es la misma propiedad
-- reposteada, porque eso es trabajo hecho. La fuente pasa a ser publicacion_log
-- en todas partes, que además es la única con fecha por evento y por tanto la
-- única que permite contar "de este mes" con precisión.
--
-- Cubre desde el 13/05/2026, un día después que el contador, y tiene 23,296
-- registros frente a los 23,190 del contador, así que no se pierde histórico.
--
-- Los periodos se quedan como están a propósito: el ranking es acumulado, la
-- gráfica sirve para ver la tendencia y el 1 a 1 mira el mes. Lo que se arregla
-- es que todos midan LO MISMO.
--
-- El orden del ranking no cambia: se ordena por XP y la columna de
-- publicaciones es informativa.

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
    '90605894-18ed-46ae-a031-5a7ac6193810'
  ]::uuid[];
  v_xp_venta int := 1500;
  v_xp_renta int := 1000;
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT us.id AS uid, p.nombre AS nom, p.avatar_url AS av, p.color_acento AS col,
           p.figura_acento AS fig, COALESCE(us.xp,0) AS xp_base, us.streak_dias AS racha,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'venta') AS v_ventas,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'renta') AS v_rentas,
           (SELECT COUNT(*)::int FROM public.citas_coordinacion ct
              WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'
                AND ct.coordinado_por = ANY(v_coord)) AS v_citas,
           -- Cada publicación cuenta, misma fuente que las gráficas.
           (SELECT COUNT(*)::int FROM public.publicacion_log pl
              WHERE pl.user_id = us.id) AS v_props,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL) AS v_cli,
           (SELECT COUNT(*)::int FROM public.vu_certificados vc WHERE vc.user_id = us.id) AS v_cur
    FROM public.user_stats us
    JOIN public.profiles p ON p.id = us.id
    WHERE p.role NOT IN ('admin')
  ), calc AS (
    SELECT b.*, (b.xp_base + b.v_ventas * v_xp_venta + b.v_rentas * v_xp_renta)::int AS xp_total
    FROM base b
  )
  SELECT c.uid, c.nom, c.av, c.col, c.fig, c.xp_total, c.racha,
         RANK() OVER (ORDER BY c.xp_total DESC)::BIGINT,
         c.v_ventas, c.v_rentas, c.v_citas, c.v_props, c.v_cli, c.v_cur
  FROM calc c
  ORDER BY c.xp_total DESC
  LIMIT 50;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_ranking_mensual()
RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text,
              xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer,
              rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer,
              clientes_registrados integer, cursos_completados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_ini timestamptz := (date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City')) AT TIME ZONE 'America/Mexico_City');
  v_coord uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94','d0a9694f-f73a-428f-a455-5f039e4b84dc',
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5','9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',
    '90605894-18ed-46ae-a031-5a7ac6193810'
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
           (SELECT COUNT(*)::int FROM public.publicacion_log pl
              WHERE pl.user_id = us.id AND pl.created_at >= v_ini) AS v_props,
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

-- El 1 a 1: mismo criterio, con el mes en curso.
CREATE OR REPLACE FUNCTION public.get_stats_uno_a_uno(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_rol text;
  v_ini timestamptz := (date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City')) AT TIME ZONE 'America/Mexico_City');
  v_coord uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94','d0a9694f-f73a-428f-a455-5f039e4b84dc',
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5','9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',
    '90605894-18ed-46ae-a031-5a7ac6193810','9c1db0b4-77a8-4235-af35-b53e606546e5'
  ]::uuid[];
  v jsonb;
BEGIN
  SELECT pr.role INTO v_rol FROM profiles pr WHERE pr.id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('admin','supervisor','gerente') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT jsonb_build_object(
    'clientes_activos', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
         AND c.estado NOT IN ('descartado','compro','compro_externo')),
    'clientes_total', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL),
    'sin_contacto_30d', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
         AND c.estado NOT IN ('descartado','compro','compro_externo')
         AND NOT EXISTS (SELECT 1 FROM interacciones i
                          WHERE i.cliente_id = c.id AND i.created_at > now() - interval '30 days')),
    'seguimiento_vencido', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
         AND c.proximo_contacto IS NOT NULL AND c.proximo_contacto < now()
         AND c.estado NOT IN ('descartado','compro','compro_externo')),
    'clientes_nuevos_mes', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL AND c.created_at >= v_ini),
    'citas_mes', (SELECT count(*) FROM citas_coordinacion ct
       WHERE ct.prospectador_id = p_user_id AND ct.estado = 'realizada'
         AND ct.coordinado_por = ANY(v_coord) AND ct.fecha_cita >= v_ini),
    -- Misma fuente y mismo criterio que el ranking y las gráficas.
    'publicaciones_mes', (SELECT count(*) FROM publicacion_log pl
       WHERE pl.user_id = p_user_id AND pl.created_at >= v_ini),
    'cierres_mes', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
         AND c.estado = 'compro' AND c.updated_at >= v_ini),
    'xp', (SELECT COALESCE(us.xp,0) FROM user_stats us WHERE us.id = p_user_id),
    'racha', (SELECT COALESCE(us.streak_dias,0) FROM user_stats us WHERE us.id = p_user_id),
    'propiedades_total', (SELECT count(*) FROM publicacion_log pl WHERE pl.user_id = p_user_id),
    'ultima_actividad', (SELECT max(e.created_at) FROM event_log e WHERE e.user_id = p_user_id)
  ) INTO v;

  RETURN v;
END $fn$;

-- El total del listado de prospectadores contaba propiedades distintas; pasa a
-- contar publicaciones, como todo lo demás.
CREATE OR REPLACE FUNCTION public.get_publicaciones_por_usuario()
RETURNS TABLE(user_id uuid, total integer)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT pl.user_id, COUNT(*)::int FROM public.publicacion_log pl GROUP BY pl.user_id;
$function$;

-- Y el contador que se recalcula cada noche. Venía de SUM(veces_publicada),
-- que es casi lo mismo pero no exactamente: el log tiene 23,296 registros y el
-- contador suma 23,190, y 32 de 89 usuarios no cuadraban entre una y otra.
CREATE OR REPLACE FUNCTION public.recalcular_contadores_user_stats()
RETURNS TABLE(usuarios_corregidos int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_n int;
BEGIN
  WITH real AS (
    SELECT s.id,
      (SELECT COUNT(*)::int FROM public.publicacion_log pl WHERE pl.user_id = s.id) AS r_props,
      (SELECT COUNT(*)::int FROM public.clientes c
        WHERE c.responsable_id = s.id AND c.eliminado_at IS NULL) AS r_cli,
      (SELECT COUNT(*)::int FROM public.vu_certificados vc
        WHERE vc.user_id = s.id) AS r_cur,
      (SELECT COUNT(*)::int FROM public.clientes c
        WHERE c.responsable_id = s.id AND c.eliminado_at IS NULL AND c.estado = 'compro') AS r_ven
    FROM public.user_stats s
  ), corregidos AS (
    UPDATE public.user_stats s
       SET total_propiedades = r.r_props,
           total_clientes    = r.r_cli,
           total_cursos      = r.r_cur,
           total_ventas      = r.r_ven
      FROM real r
     WHERE r.id = s.id
       AND (s.total_propiedades IS DISTINCT FROM r.r_props
         OR s.total_clientes    IS DISTINCT FROM r.r_cli
         OR s.total_cursos      IS DISTINCT FROM r.r_cur
         OR s.total_ventas      IS DISTINCT FROM r.r_ven)
    RETURNING s.id
  )
  SELECT COUNT(*)::int INTO v_n FROM corregidos;
  RETURN QUERY SELECT v_n;
END $fn$;

-- Y la lista de coordinadores de la casa, que también estaba a dos versiones:
-- la tabla de citas de venta incluye a Rayo (se pidió así) y los dos rankings
-- no. Hoy no cambia ningún número porque Rayo no tiene citas realizadas, pero
-- en cuanto coordine una, el ranking y la tabla dirían cosas distintas.
-- Se deja la misma lista en los tres sitios.
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
           p.figura_acento AS fig, COALESCE(us.xp,0) AS xp_base, us.streak_dias AS racha,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'venta') AS v_ventas,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'renta') AS v_rentas,
           (SELECT COUNT(*)::int FROM public.citas_coordinacion ct
              WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'
                AND ct.coordinado_por = ANY(v_coord)) AS v_citas,
           (SELECT COUNT(*)::int FROM public.publicacion_log pl
              WHERE pl.user_id = us.id) AS v_props,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL) AS v_cli,
           (SELECT COUNT(*)::int FROM public.vu_certificados vc WHERE vc.user_id = us.id) AS v_cur
    FROM public.user_stats us
    JOIN public.profiles p ON p.id = us.id
    WHERE p.role NOT IN ('admin')
  ), calc AS (
    SELECT b.*, (b.xp_base + b.v_ventas * v_xp_venta + b.v_rentas * v_xp_renta)::int AS xp_total
    FROM base b
  )
  SELECT c.uid, c.nom, c.av, c.col, c.fig, c.xp_total, c.racha,
         RANK() OVER (ORDER BY c.xp_total DESC)::BIGINT,
         c.v_ventas, c.v_rentas, c.v_citas, c.v_props, c.v_cli, c.v_cur
  FROM calc c
  ORDER BY c.xp_total DESC
  LIMIT 50;
END $fn$;
