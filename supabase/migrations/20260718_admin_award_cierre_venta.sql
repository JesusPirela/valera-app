-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: cuando un admin confirma un cierre (estado → 'compro') desde
-- detalle-cliente, el prospectador responsable nunca recibía los 200 XP / 50
-- coins. award_xp_coins exige que p_user_id = auth.uid(), así que el admin no
-- puede llamarlo para el prospectador. Este RPC (SECURITY DEFINER, solo para
-- admin/supervisor) resuelve eso: premia directamente al responsable.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_award_cierre_venta(
  p_responsable_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  -- XP + coins + contador de ventas → al prospectador, no al admin
  INSERT INTO public.user_stats (id, xp, valera_coins, total_ventas)
  VALUES (p_responsable_id, 200, 50, 1)
  ON CONFLICT (id) DO UPDATE SET
    xp           = user_stats.xp + 200,
    valera_coins = user_stats.valera_coins + 50,
    total_ventas = COALESCE(user_stats.total_ventas, 0) + 1;

  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (p_responsable_id, 50, 'Venta/Renta cerrada 🎉');

  INSERT INTO public.xp_transactions (user_id, cantidad, concepto)
  VALUES (p_responsable_id, 200, 'Venta/Renta cerrada 🎉');

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_award_cierre_venta(UUID) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
