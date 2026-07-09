-- ═══════════════════════════════════════════════════════════════════════════
-- Ranking enfocado en productividad (08/jul/2026)
--
-- Se amplía get_ranking() con métricas de resultados reales y se QUITA
-- valera_coins (el ranking no debe premiar la moneda, sino la productividad).
--
-- Definiciones (sobre la estructura existente, sin tablas nuevas):
--   • ventas_cerradas   : clientes con estado 'compro' (Apartó/Compró) y tipo_operacion 'venta'
--   • rentas_cerradas   : idem con tipo_operacion 'renta'
--   • citas_realizadas  : citas_coordinacion con estado 'realizada' — solo se
--                         marcan así cuando el usuario CONFIRMA que ocurrió
--                         (ver confirmar_cita); agendar NO cuenta.
--   • propiedades_publicadas : propiedades distintas que el usuario publicó
--   • clientes_registrados   : clientes vivos a su cargo
--   • cursos_completados     : certificados de Valera University
-- El nivel se deriva del XP en el cliente (calcularNivel), no se duplica aquí.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_ranking();

CREATE FUNCTION public.get_ranking()
RETURNS TABLE(
  id uuid,
  nombre text,
  avatar_url text,
  color_acento text,
  xp integer,
  streak_dias integer,
  posicion bigint,
  ventas_cerradas integer,
  rentas_cerradas integer,
  citas_realizadas integer,
  propiedades_publicadas integer,
  clientes_registrados integer,
  cursos_completados integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    us.id,
    p.nombre,
    p.avatar_url,
    p.color_acento,
    us.xp,
    us.streak_dias,
    RANK() OVER (ORDER BY us.xp DESC)::BIGINT,
    (SELECT COUNT(*)::int FROM public.clientes c
       WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
         AND c.estado = 'compro' AND c.tipo_operacion = 'venta'),
    (SELECT COUNT(*)::int FROM public.clientes c
       WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
         AND c.estado = 'compro' AND c.tipo_operacion = 'renta'),
    (SELECT COUNT(*)::int FROM public.citas_coordinacion ct
       WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'),
    (SELECT COUNT(DISTINCT pp.propiedad_id)::int FROM public.propiedad_publicacion pp
       WHERE pp.user_id = us.id AND pp.veces_publicada > 0),
    (SELECT COUNT(*)::int FROM public.clientes c
       WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL),
    (SELECT COUNT(*)::int FROM public.vu_certificados vc
       WHERE vc.user_id = us.id)
  FROM public.user_stats us
  JOIN public.profiles p ON p.id = us.id
  WHERE p.role NOT IN ('admin')
  ORDER BY us.xp DESC
  LIMIT 50;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_ranking() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated, service_role;
