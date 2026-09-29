-- Números de una persona para la charla de 1 a 1.
--
-- Hasta ahora, para preparar un 1 a 1 había que ir saltando de pantalla en
-- pantalla: el CRM por un lado, las publicaciones por otro, el ranking por
-- otro. Esto junta en una sola llamada lo que se mira en esa conversación.
--
-- Lo que devuelve está elegido para eso, no para un tablero: cuánto tiene en
-- cartera, cuánto se movió este mes y —lo que más suele doler— cuántos
-- clientes lleva sin tocar. En toda la base hay más de mil clientes activos sin
-- contacto en 30 días, así que ese número es el que abre la conversación.
--
-- Permiso: quien hace los 1 a 1. Con la comprobación de NULL, porque
-- `v_rol NOT IN (...)` no bloquea si v_rol viene nulo (ver
-- 20261002_guardas_rol_nulo.sql).

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
    -- Cartera
    'clientes_activos', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
         AND c.estado NOT IN ('descartado','compro','compro_externo')),
    'clientes_total', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL),
    -- Lo que más pesa en un 1 a 1: cartera parada.
    'sin_contacto_30d', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
         AND c.estado NOT IN ('descartado','compro','compro_externo')
         AND NOT EXISTS (SELECT 1 FROM interacciones i
                          WHERE i.cliente_id = c.id AND i.created_at > now() - interval '30 days')),
    'seguimiento_vencido', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
         AND c.proximo_contacto IS NOT NULL AND c.proximo_contacto < now()
         AND c.estado NOT IN ('descartado','compro','compro_externo')),
    -- Este mes
    'clientes_nuevos_mes', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL AND c.created_at >= v_ini),
    'citas_mes', (SELECT count(*) FROM citas_coordinacion ct
       WHERE ct.prospectador_id = p_user_id AND ct.estado = 'realizada'
         AND ct.coordinado_por = ANY(v_coord) AND ct.fecha_cita >= v_ini),
    'publicaciones_mes', (SELECT count(DISTINCT pp.propiedad_id) FROM propiedad_publicacion pp
       WHERE pp.user_id = p_user_id AND pp.veces_publicada > 0 AND pp.fecha_publicacion >= v_ini),
    'cierres_mes', (SELECT count(*) FROM clientes c
       WHERE c.responsable_id = p_user_id AND c.eliminado_at IS NULL
         AND c.estado = 'compro' AND c.updated_at >= v_ini),
    -- Acumulado y actividad
    'xp', (SELECT COALESCE(us.xp,0) FROM user_stats us WHERE us.id = p_user_id),
    'racha', (SELECT COALESCE(us.streak_dias,0) FROM user_stats us WHERE us.id = p_user_id),
    'propiedades_total', (SELECT COALESCE(us.total_propiedades,0) FROM user_stats us WHERE us.id = p_user_id),
    'ultima_actividad', (SELECT max(e.created_at) FROM event_log e WHERE e.user_id = p_user_id)
  ) INTO v;

  RETURN v;
END $fn$;

GRANT EXECUTE ON FUNCTION public.get_stats_uno_a_uno(uuid) TO authenticated;
