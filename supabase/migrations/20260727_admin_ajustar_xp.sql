-- Faltaba la función admin_ajustar_xp (solo existía la de monedas), por eso
-- "quitar XP" desde el panel admin daba "Could not find the function".
-- La app ya la llama con (p_target_user_id, p_cantidad, p_concepto) y espera
-- {ok, nuevo_xp}. p_cantidad puede ser negativo (quitar XP).
CREATE OR REPLACE FUNCTION public.admin_ajustar_xp(p_target_user_id uuid, p_cantidad integer, p_concepto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old   integer;
  v_new   integer;
  v_delta integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo admins pueden ajustar XP');
  END IF;

  SELECT xp INTO v_old FROM public.user_stats WHERE id = p_target_user_id FOR UPDATE;
  v_old := COALESCE(v_old, 0);
  v_new := GREATEST(v_old + p_cantidad, 0);   -- nunca por debajo de 0
  v_delta := v_new - v_old;                    -- lo que realmente cambió

  INSERT INTO public.user_stats (id, xp, valera_coins)
  VALUES (p_target_user_id, v_new, 0)
  ON CONFLICT (id) DO UPDATE SET xp = v_new;

  -- Se registra el DELTA real (así el histórico y el ranking mensual cuadran).
  IF v_delta <> 0 THEN
    INSERT INTO public.xp_transactions (user_id, cantidad, concepto)
    VALUES (p_target_user_id, v_delta, p_concepto);
  END IF;

  RETURN jsonb_build_object('ok', true, 'nuevo_xp', v_new);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_ajustar_xp(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_ajustar_xp(uuid, integer, text) TO authenticated;
