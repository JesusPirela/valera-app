-- Los topes de publicación pasan de una semana a un mes.
--
-- Hasta ahora la ventana era de 7 días: una propiedad se frenaba al llegar a
-- 10 publicaciones en la semana, y cada persona podía repetir la misma
-- propiedad una vez por semana. Facebook mira mucho más atrás que eso, así
-- que la ventana se abre a 30 días.
--
-- ── Lo que esto aprieta, medido antes de aplicarlo ────────────────────────
--   · Tope GLOBAL: hoy frena 6 propiedades; con 30 días frenaría 82, de 2,146
--     disponibles. Son 76 más, el 3.8% del catálogo.
--   · Tope PERSONAL: apenas cambia. De 13,351 publicaciones de los últimos 60
--     días, con 7 días habrían chocado 2,268 y con 30 días 2,498. Sólo 230
--     más: casi nadie repite la misma propiedad entre el día 8 y el 30.
--   · La luz verde de dirección también dura un mes, no una semana.
--
-- Las funciones se reescriben a partir de lo que HOY corre en la base, no de
-- una copia del repo, para no revivir sin querer una versión vieja.

-- ── Tope de la luz verde ──────────────────────────────────────────────────
ALTER TABLE public.propiedad_luz_verde
  ALTER COLUMN vence_at SET DEFAULT now() + interval '30 days';

CREATE OR REPLACE FUNCTION public.dar_luz_verde(p_propiedad_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  -- Se compara con IS DISTINCT FROM porque un rol NULL con "<> 'admin'" da
  -- NULL y el IF no entra: el guardia no guardaría nada.
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo un admin puede dar luz verde.');
  END IF;

  INSERT INTO public.propiedad_luz_verde (propiedad_id, autorizado_por, autorizado_at, vence_at, motivo)
  VALUES (p_propiedad_id, auth.uid(), now(), now() + interval '30 days', p_motivo)
  ON CONFLICT (propiedad_id) DO UPDATE
    SET autorizado_por = auth.uid(), autorizado_at = now(),
        vence_at = now() + interval '30 days', motivo = EXCLUDED.motivo;

  RETURN jsonb_build_object('ok', true, 'vence_at', now() + interval '30 days');
END $fn$;

-- ── Qué propiedades están saturadas (ventana de 30 días) ──────────────────
CREATE OR REPLACE FUNCTION public.propiedades_saturadas()
 RETURNS TABLE(propiedad_id uuid, veces integer, personas integer, libre_desde timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pl.propiedad_id,
         COUNT(*)::int AS veces,
         COUNT(DISTINCT pl.user_id)::int AS personas,
         -- Cuándo se libera sola: cuando la 10ª publicación más vieja de la
         -- ventana cumpla 7 días.
         (MIN(pl.created_at) + interval '30 days') AS libre_desde
    FROM public.publicacion_log pl
   WHERE pl.created_at >= now() - interval '30 days'
   GROUP BY pl.propiedad_id
  HAVING COUNT(*) >= 10
     AND NOT EXISTS (
       SELECT 1 FROM public.propiedad_luz_verde lv
        WHERE lv.propiedad_id = pl.propiedad_id AND lv.vence_at > now()
     );
$function$;

-- ── El guardia al publicar (ventana de 30 días) ───────────────────────────
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

  -- ── Tope GLOBAL: 10 publicaciones de esta propiedad en 7 días, entre todos ──
  SELECT COUNT(*)::int, COUNT(DISTINCT user_id)::int, MIN(created_at) + interval '30 days'
    INTO v_semana, v_personas, v_libre
    FROM public.publicacion_log
   WHERE propiedad_id = p_propiedad_id AND created_at >= now() - interval '30 days';

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
