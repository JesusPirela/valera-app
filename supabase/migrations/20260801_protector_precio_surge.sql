-- Protector de racha: se quita el TOPE semanal de compras. En su lugar, el
-- precio SUBE con cada compra de la semana (150 → 300 → 600 → 1200…) y se
-- REINICIA cada semana (lunes, hora MX). Así nadie se vuelve inmune pagando,
-- pero quien de verdad quiere salvar su racha siempre puede — pagando más.

-- 1. Compras de la semana ACTUAL (desde el lunes, hora MX) — antes eran 7 días
--    rodantes; ahora se reinicia limpio cada semana para que el precio baje.
CREATE OR REPLACE FUNCTION public.compras_protector_semana(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COUNT(*)::integer FROM coin_transactions
  WHERE user_id = p_user
    AND concepto LIKE 'Protector de racha%'
    AND (created_at AT TIME ZONE 'America/Mexico_City')
        >= date_trunc('week', (now() AT TIME ZONE 'America/Mexico_City'))
$$;

-- 2. Precio SURGE: base (costo_protector_racha()) x 2^(compras de la semana),
--    con tope de exponente para no desbordar. 0→150, 1→300, 2→600, 3→1200…
CREATE OR REPLACE FUNCTION public.costo_protector_racha(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (costo_protector_racha() * POWER(2, LEAST(compras_protector_semana(p_user), 10)))::integer
$$;

-- 3. Comprar: SIN tope semanal; cobra el precio surge actual.
CREATE OR REPLACE FUNCTION public.comprar_protector_racha()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_user  uuid := auth.uid();
  v_costo integer;
  s       RECORD;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT valera_coins, protectores_racha INTO s
  FROM user_stats WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  v_costo := costo_protector_racha(v_user);   -- precio según compras de la semana

  IF s.valera_coins < v_costo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No te alcanzan las Valera Coins',
                              'faltan', v_costo - s.valera_coins);
  END IF;

  UPDATE user_stats
  SET valera_coins      = valera_coins - v_costo,
      protectores_racha = protectores_racha + 1
  WHERE id = v_user;

  INSERT INTO coin_transactions (user_id, cantidad, concepto)
  VALUES (v_user, -v_costo, 'Protector de racha 🛡️');

  RETURN jsonb_build_object('ok', true,
    'protectores', s.protectores_racha + 1,
    'coins', s.valera_coins - v_costo,
    'costo_siguiente', costo_protector_racha(v_user));  -- ya incluye la recién comprada
END;
$fn$;

-- 4. Estado de la racha: costo_protector = precio surge actual; se agrega
--    compras_semana; los campos de tope quedan "sin límite" para la app vieja.
CREATE OR REPLACE FUNCTION public.get_estado_racha()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_hoy  date := hoy_mx();
  s      RECORD;
  v_reparable boolean := false;
  v_nivel     integer;
  v_compradas integer;
  v_hechas    integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT streak_dias, ultimo_dia_meta, protectores_racha, racha_maxima,
         racha_perdida, racha_perdida_fecha, valera_coins, xp, meta_diaria
    INTO s
  FROM user_stats WHERE id = v_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  v_reparable := s.racha_perdida IS NOT NULL
             AND s.racha_perdida_fecha IS NOT NULL
             AND s.racha_perdida_fecha >= v_hoy - 2;

  v_nivel     := nivel_de_xp(s.xp);
  v_compradas := compras_protector_semana(v_user);
  v_hechas    := misiones_diarias_hoy(v_user);

  RETURN jsonb_build_object(
    'ok', true,
    'racha', COALESCE(s.streak_dias, 0),
    'racha_maxima', COALESCE(s.racha_maxima, 0),
    'protectores', COALESCE(s.protectores_racha, 0),
    'meta_cumplida_hoy', (s.ultimo_dia_meta = v_hoy),
    'en_riesgo', (s.ultimo_dia_meta = v_hoy - 1),
    'coins', COALESCE(s.valera_coins, 0),
    'costo_protector', costo_protector_racha(v_user),   -- precio surge actual
    'compras_semana', v_compradas,                       -- cuántos van esta semana
    'compras_restantes', 999999,                         -- sin tope (compat app vieja)
    'max_compras_semana', 999999,                        -- sin tope (compat app vieja)
    'nivel', v_nivel,
    'proximo_protector_nivel', (FLOOR(v_nivel / 5.0)::integer + 1) * 5,
    'meta_diaria', COALESCE(s.meta_diaria, 1),
    'misiones_hoy', v_hechas,
    'reparable', v_reparable,
    'racha_perdida', CASE WHEN v_reparable THEN s.racha_perdida ELSE NULL END,
    'costo_reparar', CASE WHEN v_reparable THEN costo_reparar_racha(s.racha_perdida) ELSE NULL END
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.costo_protector_racha(uuid) TO authenticated, service_role;
