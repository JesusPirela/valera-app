-- La retro ahora pregunta en qué quedó la cita, en vez de suponerlo.
--
-- Hasta hoy, si las tres respuestas venían llenas, la función marcaba la cita
-- como 'Realizada' sola. Está bien como suposición, pero es una suposición: la
-- cita pudo acabar en apartado, en "buscar más opciones" o en reagenda, y
-- nadie se lo preguntaba a quien escribió la retro.
--
-- Ahora el asistente lo pregunta al final y manda la respuesta. Si no viene
-- (versiones viejas de la app, o quien no contestó), se queda la suposición de
-- antes, así que nada se rompe.
--
-- Se BORRA la versión de seis argumentos a propósito. Si se dejaran las dos,
-- una llamada con seis parámetros con nombre podría encajar en las dos y
-- Postgres respondería "function is not unique". Al borrarla, las apps viejas
-- siguen llamando con seis y caen en esta, que completa el séptimo con su
-- valor por omisión.
DROP FUNCTION IF EXISTS public.guardar_retro_cita(uuid, text, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.guardar_retro_cita(
  p_id                  uuid,
  p_como_estuvo         text,
  p_info_extra          text,
  p_plan_accion         text,
  p_prox_seguimiento    text DEFAULT NULL,
  p_prox_seguimiento_ts timestamptz DEFAULT NULL,
  p_estado              text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rol TEXT; v_ases UUID; v_cc UUID; v_todo BOOLEAN;
  v_estado TEXT; v_estado_cc TEXT;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  SELECT asesor_id, cita_coordinacion_id INTO v_ases, v_cc FROM citas_venta WHERE id = p_id;
  IF v_rol NOT IN ('admin','supervisor','gerente') AND (v_ases IS NULL OR v_ases <> auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_todo := COALESCE(trim(p_como_estuvo),'') <> ''
        AND COALESCE(trim(p_info_extra),'') <> ''
        AND COALESCE(trim(p_plan_accion),'') <> '';

  -- Lo que contestaron manda. Si no contestaron, la suposición de siempre.
  v_estado := NULLIF(trim(COALESCE(p_estado, '')), '');
  IF v_estado IS NULL AND v_todo THEN
    v_estado := 'Realizada';
  END IF;

  UPDATE citas_venta SET
    retro_como_estuvo   = p_como_estuvo,
    retro_info_extra    = p_info_extra,
    retro_plan_accion   = p_plan_accion,
    retro_completada_at = now(),
    fecha_prox_seguimiento    = COALESCE(NULLIF(trim(p_prox_seguimiento), ''), fecha_prox_seguimiento),
    fecha_prox_seguimiento_ts = COALESCE(p_prox_seguimiento_ts, fecha_prox_seguimiento_ts),
    estado_seguimiento  = COALESCE(v_estado, estado_seguimiento)
  WHERE id = p_id;

  -- La cita del CRM se mueve sola solo cuando el estado elegido tiene una
  -- equivalencia clara. Para el resto se deja como está: inventarle un estado
  -- al CRM es peor que dejarlo quieto.
  IF v_cc IS NOT NULL AND v_estado IS NOT NULL THEN
    v_estado_cc := CASE lower(v_estado)
      WHEN 'realizada'                  THEN 'realizada'
      WHEN 'esperando retroalimentación' THEN 'realizada'
      WHEN 'apartó'                     THEN 'aparto'
      WHEN 'reagendada'                 THEN 'reagendada'
      WHEN 'cancelada'                  THEN 'cancelada'
      WHEN 'cancelada/reagenda'         THEN 'cancelada'
      WHEN 'buscar más opciones'        THEN 'buscando_opciones'
      WHEN 'falta perfilar / crédito'   THEN 'falta_perfilamiento'
      WHEN 'compra a futuro'            THEN 'compra_futuro'
      WHEN 'seguim. cierre · alto interés' THEN 'seguimiento_cierre_alto'
      WHEN 'seguim. cierre · bajo interés' THEN 'seguimiento_cierre_bajo'
      WHEN 'no responde el cliente'     THEN 'no_responde_asesor'
      ELSE NULL
    END;
    IF v_estado_cc IS NOT NULL THEN
      UPDATE citas_coordinacion SET estado = v_estado_cc WHERE id = v_cc;
    END IF;
  END IF;
END
$function$;

GRANT EXECUTE ON FUNCTION public.guardar_retro_cita(uuid, text, text, text, text, timestamptz, text) TO authenticated;
