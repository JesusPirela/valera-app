-- Seguridad: get_prospectadores() estaba EXECUTE para PUBLIC/anon y, siendo
-- SECURITY DEFINER (ignora RLS) y SIN chequeo de rol, exponía el email + metadata
-- de TODOS los usuarios a cualquiera con la anon key (que es pública en el bundle).
-- Se agrega: (1) validación de rol en el cuerpo, (2) search_path fijo (evita
-- secuestro por objetos en otro esquema), (3) revocar a PUBLIC/anon.

CREATE OR REPLACE FUNCTION public.get_prospectadores()
 RETURNS TABLE(id uuid, email text, nombre text, created_at timestamptz, last_seen timestamptz, role text, valera_coins integer, app_version text, app_platform text, activo boolean, inhabilitada_en timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
    p.inhabilitada_en
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.user_stats us ON us.id = p.id
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor', 'asesor')
  ORDER BY p.created_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_prospectadores() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_prospectadores() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_prospectadores() TO authenticated, service_role;
