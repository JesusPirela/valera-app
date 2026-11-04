-- "No se pudo guardar la retro": la base no conocía 4 de los estados.
--
-- Síntoma, en la cara del usuario:
--   new row for relation "citas_coordinacion" violates check constraint
--   "citas_coordinacion_estado_check"
--
-- Pasaba al elegir cualquiera de estos cuatro desenlaces en el asistente de
-- retro: «Falta perfilar / crédito», «Compra a futuro», «Seguim. cierre · alto
-- interés» y «Seguim. cierre · bajo interés». Y no fallaba solo el cambio de
-- estado: se caía la operación ENTERA, así que la retro escrita se perdía.
--
-- La causa: esos cuatro estados se agregaron al tablero de coordinación el 15
-- de septiembre (pantalla, colores, iconos y la traducción dentro de
-- guardar_retro_cita), pero NUNCA se agregaron a la restricción de la tabla.
-- Llevaban mes y medio ahí, rompiendo también las 4 columnas correspondientes
-- del tablero: arrastrar una tarjeta a cualquiera de ellas fallaba igual.
--
-- Comprobado antes de tocar nada: la tabla no tiene ni una fila en esos
-- estados, porque era imposible escribirlos.

ALTER TABLE public.citas_coordinacion
  DROP CONSTRAINT citas_coordinacion_estado_check;

ALTER TABLE public.citas_coordinacion
  ADD CONSTRAINT citas_coordinacion_estado_check CHECK (estado = ANY (ARRAY[
    'por_contactar','primer_contacto','buscando_opciones','en_coordinacion',
    'coordinada','reagendada','no_responde_asesor','realizada',
    -- Los cuatro que faltaban. Van aquí en el mismo orden en que salen en el
    -- tablero: son etapas POSTERIORES a que la cita ya ocurrió.
    'seguimiento_cierre_alto','seguimiento_cierre_bajo',
    'falta_perfilamiento','compra_futuro',
    'aparto','recaudando_documentacion','aprobando_credito',
    'firma_contrato','escrituracion','cancelada'
  ]));

-- ── Y que nadie pierda su cita por contestar bien la retro ──────────────────
--
-- El ranking cuenta las citas del prospectador con "estado = 'realizada'".
-- Con el arreglo de arriba, una retro que diga «Falta perfilar / crédito»
-- mueve la cita a esa columna... y el prospectador PERDÍA la cita del ranking,
-- aunque la cita sí se dio. Habríamos cambiado un error visible por uno
-- silencioso, que es peor.
--
-- Los cuatro estados nuevos significan todos lo mismo para esta cuenta: la
-- cita OCURRIÓ y el cliente quedó en seguimiento. Así que cuentan igual.
--
-- Hoy esto no mueve ningún número: no hay una sola fila en esos estados. Es
-- para que no se rompa a partir de mañana.
--
-- NOTA aparte, que NO se toca aquí porque es decisión de negocio: 'aparto'
-- tampoco cuenta como cita realizada, y hay 37 citas así ahora mismo. O sea
-- que el prospectador pierde la cita justo cuando salió bien. Queda dicho.

CREATE OR REPLACE FUNCTION public.get_ranking()
 RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text, xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer, rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer, clientes_registrados integer, cursos_completados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
               WHERE ct.prospectador_id = us.id AND ct.estado IN ('realizada','seguimiento_cierre_alto',
                                'seguimiento_cierre_bajo','falta_perfilamiento',
                                'compra_futuro')
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
END $function$
;

CREATE OR REPLACE FUNCTION public.get_ranking_mensual(p_mes date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text, xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer, rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer, clientes_registrados integer, cursos_completados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
               WHERE ct.prospectador_id = us.id AND ct.estado IN ('realizada','seguimiento_cierre_alto',
                                'seguimiento_cierre_bajo','falta_perfilamiento',
                                'compra_futuro')
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
END $function$
;

CREATE OR REPLACE FUNCTION public.get_stats_uno_a_uno(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       WHERE ct.prospectador_id = p_user_id AND ct.estado IN ('realizada','seguimiento_cierre_alto',
                                'seguimiento_cierre_bajo','falta_perfilamiento',
                                'compra_futuro')
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
END $function$
;