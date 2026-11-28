-- CUENTAS DE INMOBILIARIA ALIADA · Dónde verlas desde Equipo.
--
-- get_prospectadores() (la que alimenta Equipo → Usuarios) filtra
-- explícitamente WHERE role IN (los siete roles de casa) — un aliado_admin
-- o aliado_agente nunca aparece ahí. Una vez convertida, una cuenta
-- desaparecía por completo de la vista del admin: no había dónde encontrarla
-- para reasignarla de agencia o devolverla al equipo.
--
-- Esta función es la misma idea pero al revés: SOLO los aliados, con el
-- nombre de SU inmobiliaria para poder agruparlos.
CREATE OR REPLACE FUNCTION public.get_usuarios_aliados()
RETURNS TABLE(
  id uuid, email text, nombre text, role text, created_at timestamptz,
  last_seen timestamptz, inmobiliaria_id uuid, inmobiliaria_nombre text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    p.id, au.email::text, p.nombre, p.role, p.created_at, p.last_seen,
    p.inmobiliaria_id, i.nombre
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.inmobiliarias i ON i.id = p.inmobiliaria_id
  WHERE p.role IN ('aliado_admin', 'aliado_agente')
  ORDER BY i.nombre NULLS LAST, p.role, p.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.get_usuarios_aliados() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_usuarios_aliados() TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- REVERTIR
--   drop function public.get_usuarios_aliados();
