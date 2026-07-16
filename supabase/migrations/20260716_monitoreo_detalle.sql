-- Monitoreo: más detalle de cada error (16/jul/2026)
-- El panel mostraba solo mensaje + conteo. Ahora el resumen incluye el stack,
-- la plataforma/versión más recientes y cuántos usuarios distintos afectó; y hay
-- una RPC para ver las últimas ocurrencias completas de un error concreto.

DROP FUNCTION IF EXISTS public.get_monitoreo_errores(int);
CREATE OR REPLACE FUNCTION public.get_monitoreo_errores(p_dias int DEFAULT 7)
RETURNS TABLE(
  mensaje text, contexto text, n bigint, usuarios bigint, ultimo timestamptz,
  stack text, plataforma text, version_app text
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH base AS (
    SELECT * FROM error_log
    WHERE created_at > now() - (p_dias || ' days')::interval
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor'))
  ),
  ultimos AS (
    -- La ocurrencia más reciente de cada mensaje (para mostrar su stack/versión).
    SELECT DISTINCT ON (mensaje) mensaje, stack, plataforma, version_app
    FROM base ORDER BY mensaje, created_at DESC
  )
  SELECT b.mensaje, MAX(b.contexto), COUNT(*), COUNT(DISTINCT b.user_id), MAX(b.created_at),
         u.stack, u.plataforma, u.version_app
  FROM base b
  JOIN ultimos u ON u.mensaje = b.mensaje
  GROUP BY b.mensaje, u.stack, u.plataforma, u.version_app
  ORDER BY COUNT(*) DESC
  LIMIT 100;
$$;

-- Últimas ocurrencias completas de UN error (para ver el detalle al tocarlo).
CREATE OR REPLACE FUNCTION public.get_error_ocurrencias(p_mensaje text, p_dias int DEFAULT 30)
RETURNS TABLE(
  contexto text, plataforma text, version_app text, usuario text, created_at timestamptz, stack text
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.contexto, e.plataforma, e.version_app,
         COALESCE(p.nombre, '—'), e.created_at, e.stack
  FROM error_log e
  LEFT JOIN profiles p ON p.id = e.user_id
  WHERE e.mensaje = p_mensaje
    AND e.created_at > now() - (p_dias || ' days')::interval
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor'))
  ORDER BY e.created_at DESC
  LIMIT 25;
$$;

REVOKE EXECUTE ON FUNCTION public.get_monitoreo_errores(int)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_error_ocurrencias(text, int)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_monitoreo_errores(int)         TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_error_ocurrencias(text, int)   TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
