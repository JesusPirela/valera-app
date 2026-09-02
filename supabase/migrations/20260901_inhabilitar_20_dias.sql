-- Inactividad para inhabilitar cuentas: 10 → 20 días.
-- El umbral vive en DOS lugares y ambos deben decir 20 días:
--   1. verificar_acceso() — corre cuando el usuario abre la app.
--   2. cron 'inhabilitar-cuentas-inactivas' — barrido diario.

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
  -- Auto-inhabilitar por inactividad (>20 días).
  IF v_activo AND v_last IS NOT NULL AND v_last < now() - interval '20 days' THEN
    UPDATE public.profiles
      SET activo = false, inhabilitada_en = now()
      WHERE id = v_uid;
    RETURN false;
  END IF;
  RETURN v_activo;
END;
$fn1$;
GRANT EXECUTE ON FUNCTION public.verificar_acceso() TO authenticated;

-- Cron diario: inhabilita cuentas no-admin con >20 días sin actividad.
SELECT cron.schedule(
  'inhabilitar-cuentas-inactivas',
  '0 10 * * *',
  $cron$
  UPDATE public.profiles
    SET activo = false, inhabilitada_en = now()
    WHERE activo = true
      AND role <> 'admin'
      AND last_seen IS NOT NULL
      AND last_seen < now() - interval '20 days';
  $cron$
);
