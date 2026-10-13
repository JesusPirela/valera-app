-- get_prospectadores() devuelve también marca y modelo del teléfono.
--
-- Se añade al final de la lista de columnas, que es lo que permite que quien ya
-- la consume siga funcionando sin cambios: los campos nuevos simplemente
-- aparecen.
--
-- Hay que recrearla con DROP porque cambia el tipo de retorno; CREATE OR
-- REPLACE no puede alterar el RETURNS TABLE de una función existente.
DROP FUNCTION IF EXISTS public.get_prospectadores();

CREATE FUNCTION public.get_prospectadores()
RETURNS TABLE(
  id uuid, email text, nombre text, created_at timestamptz, last_seen timestamptz,
  role text, valera_coins integer, app_version text, app_platform text,
  activo boolean, inhabilitada_en timestamptz,
  telefono_marca text, telefono_modelo text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text;
BEGIN
  SELECT p.role INTO v_rol FROM profiles p WHERE p.id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin'
     AND v_rol IS DISTINCT FROM 'supervisor'
     AND current_setting('request.jwt.claims', true)::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    au.email::TEXT,
    p.nombre,
    p.created_at,
    p.last_seen,
    p.role,
    COALESCE(us.valera_coins, 0)::INTEGER,
    p.app_version,
    p.app_platform,
    p.activo,
    p.inhabilitada_en,
    p.telefono_marca,
    p.telefono_modelo
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.user_stats us ON us.id = p.id
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor', 'asesor', 'gerente')
  ORDER BY p.created_at DESC;
END $fn$;

GRANT EXECUTE ON FUNCTION public.get_prospectadores() TO authenticated;
