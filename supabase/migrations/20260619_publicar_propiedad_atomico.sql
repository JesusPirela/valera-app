-- ═══════════════════════════════════════════════════════════════════════════
-- Publicar propiedad: RPC atómico con idempotencia.
--
-- Problema: el flujo anterior calculaba "veces_publicada + 1" en el cliente y
-- lo escribía con un UPSERT de valor fijo. Si la misma prospectadora publica
-- desde la app y desde la web casi al mismo tiempo (o dos pestañas/dispositivos),
-- ambas lecturas pueden partir del mismo valor viejo y la segunda escritura
-- pisa a la primera (lost update) — el contador "x/10" se desincroniza entre
-- plataformas. Además, otorgar coins/XP era una segunda llamada RPC separada:
-- si fallaba por red, el conteo de publicación quedaba bien pero el premio no.
--
-- Este RPC hace TODO en una sola transacción atómica (bloqueando la fila con
-- FOR UPDATE), y es seguro reintentarlo: si el cliente reenvía la misma
-- pulsación (mismo p_idem_key) porque no recibió la respuesta por una mala
-- conexión, se detecta y se devuelve el resultado ya aplicado sin duplicar
-- el conteo ni los coins.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.propiedad_publicacion
  ADD COLUMN IF NOT EXISTS ultima_idem_key UUID;

CREATE OR REPLACE FUNCTION public.publicar_propiedad_atomico(
  p_propiedad_id UUID,
  p_idem_key     UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_veces  INTEGER;
  v_idem   UUID;
  v_nuevas INTEGER;
  v_fecha  TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  INSERT INTO propiedad_publicacion (propiedad_id, user_id, publicada, veces_publicada)
  VALUES (p_propiedad_id, v_user, false, 0)
  ON CONFLICT (propiedad_id, user_id) DO NOTHING;

  -- Bloquea la fila: si hay otra publicación concurrente desde otra
  -- plataforma/dispositivo para la misma propiedad+usuario, espera a que
  -- termine y lee el valor ya actualizado (sin esto se pierde un conteo).
  SELECT veces_publicada, ultima_idem_key, fecha_publicacion
    INTO v_veces, v_idem, v_fecha
  FROM propiedad_publicacion
  WHERE propiedad_id = p_propiedad_id AND user_id = v_user
  FOR UPDATE;

  -- Reintento de la misma pulsación (mismo idem key): no reaplicar.
  IF v_idem IS NOT NULL AND v_idem = p_idem_key THEN
    RETURN jsonb_build_object(
      'ok', true, 'veces_publicada', v_veces,
      'fecha_publicacion', v_fecha, 'repetido', true
    );
  END IF;

  IF v_veces >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limite', 'veces_publicada', v_veces);
  END IF;

  v_nuevas := v_veces + 1;
  v_fecha  := NOW();

  UPDATE propiedad_publicacion
  SET veces_publicada   = v_nuevas,
      publicada         = true,
      fecha_publicacion = v_fecha,
      ultima_idem_key   = p_idem_key
  WHERE propiedad_id = p_propiedad_id AND user_id = v_user;

  -- Otorgar XP/coins en la MISMA transacción que el conteo (antes era una
  -- llamada RPC separada, vulnerable a fallar sola por mala conexión).
  INSERT INTO public.user_stats (id, xp, valera_coins, total_propiedades)
  VALUES (v_user, 10, 2, 1)
  ON CONFLICT (id) DO UPDATE SET
    xp                = user_stats.xp + 10,
    valera_coins      = user_stats.valera_coins + 2,
    total_propiedades = COALESCE(user_stats.total_propiedades, 0) + 1;

  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (v_user, 2, 'Publicar propiedad 🏠');

  RETURN jsonb_build_object(
    'ok', true, 'veces_publicada', v_nuevas,
    'fecha_publicacion', v_fecha, 'repetido', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publicar_propiedad_atomico(UUID, UUID) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
