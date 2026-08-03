-- Asistencia explícita: FUE / NO FUE / pendiente (antes solo "presente o nada").
-- bloque_asistencia.asistio: true = fue, false = no fue. Sin fila = pendiente.
-- marcar_asistencia_bloque ahora recibe p_estado text ('fue'|'no_fue'|'pendiente').

DROP FUNCTION IF EXISTS public.marcar_asistencia_bloque(uuid, date, boolean);

CREATE OR REPLACE FUNCTION public.marcar_asistencia_bloque(p_user_id uuid, p_fecha date, p_estado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text; v_bloque uuid;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;

  IF p_estado = 'pendiente' THEN
    DELETE FROM public.bloque_asistencia WHERE user_id = p_user_id AND fecha = p_fecha;
    RETURN jsonb_build_object('ok', true, 'estado', 'pendiente');
  END IF;

  -- 'fue' o 'no_fue': asegurar que el día quede como día de reunión.
  SELECT bloque_id INTO v_bloque FROM public.profiles WHERE id = p_user_id;
  IF v_bloque IS NOT NULL THEN
    INSERT INTO public.bloque_reuniones (bloque_id, fecha, created_by)
    VALUES (v_bloque, p_fecha, auth.uid()) ON CONFLICT (bloque_id, fecha) DO NOTHING;
  END IF;

  INSERT INTO public.bloque_asistencia (user_id, fecha, asistio, marcado_por)
  VALUES (p_user_id, p_fecha, (p_estado = 'fue'), auth.uid())
  ON CONFLICT (user_id, fecha)
  DO UPDATE SET asistio = (p_estado = 'fue'), marcado_por = auth.uid();

  RETURN jsonb_build_object('ok', true, 'estado', p_estado);
END $$;

-- Calendario: reunión ahora 4-estado (texto): null / 'fue' / 'no_fue' / 'pendiente'.
CREATE OR REPLACE FUNCTION public.bloque_calendario(
  p_bloque_id uuid, p_desde date, p_hasta date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text; v_res jsonb;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.nombre), '[]'::jsonb)
  INTO v_res
  FROM (
    SELECT p.id AS user_id, p.nombre, p.role,
      (SELECT jsonb_object_agg(to_char(d.g, 'YYYY-MM-DD'), d.m)
       FROM (
         SELECT g::date AS g, jsonb_build_object(
           'reunion', CASE
             WHEN NOT EXISTS (SELECT 1 FROM public.bloque_reuniones r
                              WHERE r.bloque_id = p_bloque_id AND r.fecha = g::date) THEN NULL
             WHEN EXISTS (SELECT 1 FROM public.bloque_asistencia a
                          WHERE a.user_id = p.id AND a.fecha = g::date AND a.asistio) THEN 'fue'
             WHEN EXISTS (SELECT 1 FROM public.bloque_asistencia a
                          WHERE a.user_id = p.id AND a.fecha = g::date AND NOT a.asistio) THEN 'no_fue'
             ELSE 'pendiente'
           END,
           'cita',    EXISTS (SELECT 1 FROM public.citas_coordinacion c
                              WHERE c.prospectador_id = p.id
                                AND (c.created_at AT TIME ZONE 'America/Mexico_City')::date = g::date),
           'cliente', EXISTS (SELECT 1 FROM public.clientes cl
                              WHERE cl.responsable_id = p.id AND cl.eliminado_at IS NULL
                                AND (cl.created_at AT TIME ZONE 'America/Mexico_City')::date = g::date),
           'uso',     EXISTS (SELECT 1 FROM public.user_sessions s
                              WHERE s.user_id = p.id
                                AND (s.inicio AT TIME ZONE 'America/Mexico_City')::date = g::date),
           'publico', EXISTS (SELECT 1 FROM public.publicacion_log pl
                              WHERE pl.user_id = p.id
                                AND (pl.created_at AT TIME ZONE 'America/Mexico_City')::date = g::date)
         ) AS m
         FROM generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') g
       ) d) AS dias
    FROM public.profiles p
    WHERE p.bloque_id = p_bloque_id
      AND (p_user_id IS NULL OR p.id = p_user_id)
  ) t;
  RETURN v_res;
END $$;

GRANT EXECUTE ON FUNCTION public.marcar_asistencia_bloque(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bloque_calendario(uuid, date, date, uuid) TO authenticated;
