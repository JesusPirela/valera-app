-- Al INHABILITAR una cuenta, además de marcar activo=false, revocar sus sesiones
-- de auth para que el token no pueda refrescarse y el usuario quede fuera. El
-- cierre de sesión visible lo dispara el cliente (verificar_acceso).
CREATE OR REPLACE FUNCTION public.admin_set_cuenta_activa(p_user_id uuid, p_activo boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn2$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el estado de una cuenta';
  END IF;
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;
  IF v_target_role = 'admin' THEN
    RAISE EXCEPTION 'No se puede inhabilitar una cuenta de administrador';
  END IF;
  UPDATE public.profiles
    SET activo = p_activo,
        inhabilitada_en = CASE WHEN p_activo THEN NULL ELSE now() END,
        last_seen = CASE WHEN p_activo THEN now() ELSE last_seen END
    WHERE id = p_user_id;
  -- Al inhabilitar, revocar las sesiones de auth (best-effort).
  IF NOT p_activo THEN
    BEGIN
      DELETE FROM auth.sessions WHERE user_id = p_user_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN p_activo;
END;
$fn2$;
