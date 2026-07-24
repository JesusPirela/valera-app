-- Rework de seguimientos.
--
-- Antes: la misión diaria de seguimientos contaba recordatorios completados, y
-- por cómo se sincronizaba terminaba avanzando con solo CREAR un cliente. Un
-- seguimiento no es dar de alta a alguien: es volver a ese cliente y moverlo.
--
-- Ahora un seguimiento es "hoy trabajé a este cliente ya existente", y se
-- registra UNA VEZ POR CLIENTE POR DÍA. Cuenta cuando:
--   · editas algo dentro de un cliente ya creado,
--   · completas un recordatorio suyo,
--   · registras un seguimiento rápido.
-- Volver a editar al mismo cliente el mismo día ya no suma otra vez (si no,
-- bastaba con abrir uno y guardarlo en bucle para farmear XP y misiones).

CREATE TABLE IF NOT EXISTS public.seguimientos_dia (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fecha      date        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cliente_id, fecha)
);

CREATE INDEX IF NOT EXISTS ix_seguimientos_dia_user_fecha
  ON public.seguimientos_dia (user_id, fecha);

ALTER TABLE public.seguimientos_dia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seguimientos_dia_propios ON public.seguimientos_dia;
CREATE POLICY seguimientos_dia_propios ON public.seguimientos_dia
  FOR SELECT USING (user_id = auth.uid());

-- Registra el seguimiento del día para un cliente y premia solo si es nuevo.
CREATE OR REPLACE FUNCTION public.registrar_seguimiento_cliente(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_hoy   date;
  v_nuevo boolean;
  v_xp    constant integer := 15;
  v_coins constant integer := 3;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no autenticado');
  END IF;
  IF p_cliente_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin cliente');
  END IF;

  -- Solo sobre clientes propios: si no, se podrían inflar seguimientos ajenos.
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes
    WHERE id = p_cliente_id AND responsable_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', true, 'otorgado', 0, 'motivo', 'cliente ajeno');
  END IF;

  v_hoy := (now() AT TIME ZONE 'America/Mexico_City')::date;

  INSERT INTO public.seguimientos_dia (user_id, cliente_id, fecha)
  VALUES (v_uid, p_cliente_id, v_hoy)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_nuevo = ROW_COUNT;

  IF NOT v_nuevo THEN
    -- Ya se había contado este cliente hoy.
    RETURN jsonb_build_object('ok', true, 'otorgado', 0, 'repetido', true);
  END IF;

  INSERT INTO public.user_stats (id, xp, valera_coins, total_seguimientos)
  VALUES (v_uid, v_xp, v_coins, 1)
  ON CONFLICT (id) DO UPDATE SET
    xp                 = user_stats.xp + v_xp,
    valera_coins       = user_stats.valera_coins + v_coins,
    total_seguimientos = COALESCE(user_stats.total_seguimientos, 0) + 1;

  INSERT INTO public.xp_transactions (user_id, cantidad, concepto)
  VALUES (v_uid, v_xp, 'Seguimiento completado ✅');
  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (v_uid, v_coins, 'Seguimiento completado ✅');

  RETURN jsonb_build_object('ok', true, 'otorgado', v_xp, 'repetido', false);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_seguimiento_cliente(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_seguimiento_cliente(uuid) TO authenticated;

-- La misión diaria de seguimientos pasa a pedir 10 y a contar desde la nueva
-- fuente única.
UPDATE public.misiones
SET meta = 10, titulo = 'Al día con clientes', descripcion = 'Da seguimiento a 10 clientes'
WHERE categoria = 'seguimiento' AND tipo = 'diaria';
