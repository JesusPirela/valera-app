-- Calendario de actividad por bloque: 4 métricas por persona por día.
--  🤝 reunión  → manual (checklist en el bloque, tabla bloque_asistencia)
--  📅 cita     → citas_coordinacion (creada ese día por esa persona)
--  👥 cliente  → clientes (responsable, creado ese día)
--  📱 uso/pub  → user_sessions (entró) o publicacion_log (publicó) ese día

-- ── Asistencia a reuniones (checklist manual del admin/supervisor) ──────────
CREATE TABLE IF NOT EXISTS public.bloque_asistencia (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fecha       date NOT NULL,
  asistio     boolean NOT NULL DEFAULT true,
  marcado_por uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fecha)
);
ALTER TABLE public.bloque_asistencia ENABLE ROW LEVEL SECURITY;

-- Marcar/desmarcar asistencia (solo admin/supervisor).
CREATE OR REPLACE FUNCTION public.marcar_asistencia_bloque(p_user_id uuid, p_fecha date, p_asistio boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  INSERT INTO public.bloque_asistencia (user_id, fecha, asistio, marcado_por)
  VALUES (p_user_id, p_fecha, p_asistio, auth.uid())
  ON CONFLICT (user_id, fecha)
  DO UPDATE SET asistio = EXCLUDED.asistio, marcado_por = EXCLUDED.marcado_por, created_at = now();
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Calendario: métricas por persona por día en un rango ───────────────────
-- p_user_id opcional: si viene, solo esa persona (para la vista mensual).
CREATE OR REPLACE FUNCTION public.bloque_calendario(
  p_bloque_id uuid, p_desde date, p_hasta date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text; v_res jsonb;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.nombre), '[]'::jsonb)
  INTO v_res
  FROM (
    SELECT p.id AS user_id, p.nombre, p.role,
      (SELECT jsonb_object_agg(to_char(d.g, 'YYYY-MM-DD'), d.m)
       FROM (
         SELECT g::date AS g, jsonb_build_object(
           'reunion', EXISTS (SELECT 1 FROM public.bloque_asistencia a
                              WHERE a.user_id = p.id AND a.fecha = g::date AND a.asistio),
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

GRANT EXECUTE ON FUNCTION public.marcar_asistencia_bloque(uuid, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bloque_calendario(uuid, date, date, uuid) TO authenticated;
