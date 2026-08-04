-- Permitir MARCAR A MANO cita / cliente / actividad (además de lo automático).
-- El valor efectivo de cada métrica = automático (BD) OR marca manual.
CREATE TABLE IF NOT EXISTS public.bloque_marca (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fecha       date NOT NULL,
  metrica     text NOT NULL CHECK (metrica IN ('cita', 'cliente', 'actividad')),
  valor       boolean NOT NULL DEFAULT true,
  marcado_por uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fecha, metrica)
);
ALTER TABLE public.bloque_marca ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.marcar_metrica_bloque(p_user_id uuid, p_fecha date, p_metrica text, p_valor boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_metrica NOT IN ('cita', 'cliente', 'actividad') THEN RAISE EXCEPTION 'métrica inválida'; END IF;

  IF p_valor THEN
    INSERT INTO public.bloque_marca (user_id, fecha, metrica, valor, marcado_por)
    VALUES (p_user_id, p_fecha, p_metrica, true, auth.uid())
    ON CONFLICT (user_id, fecha, metrica) DO UPDATE SET valor = true, marcado_por = auth.uid();
  ELSE
    DELETE FROM public.bloque_marca WHERE user_id = p_user_id AND fecha = p_fecha AND metrica = p_metrica;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Calendario: agrega las marcas manuales (m_cita / m_cliente / m_actividad).
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
                                AND (pl.created_at AT TIME ZONE 'America/Mexico_City')::date = g::date),
           'm_cita',      EXISTS (SELECT 1 FROM public.bloque_marca bm WHERE bm.user_id = p.id AND bm.fecha = g::date AND bm.metrica = 'cita'      AND bm.valor),
           'm_cliente',   EXISTS (SELECT 1 FROM public.bloque_marca bm WHERE bm.user_id = p.id AND bm.fecha = g::date AND bm.metrica = 'cliente'   AND bm.valor),
           'm_actividad', EXISTS (SELECT 1 FROM public.bloque_marca bm WHERE bm.user_id = p.id AND bm.fecha = g::date AND bm.metrica = 'actividad' AND bm.valor)
         ) AS m
         FROM generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') g
       ) d) AS dias
    FROM public.profiles p
    WHERE p.bloque_id = p_bloque_id
      AND (p_user_id IS NULL OR p.id = p_user_id)
  ) t;
  RETURN v_res;
END $$;

GRANT EXECUTE ON FUNCTION public.marcar_metrica_bloque(uuid, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bloque_calendario(uuid, date, date, uuid) TO authenticated;
