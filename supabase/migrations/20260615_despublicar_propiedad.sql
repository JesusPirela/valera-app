-- =============================================================================
-- Deshacer publicacion (para clicks por error en "Publicar").
--
-- 1. Arregla fn_log_publicacion: antes registraba una publicacion en CUALQUIER
--    UPDATE de la fila con publicada=true (incluso al despublicar). Ahora solo
--    registra cuando veces_publicada aumenta.
-- 2. Nuevo RPC despublicar_propiedad: revierte la ultima publicacion completa:
--    - resta 1 a veces_publicada (y despublica si llega a 0)
--    - borra el evento mas reciente de publicacion_log (estadisticas)
--    - recalcula fecha_publicacion a la publicacion anterior
--    - revierte la gamificacion del publish (-10 XP, -2 coins, contador)
-- =============================================================================

-- ── 1. Trigger: solo loguear publicaciones reales ────────────────────────────
CREATE OR REPLACE FUNCTION fn_log_publicacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.publicada = TRUE AND (
       TG_OP = 'INSERT'
       OR NEW.veces_publicada > COALESCE(OLD.veces_publicada, 0)
     ) THEN
    INSERT INTO public.publicacion_log (propiedad_id, user_id)
    VALUES (NEW.propiedad_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. RPC para deshacer la ultima publicacion ───────────────────────────────
CREATE OR REPLACE FUNCTION public.despublicar_propiedad(p_propiedad_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_veces  INTEGER;
  v_nuevas INTEGER;
  v_ultima TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT veces_publicada INTO v_veces
  FROM propiedad_publicacion
  WHERE propiedad_id = p_propiedad_id AND user_id = v_user
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_veces, 0) <= 0 THEN
    RETURN json_build_object('ok', FALSE, 'error', 'No hay publicaciones que deshacer');
  END IF;

  v_nuevas := v_veces - 1;

  -- Borrar el evento mas reciente del log (mantiene estadisticas correctas)
  DELETE FROM publicacion_log
  WHERE id = (
    SELECT id FROM publicacion_log
    WHERE propiedad_id = p_propiedad_id AND user_id = v_user
    ORDER BY created_at DESC
    LIMIT 1
  );

  -- La fecha de ultima publicacion pasa a ser la del evento anterior
  SELECT MAX(created_at) INTO v_ultima
  FROM publicacion_log
  WHERE propiedad_id = p_propiedad_id AND user_id = v_user;

  UPDATE propiedad_publicacion
  SET veces_publicada   = v_nuevas,
      publicada         = (v_nuevas > 0),
      fecha_publicacion = v_ultima
  WHERE propiedad_id = p_propiedad_id AND user_id = v_user;

  -- Revertir gamificacion del publish (+10 XP, +2 coins, total_propiedades)
  UPDATE user_stats SET
    xp                = GREATEST(COALESCE(xp, 0) - 10, 0),
    valera_coins      = GREATEST(COALESCE(valera_coins, 0) - 2, 0),
    total_propiedades = GREATEST(COALESCE(total_propiedades, 0) - 1, 0)
  WHERE id = v_user;

  INSERT INTO coin_transactions (user_id, cantidad, concepto)
  VALUES (v_user, -2, 'Publicacion deshecha');

  RETURN json_build_object(
    'ok', TRUE,
    'veces_publicada', v_nuevas,
    'fecha_publicacion', v_ultima
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.despublicar_propiedad(UUID) TO authenticated;
