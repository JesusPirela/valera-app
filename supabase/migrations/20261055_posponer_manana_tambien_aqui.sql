-- "Mañana" también es mañana en el botón del panel.
--
-- Ayer se arregló en posponer_alarma_todo (el botón del cuadro de Android) y
-- se quedó sin arreglar en posponer_alarma, que es el que usan los botones de
-- cada lead dentro de la app. Comprobado ejecutándolo: pidiendo "Mañana" a las
-- 18:03 devolvía mañana a las 14:03, o sea "+20 horas", no mañana.
--
-- Son dos funciones porque hacen cosas distintas —una pospone todo y la otra
-- un lead— pero el significado de "Mañana" tiene que ser el mismo en las dos,
-- o el mismo botón hace cosas distintas según desde dónde se pique.
CREATE OR REPLACE FUNCTION public.posponer_alarma(
  p_tipo text, p_referencia_id uuid, p_minutos integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_hasta timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no autenticado'); END IF;
  IF p_tipo NOT IN ('alarma_lead', 'alarma_retro') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo desconocido');
  END IF;

  IF p_minutos >= 1200 THEN
    -- Mañana a las 8:00 de México, que es cuando abre la ventana de avisos.
    v_hasta := ((((now() AT TIME ZONE 'America/Mexico_City')::date + 1)
                 + time '08:00') AT TIME ZONE 'America/Mexico_City');
  ELSE
    v_hasta := now() + make_interval(mins => GREATEST(p_minutos, 5));
  END IF;

  INSERT INTO public.alarma_pospuesta (user_id, tipo, referencia_id, hasta, veces)
  VALUES (v_uid, p_tipo, p_referencia_id, v_hasta, 1)
  ON CONFLICT (user_id, tipo, referencia_id) DO UPDATE
    SET hasta = EXCLUDED.hasta,
        veces = public.alarma_pospuesta.veces + 1;

  RETURN jsonb_build_object('ok', true, 'hasta', v_hasta);
END $fn$;
