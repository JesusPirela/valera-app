-- Fix: publicar_propiedad_atomico no insertaba en xp_transactions.
--
-- La tabla xp_transactions se creó el 01-Jul-2026 (20260701_xp_transactions.sql),
-- pero publicar_propiedad_atomico (20260619) bypaseaba award_xp_coins y actualizaba
-- user_stats.xp directamente. El XP llegaba al contador pero nunca aparecía en el
-- historial de XP ni se podía auditar. Se añade el INSERT faltante.

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

  SELECT veces_publicada, ultima_idem_key, fecha_publicacion
    INTO v_veces, v_idem, v_fecha
  FROM propiedad_publicacion
  WHERE propiedad_id = p_propiedad_id AND user_id = v_user
  FOR UPDATE;

  -- Reintento de la misma pulsación: devolver resultado ya aplicado.
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

  -- XP + coins en la misma transacción atómica que el conteo.
  INSERT INTO public.user_stats (id, xp, valera_coins, total_propiedades)
  VALUES (v_user, 10, 2, 1)
  ON CONFLICT (id) DO UPDATE SET
    xp                = user_stats.xp + 10,
    valera_coins      = user_stats.valera_coins + 2,
    total_propiedades = COALESCE(user_stats.total_propiedades, 0) + 1;

  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (v_user, 2, 'Publicar propiedad 🏠');

  -- Fix: registrar el XP igual que los coins (xp_transactions no existía
  -- cuando se creó esta función; se añade ahora para que aparezca en el historial).
  INSERT INTO public.xp_transactions (user_id, cantidad, concepto)
  VALUES (v_user, 10, 'Publicar propiedad 🏠');

  RETURN jsonb_build_object(
    'ok', true, 'veces_publicada', v_nuevas,
    'fecha_publicacion', v_fecha, 'repetido', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publicar_propiedad_atomico(UUID, UUID) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
