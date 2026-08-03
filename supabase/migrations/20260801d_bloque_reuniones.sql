-- No siempre hay reunión: la asistencia solo cuenta en los días que el
-- admin/supervisor marca como día de reunión. Un día SIN reunión queda neutro
-- (no es falta). Tri-estado en el calendario: null = no hubo reunión;
-- true = asistió; false = hubo reunión pero faltó.

CREATE TABLE IF NOT EXISTS public.bloque_reuniones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloque_id  uuid NOT NULL REFERENCES public.bloques(id) ON DELETE CASCADE,
  fecha      date NOT NULL,
  titulo     text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bloque_id, fecha)
);
ALTER TABLE public.bloque_reuniones ENABLE ROW LEVEL SECURITY;

-- Marcar (o quitar) que hubo reunión en un día del bloque.
CREATE OR REPLACE FUNCTION public.marcar_reunion_bloque(p_bloque_id uuid, p_fecha date, p_hubo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;

  IF p_hubo THEN
    INSERT INTO public.bloque_reuniones (bloque_id, fecha, created_by)
    VALUES (p_bloque_id, p_fecha, auth.uid())
    ON CONFLICT (bloque_id, fecha) DO NOTHING;
  ELSE
    -- Quitar el día de reunión también limpia las asistencias de ese día.
    DELETE FROM public.bloque_reuniones WHERE bloque_id = p_bloque_id AND fecha = p_fecha;
    DELETE FROM public.bloque_asistencia
     WHERE fecha = p_fecha AND user_id IN (SELECT id FROM public.profiles WHERE bloque_id = p_bloque_id);
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Marcar asistencia de una persona (presente/ausente). Marcar presente asegura
-- que el día quede como día de reunión.
CREATE OR REPLACE FUNCTION public.marcar_asistencia_bloque(p_user_id uuid, p_fecha date, p_asistio boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text; v_bloque uuid;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT bloque_id INTO v_bloque FROM public.profiles WHERE id = p_user_id;

  IF p_asistio THEN
    IF v_bloque IS NOT NULL THEN
      INSERT INTO public.bloque_reuniones (bloque_id, fecha, created_by)
      VALUES (v_bloque, p_fecha, auth.uid()) ON CONFLICT (bloque_id, fecha) DO NOTHING;
    END IF;
    INSERT INTO public.bloque_asistencia (user_id, fecha, asistio, marcado_por)
    VALUES (p_user_id, p_fecha, true, auth.uid())
    ON CONFLICT (user_id, fecha) DO UPDATE SET asistio = true, marcado_por = auth.uid();
  ELSE
    DELETE FROM public.bloque_asistencia WHERE user_id = p_user_id AND fecha = p_fecha;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Calendario con reunión TRI-ESTADO (null / true / false).
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
                          WHERE a.user_id = p.id AND a.fecha = g::date AND a.asistio) THEN true
             ELSE false
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

-- Días con reunión en un rango (para pintar el calendario y el "pasar lista").
CREATE OR REPLACE FUNCTION public.reuniones_bloque(p_bloque_id uuid, p_desde date, p_hasta date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_char(fecha, 'YYYY-MM-DD') ORDER BY fecha), '[]'::jsonb)
  FROM public.bloque_reuniones
  WHERE bloque_id = p_bloque_id AND fecha BETWEEN p_desde AND p_hasta
$$;

GRANT EXECUTE ON FUNCTION public.marcar_reunion_bloque(uuid, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reuniones_bloque(uuid, date, date) TO authenticated;
