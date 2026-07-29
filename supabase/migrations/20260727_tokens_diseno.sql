-- ── Tokens de diseño profesional ────────────────────────────────────────────
-- El botón "Solicitar diseño con André" pasa a estar BLOQUEADO: se necesita un
-- TOKEN para pedir un diseño. Los tokens se consiguen comprándolos (100 coins,
-- máx 2 compras/día) o ganándolos en los cofres. Cada token = un diseño.

ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS disenos_tokens integer NOT NULL DEFAULT 0;

-- Comprar 1 token (100 coins). Máximo 2 compras por día (hora de México).
CREATE OR REPLACE FUNCTION public.comprar_token_diseno()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_hoy   date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_compras_hoy int;
  v_tokens int;
  COSTO   constant int := 50;
  MAX_DIA constant int := 2;
  v_concepto constant text := 'Token de diseño 🎨';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no autenticado'); END IF;

  SELECT COUNT(*) INTO v_compras_hoy
  FROM public.coin_transactions
  WHERE user_id = v_uid AND concepto = v_concepto
    AND (created_at AT TIME ZONE 'America/Mexico_City')::date = v_hoy;

  IF v_compras_hoy >= MAX_DIA THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limite',
      'mensaje', 'Ya compraste ' || MAX_DIA || ' diseños hoy. Vuelve mañana o gánalos en los cofres.');
  END IF;

  IF NOT public.gastar_coins(v_uid, COSTO, v_concepto) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'saldo',
      'mensaje', 'No tienes suficientes Valera Coins (necesitas ' || COSTO || ').');
  END IF;

  UPDATE public.user_stats SET disenos_tokens = disenos_tokens + 1 WHERE id = v_uid
  RETURNING disenos_tokens INTO v_tokens;

  RETURN jsonb_build_object('ok', true, 'tokens', v_tokens,
    'compras_restantes_hoy', MAX_DIA - (v_compras_hoy + 1));
END;
$$;
REVOKE ALL ON FUNCTION public.comprar_token_diseno() FROM public;
GRANT EXECUTE ON FUNCTION public.comprar_token_diseno() TO authenticated;

-- Consumir 1 token al pedir un diseño.
CREATE OR REPLACE FUNCTION public.usar_token_diseno()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tokens int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no autenticado'); END IF;

  UPDATE public.user_stats
  SET disenos_tokens = disenos_tokens - 1
  WHERE id = v_uid AND disenos_tokens > 0
  RETURNING disenos_tokens INTO v_tokens;

  IF v_tokens IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_tokens');
  END IF;
  RETURN jsonb_build_object('ok', true, 'tokens', v_tokens);
END;
$$;
REVOKE ALL ON FUNCTION public.usar_token_diseno() FROM public;
GRANT EXECUTE ON FUNCTION public.usar_token_diseno() TO authenticated;
