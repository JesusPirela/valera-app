-- ══════════════════════════════════════════════════════════════
-- BLOQUES DE ADMIN (Alexis / Chucho)
-- Agrupa usuarios (prospectadores) en bloques para que el panel admin
-- muestre estadísticas por usuario y un resumen por bloque.
-- Dashboard único visible a cualquier admin.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bloques (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  orden  int  NOT NULL DEFAULT 0
);

-- Sembrar los 2 bloques iniciales (idempotente por nombre)
INSERT INTO public.bloques (nombre, orden)
SELECT v.nombre, v.orden
FROM (VALUES ('Alexis', 1), ('Chucho', 2)) AS v(nombre, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.bloques b WHERE b.nombre = v.nombre);

-- Columna de asignación en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bloque_id uuid REFERENCES public.bloques(id) ON DELETE SET NULL;

-- ── RLS de bloques ──────────────────────────────────────────────
ALTER TABLE public.bloques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloques_select_auth" ON public.bloques;
CREATE POLICY "bloques_select_auth" ON public.bloques
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "bloques_admin_all" ON public.bloques;
CREATE POLICY "bloques_admin_all" ON public.bloques
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── RPC: asignar un usuario a un bloque (o quitarlo con NULL) ─────
CREATE OR REPLACE FUNCTION public.asignar_bloque(
  p_user_id   uuid,
  p_bloque_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE public.profiles SET bloque_id = p_bloque_id WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.asignar_bloque(uuid, uuid) TO authenticated;

-- ── RPC: resumen de actividad por usuario para los bloques ───────
-- Devuelve, por cada usuario prospectador, sus 3 métricas del período:
-- publicaciones (eventos), clientes_nuevos, seguimientos completados.
CREATE OR REPLACE FUNCTION public.get_bloques_resumen(
  p_dias int DEFAULT 1
)
RETURNS TABLE (
  user_id         uuid,
  nombre          text,
  bloque_id       uuid,
  publicaciones   integer,
  clientes_nuevos integer,
  seguimientos    integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fin    timestamptz;
  v_inicio timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_fin    := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC' + INTERVAL '1 day';
  v_inicio := v_fin - (p_dias || ' days')::INTERVAL;

  RETURN QUERY
  SELECT
    p.id,
    p.nombre,
    p.bloque_id,
    (SELECT COUNT(*)::int FROM public.publicacion_log pl
       WHERE pl.user_id = p.id AND pl.created_at >= v_inicio AND pl.created_at < v_fin),
    (SELECT COUNT(*)::int FROM public.clientes cl
       WHERE cl.responsable_id = p.id AND cl.created_at >= v_inicio AND cl.created_at < v_fin),
    (SELECT COUNT(*)::int FROM public.recordatorios r
       WHERE r.user_id = p.id AND r.completado = true
         AND r.updated_at >= v_inicio AND r.updated_at < v_fin)
  FROM public.profiles p
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor')
  ORDER BY p.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bloques_resumen(int) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
