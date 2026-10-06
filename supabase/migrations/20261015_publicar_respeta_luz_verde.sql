-- El tope global se aplica también en el SERVIDOR, no solo apagando el botón.
--
-- Apagar el botón en la app no basta: la RPC se puede llamar igual (la app
-- vieja de los celulares no trae el bloqueo, y hay reintentos automáticos que
-- vuelven a llamarla). Si el tope solo vive en la pantalla, se lo salta
-- cualquiera sin querer.
--
-- Se revisa DESPUÉS del idem-key a propósito: un reintento de una publicación
-- que YA entró tiene que seguir devolviendo ok, aunque esa misma publicación
-- haya sido justo la que topó el contador. Si se revisara antes, la app
-- mostraría un error por algo que sí se guardó.
CREATE OR REPLACE FUNCTION public.publicar_propiedad_atomico(p_propiedad_id uuid, p_idem_key uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid(); v_veces INTEGER; v_idem UUID; v_nuevas INTEGER; v_fecha TIMESTAMPTZ;
  v_semana INTEGER; v_personas INTEGER; v_libre TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  INSERT INTO propiedad_publicacion (propiedad_id, user_id, publicada, veces_publicada)
  VALUES (p_propiedad_id, v_user, false, 0) ON CONFLICT (propiedad_id, user_id) DO NOTHING;
  SELECT veces_publicada, ultima_idem_key, fecha_publicacion INTO v_veces, v_idem, v_fecha
  FROM propiedad_publicacion WHERE propiedad_id = p_propiedad_id AND user_id = v_user FOR UPDATE;
  IF v_idem IS NOT NULL AND v_idem = p_idem_key THEN
    RETURN jsonb_build_object('ok', true, 'veces_publicada', v_veces, 'fecha_publicacion', v_fecha, 'repetido', true);
  END IF;
  IF v_veces >= 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'limite', 'veces_publicada', v_veces); END IF;

  -- ── Tope GLOBAL: 10 publicaciones de esta propiedad en 7 días, entre todos ──
  SELECT COUNT(*)::int, COUNT(DISTINCT user_id)::int, MIN(created_at) + interval '7 days'
    INTO v_semana, v_personas, v_libre
    FROM public.publicacion_log
   WHERE propiedad_id = p_propiedad_id AND created_at >= now() - interval '7 days';

  IF v_semana >= 10 AND NOT EXISTS (
       SELECT 1 FROM public.propiedad_luz_verde lv
        WHERE lv.propiedad_id = p_propiedad_id AND lv.vence_at > now()
     ) THEN
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
