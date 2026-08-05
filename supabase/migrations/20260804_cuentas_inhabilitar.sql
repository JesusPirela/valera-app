-- Sistema de inhabilitación de cuentas por inactividad + manual (admin).
-- · profiles.activo = gate de acceso (el login se bloquea si es false).
-- · Auto-inhabilita tras 10 días sin actividad (last_seen), excepto admins.
-- · Un admin puede habilitar/inhabilitar manualmente (nunca a otro admin).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inhabilitada_en timestamptz;

-- Verifica el acceso del usuario actual. Si lleva >10 días sin actividad, lo
-- auto-inhabilita en el momento. Devuelve true si puede entrar, false si no.
CREATE OR REPLACE FUNCTION public.verificar_acceso()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn1$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_activo boolean;
  v_last timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN true; END IF;        -- sin sesión: no bloquear aquí
  SELECT role, activo, last_seen INTO v_role, v_activo, v_last
  FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RETURN true; END IF;            -- perfil faltante: no bloquear
  IF v_role = 'admin' THEN RETURN true; END IF;     -- admins nunca se inhabilitan
  -- Auto-inhabilitar por inactividad (>10 días).
  IF v_activo AND v_last IS NOT NULL AND v_last < now() - interval '10 days' THEN
    UPDATE public.profiles
      SET activo = false, inhabilitada_en = now()
      WHERE id = v_uid;
    RETURN false;
  END IF;
  RETURN v_activo;
END;
$fn1$;
GRANT EXECUTE ON FUNCTION public.verificar_acceso() TO authenticated;

-- Un admin habilita/inhabilita una cuenta manualmente.
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
        -- al reactivar, refrescar last_seen para dar margen y que el cron no la re-inhabilite
        last_seen = CASE WHEN p_activo THEN now() ELSE last_seen END
    WHERE id = p_user_id;
  RETURN p_activo;
END;
$fn2$;
GRANT EXECUTE ON FUNCTION public.admin_set_cuenta_activa(uuid, boolean) TO authenticated;

-- Cron diario: inhabilita cuentas no-admin con >10 días sin actividad. 4am MX (10 UTC).
DO $do$
BEGIN
  PERFORM cron.unschedule('inhabilitar-cuentas-inactivas');
EXCEPTION WHEN OTHERS THEN NULL;
END
$do$;

SELECT cron.schedule(
  'inhabilitar-cuentas-inactivas',
  '0 10 * * *',
  $cron$
  UPDATE public.profiles
    SET activo = false, inhabilitada_en = now()
    WHERE activo = true
      AND role <> 'admin'
      AND last_seen IS NOT NULL
      AND last_seen < now() - interval '10 days';
  $cron$
);
