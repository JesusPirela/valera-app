-- Mover los clientes del CRM de una persona a otra, de un golpe.
--
-- Hasta ahora sólo se podía reasignar de uno en uno, entrando al cliente. Con
-- 452 clientes en la cartera más grande, mover a alguien que se va era
-- impracticable y acababa sin hacerse: los clientes se quedaban colgados de
-- una cuenta que ya nadie abre.
--
-- Va como función y no como un UPDATE desde la app por dos razones: el guardia
-- de rol se comprueba en el servidor (si no, bastaría llamar la tabla directo),
-- y así se puede devolver cuántos se movieron de verdad.
CREATE OR REPLACE FUNCTION public.mover_clientes(
  p_de uuid, p_a uuid, p_solo_vivos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text; v_n int; v_existe boolean;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  -- Con un rol NULL, "NOT IN (...)" da NULL y el IF no entra: el guardia no
  -- guardaría nada. Por eso el NULL se comprueba aparte.
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'gerente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sólo dirección puede mover carteras.');
  END IF;

  IF p_de IS NULL OR p_a IS NULL OR p_de = p_a THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hay que elegir dos personas distintas.');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_a) INTO v_existe;
  IF NOT v_existe THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La persona de destino no existe.');
  END IF;

  -- "Vivos" = los que todavía se trabajan. Se dejan fuera los cerrados y los
  -- descartados: mover un histórico no sirve de nada y ensucia la cartera de
  -- quien lo recibe.
  UPDATE public.clientes
     SET responsable_id = p_a, updated_at = now()
   WHERE responsable_id = p_de
     AND eliminado_at IS NULL
     AND (NOT p_solo_vivos
          OR estado NOT IN ('compro', 'compro_externo', 'descartado'));

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'movidos', v_n);
END $fn$;

GRANT EXECUTE ON FUNCTION public.mover_clientes(uuid, uuid, boolean) TO authenticated;

-- ── Cuántos se moverían ──────────────────────────────────────────────────
-- Para poder decir el número ANTES de confirmar, en vez de mover a ciegas.
CREATE OR REPLACE FUNCTION public.contar_clientes_a_mover(p_de uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT jsonb_build_object(
    'todos', count(*),
    'vivos', count(*) FILTER (WHERE estado NOT IN ('compro', 'compro_externo', 'descartado'))
  )
  FROM public.clientes
  WHERE responsable_id = p_de AND eliminado_at IS NULL;
$fn$;

GRANT EXECUTE ON FUNCTION public.contar_clientes_a_mover(uuid) TO authenticated;
