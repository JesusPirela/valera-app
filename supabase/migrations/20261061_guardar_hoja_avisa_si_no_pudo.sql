-- Guardar una hoja de ruta ajena fallaba EN SILENCIO.
--
-- La función sobrescribe por token, pero sólo si la hoja es de quien llama
-- (ON CONFLICT ... WHERE creada_por = auth.uid()). Cuando no lo era, el UPDATE
-- no tocaba ninguna fila y la función devolvía 'ok' igual: la pantalla decía
-- "link actualizado" y el documento seguía como estaba.
--
-- Pasa de verdad: un admin ve en su lista las hojas de todo el equipo (la
-- política de lectura se lo permite), así que puede abrir una ajena, corregirla
-- y creer que la guardó.
--
-- Ahora se comprueba si de verdad se escribió y, si no, se dice por qué.

CREATE OR REPLACE FUNCTION public.guardar_hoja_de_ruta(
  p_cliente_id uuid, p_fecha text, p_perfil jsonb, p_paradas jsonb,
  p_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_token text; v_rol text; v_escritas int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- De asesor para arriba, igual que la pantalla. Sin esto, cualquiera con la
  -- sesión abierta podría crear hojas llamando la función directo.
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('asesor', 'supervisor', 'gerente', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta pantalla es para asesores y coordinación.');
  END IF;

  -- pgcrypto vive en el esquema extensions y esta función fija search_path a
  -- public, así que gen_random_bytes no se alcanza sin calificarlo.
  v_token := COALESCE(NULLIF(p_token, ''), encode(extensions.gen_random_bytes(24), 'hex'));

  INSERT INTO public.hojas_de_ruta (token, cliente_id, creada_por, fecha, perfil, paradas)
  VALUES (v_token, p_cliente_id, auth.uid(), p_fecha, p_perfil, p_paradas)
  ON CONFLICT (token) DO UPDATE
    SET fecha = EXCLUDED.fecha, perfil = EXCLUDED.perfil,
        paradas = EXCLUDED.paradas, updated_at = now()
    WHERE hojas_de_ruta.creada_por = auth.uid();

  GET DIAGNOSTICS v_escritas = ROW_COUNT;

  IF v_escritas = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'ajena',
      'mensaje', 'Esa hoja la creó otra persona, así que no se puede sobrescribir. Guárdala como una nueva.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'token', v_token);
END $fn$;

GRANT EXECUTE ON FUNCTION public.guardar_hoja_de_ruta(uuid, text, jsonb, jsonb, text) TO authenticated;
