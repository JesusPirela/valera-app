-- El bloqueo de una propiedad cuenta PERSONAS, no publicaciones.
--
-- El tope global frenaba al llegar a 10 publicaciones en 30 días, sin mirar de
-- cuántas cuentas salían. Eso dejaba casos absurdos: VR-1234 estaba bloqueada
-- para todo el equipo porque UNA sola persona la publicó diez veces. Para eso
-- ya existe el tope personal (una por persona cada 30 días); no tiene por qué
-- castigar a los demás.
--
-- Lo que Facebook lee como spam es la misma casa saliendo desde muchas cuentas
-- distintas, así que eso es lo que se cuenta.
--
-- Medido antes de aplicarlo: pasa de frenar 82 propiedades a 65. Se liberan 17
-- —las que tenían muchas publicaciones repartidas entre pocas personas— y no
-- se frena ninguna de más, porque diez personas distintas siempre suman al
-- menos diez publicaciones.
--
-- También cambia CUÁNDO se libera. Antes era la publicación más vieja de la
-- ventana + 30 días; ahora, como lo que cuenta son personas, es el momento en
-- que se cae la persona que sobra para bajar de 10 (cada persona deja de
-- contar cuando su ÚLTIMA publicación cumple 30 días).

CREATE OR REPLACE FUNCTION public.propiedades_saturadas()
 RETURNS TABLE(propiedad_id uuid, veces integer, personas integer, libre_desde timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pl.propiedad_id,
         COUNT(*)::int AS veces,
         COUNT(DISTINCT pl.user_id)::int AS personas,
         -- Cuándo se libera sola. Una persona deja de contar cuando su
         -- ÚLTIMA publicación cumple 30 días, así que la propiedad se libera
         -- cuando se cae la persona que sobra para bajar de 10.
         (SELECT q.ult + interval '30 days'
            FROM (SELECT MAX(p2.created_at) AS ult
                    FROM public.publicacion_log p2
                   WHERE p2.propiedad_id = pl.propiedad_id
                     AND p2.created_at >= now() - interval '30 days'
                   GROUP BY p2.user_id) q
           ORDER BY q.ult
          OFFSET GREATEST(COUNT(DISTINCT pl.user_id) - 10, 0) LIMIT 1) AS libre_desde
    FROM public.publicacion_log pl
   WHERE pl.created_at >= now() - interval '30 days'
   GROUP BY pl.propiedad_id
  HAVING COUNT(DISTINCT pl.user_id) >= 10
     AND NOT EXISTS (
       SELECT 1 FROM public.propiedad_luz_verde lv
        WHERE lv.propiedad_id = pl.propiedad_id AND lv.vence_at > now()
     );
$function$;

CREATE OR REPLACE FUNCTION public.publicar_propiedad_atomico(p_propiedad_id uuid, p_idem_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     AND created_at >= now() - interval '30 days';

  IF v_mia IS NOT NULL AND NOT v_con_luz THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'una_por_semana',
      'ultima_mia', v_mia, 'libre_mia', v_mia + interval '30 days',
      'veces_publicada', v_veces
    );
  END IF;

  -- ── Tope GLOBAL: 10 PERSONAS distintas publicando esta propiedad en 30 días ──
  -- Se cuentan personas y no publicaciones: lo que Facebook lee como spam es
  -- la misma casa saliendo desde muchas cuentas. Que una sola persona la suba
  -- diez veces es cosa suya, y para eso está su tope personal — no tiene por
  -- qué dejar la propiedad bloqueada para los demás.
  SELECT COUNT(*)::int, COUNT(DISTINCT user_id)::int
    INTO v_semana, v_personas
    FROM public.publicacion_log
   WHERE propiedad_id = p_propiedad_id AND created_at >= now() - interval '30 days';

  -- Cuándo se libera: cuando se caiga la persona que sobra para bajar de 10.
  SELECT q.ult + interval '30 days' INTO v_libre
    FROM (SELECT MAX(created_at) AS ult
            FROM public.publicacion_log
           WHERE propiedad_id = p_propiedad_id AND created_at >= now() - interval '30 days'
           GROUP BY user_id) q
   ORDER BY q.ult
  OFFSET GREATEST(v_personas - 10, 0) LIMIT 1;

  IF v_personas >= 10 AND NOT v_con_luz THEN
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
