-- Tope diario de XP por descargar (fotos y fichas PDF).
--
-- Descargar es la acción más fácil de repetir de toda la app, así que sin tope
-- se podía subir de nivel dándole a descargar una y otra vez. Con esto, las
-- descargas aportan como mucho 200 XP por día (el resto de acciones —clientes,
-- seguimientos, cursos, ventas— no tienen tope).
--
-- Va en el SERVIDOR a propósito: si el tope viviera solo en la app, bastaría con
-- llamar al RPC de premios directamente para saltárselo.

CREATE OR REPLACE FUNCTION public.award_xp_descarga(
  p_xp       integer,
  p_concepto text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_hoy  date;
  v_ya   integer;
  v_dar  integer;
  TOPE   constant integer := 200;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no autenticado');
  END IF;

  -- El día se cuenta en hora de México, igual que las misiones y la racha; si se
  -- usara UTC el tope se reiniciaría a las 6 de la tarde.
  v_hoy := (now() AT TIME ZONE 'America/Mexico_City')::date;

  -- Se incluye el concepto viejo ('Fotos descargadas') para que lo que ya se
  -- otorgó hoy siga contando y no se regale un tope nuevo al desplegar.
  SELECT COALESCE(SUM(cantidad), 0) INTO v_ya
  FROM public.xp_transactions
  WHERE user_id = v_uid
    AND concepto IN (p_concepto, 'Fotos descargadas 📥')
    AND (created_at AT TIME ZONE 'America/Mexico_City')::date = v_hoy;

  v_dar := LEAST(GREATEST(p_xp, 0), GREATEST(TOPE - v_ya, 0));

  IF v_dar <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'otorgado', 0, 'tope_alcanzado', true,
                              'hoy', v_ya, 'tope', TOPE);
  END IF;

  INSERT INTO public.user_stats (id, xp, valera_coins)
  VALUES (v_uid, v_dar, 0)
  ON CONFLICT (id) DO UPDATE SET xp = user_stats.xp + v_dar;

  INSERT INTO public.xp_transactions (user_id, cantidad, concepto)
  VALUES (v_uid, v_dar, p_concepto);

  RETURN jsonb_build_object('ok', true, 'otorgado', v_dar,
                            'tope_alcanzado', (v_ya + v_dar) >= TOPE,
                            'hoy', v_ya + v_dar, 'tope', TOPE);
END;
$$;

REVOKE ALL ON FUNCTION public.award_xp_descarga(integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.award_xp_descarga(integer, text) TO authenticated;
