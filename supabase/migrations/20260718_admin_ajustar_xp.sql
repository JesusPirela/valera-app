-- RPC admin para ajustar XP manualmente (correcciones históricas, bonos, etc.)
-- Paralelo a admin_ajustar_monedas que ya existe para coins.

CREATE OR REPLACE FUNCTION public.admin_ajustar_xp(
  p_target_user_id UUID,
  p_cantidad        INTEGER,
  p_concepto        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rol      TEXT;
  v_xp_nuevo INTEGER;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  INSERT INTO public.user_stats (id, xp)
  VALUES (p_target_user_id, GREATEST(p_cantidad, 0))
  ON CONFLICT (id) DO UPDATE SET
    xp = GREATEST(user_stats.xp + p_cantidad, 0);

  SELECT xp INTO v_xp_nuevo FROM public.user_stats WHERE id = p_target_user_id;

  -- Registrar en xp_transactions para historial
  IF p_cantidad <> 0 THEN
    INSERT INTO public.xp_transactions (user_id, cantidad, concepto)
    VALUES (p_target_user_id, p_cantidad, p_concepto);
  END IF;

  RETURN jsonb_build_object('ok', true, 'nuevo_xp', v_xp_nuevo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ajustar_xp(UUID, INTEGER, TEXT) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
