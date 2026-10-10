-- Una publicación por persona y propiedad cada 7 días.
--
-- Antes cada quien podía marcar la misma casa hasta 10 veces, y el único freno
-- real era el tope global de 10 a la semana entre todos. Eso permitía que una
-- sola persona se comiera ese cupo sola: 10 anuncios idénticos de la misma
-- casa desde la misma cuenta, que es exactamente el patrón que Facebook marca
-- como duplicado y por el que termina restringiendo cuentas.
--
-- Con este límite, para llegar al tope global hacen falta 10 personas
-- distintas, y cada anuncio vive su semana completa antes de repetirse.
--
-- ── Lo que NO cambia ───────────────────────────────────────────────────────
--   · El tope de 10 en total por persona y propiedad.
--   · El tope global de 10 a la semana entre todos ("saturada").
--   · La idempotencia: reenviar la MISMA p_idem_key sigue devolviendo ok sin
--     contar doble. Va antes que cualquier tope, así que un reintento por red
--     caída nunca se confunde con un intento nuevo.
--
-- ── La válvula de escape ───────────────────────────────────────────────────
-- La luz verde de dirección levanta este límite igual que el de saturación.
-- Existe por un caso real: si Facebook le borra el anuncio a alguien al día
-- siguiente, sin esta salida tendría que esperar 6 días para volver a subirlo.
CREATE OR REPLACE FUNCTION public.publicar_propiedad_atomico(p_propiedad_id uuid, p_idem_key uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user UUID := auth.uid(); v_veces INTEGER; v_idem UUID; v_nuevas INTEGER; v_fecha TIMESTAMPTZ;
  v_semana INTEGER; v_personas INTEGER; v_libre TIMESTAMPTZ;
  v_mia TIMESTAMPTZ; v_con_luz BOOLEAN;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  INSERT INTO propiedad_publicacion (propiedad_id, user_id, publicada, veces_publicada)
  VALUES (p_propiedad_id, v_user, false, 0) ON CONFLICT (propiedad_id, user_id) DO NOTHING;
  SELECT veces_publicada, ultima_idem_key, fecha_publicacion INTO v_veces, v_idem, v_fecha
  FROM propiedad_publicacion WHERE propiedad_id = p_propiedad_id AND user_id = v_user FOR UPDATE;

  -- Reintento de la misma llamada: ok, sin contar doble. Va primero a
  -- propósito, para que una red caída no parezca un intento nuevo.
  IF v_idem IS NOT NULL AND v_idem = p_idem_key THEN
    RETURN jsonb_build_object('ok', true, 'veces_publicada', v_veces, 'fecha_publicacion', v_fecha, 'repetido', true);
  END IF;

  IF v_veces >= 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'limite', 'veces_publicada', v_veces); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.propiedad_luz_verde lv
     WHERE lv.propiedad_id = p_propiedad_id AND lv.vence_at > now()
  ) INTO v_con_luz;

  -- ── Tope PERSONAL: una publicación de esta propiedad cada 7 días ──
  SELECT MAX(created_at) INTO v_mia
    FROM public.publicacion_log
   WHERE propiedad_id = p_propiedad_id AND user_id = v_user
     AND created_at >= now() - interval '7 days';

  IF v_mia IS NOT NULL AND NOT v_con_luz THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'una_por_semana',
      'ultima_mia', v_mia, 'libre_mia', v_mia + interval '7 days',
      'veces_publicada', v_veces
    );
  END IF;

  -- ── Tope GLOBAL: 10 publicaciones de esta propiedad en 7 días, entre todos ──
  SELECT COUNT(*)::int, COUNT(DISTINCT user_id)::int, MIN(created_at) + interval '7 days'
    INTO v_semana, v_personas, v_libre
    FROM public.publicacion_log
   WHERE propiedad_id = p_propiedad_id AND created_at >= now() - interval '7 days';

  IF v_semana >= 10 AND NOT v_con_luz THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'saturada',
      'veces_semana', v_semana, 'personas', v_personas, 'libre_desde', v_libre,
      'veces_publicada', v_veces
    );
  END IF;

  v_nuevas := v_veces + 1; v_fecha := NOW();
  UPDATE propiedad_publicacion SET veces_publicada = v_nuevas, publicada = true, fecha_publicacion = v_fecha, ultima_idem_key = p_idem_key
  WHERE propiedad_id = p_propiedad_id AND user_id = v_user;
  INSERT INTO public.user_stats (id, xp, valera_coins, total_propiedades) VALUES (v_user, 10, 2, 1)
  ON CONFLICT (id) DO UPDATE SET xp = user_stats.xp + 10, valera_coins = user_stats.valera_coins + 2,
    total_propiedades = COALESCE(user_stats.total_propiedades, 0) + 1;
  INSERT INTO public.coin_transactions (user_id, cantidad, concepto) VALUES (v_user, 2, 'Publicar propiedad 🏠');
  INSERT INTO public.xp_transactions (user_id, cantidad, concepto) VALUES (v_user, 10, 'Publicar propiedad 🏠');
  RETURN jsonb_build_object('ok', true, 'veces_publicada', v_nuevas, 'fecha_publicacion', v_fecha, 'repetido', false);
END;
$function$;
