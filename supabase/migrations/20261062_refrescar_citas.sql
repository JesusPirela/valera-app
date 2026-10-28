-- Poder poner a cero el contador de "Nd sin movimiento" sin falsear nada.
--
-- Ese aviso sale de updated_at. Lo directo sería tocarlas todas y dejar
-- updated_at en ahora, pero eso rompe tres cosas a la vez:
--
--   · El KPI "Cancel. mes" cuenta las canceladas cuyo updated_at cae en el mes
--     en curso. Hay 50 canceladas en total y 11 este mes: resetear haría que
--     las 50 parecieran de este mes.
--   · La tarjeta dice "Actualizada: hace X", que pasaría a mentir en las 628.
--   · El tablero ordena por updated_at; con todas en la misma hora, el orden
--     se vuelve arbitrario.
--
-- Por eso se guarda aparte CUÁNDO SE REVISÓ, que es otra cosa que cuándo se
-- tocó. El aviso mira la más reciente de las dos, y updated_at sigue contando
-- la verdad de siempre.
ALTER TABLE public.citas_coordinacion
  ADD COLUMN IF NOT EXISTS revisada_at timestamptz;

COMMENT ON COLUMN public.citas_coordinacion.revisada_at IS
  'Cuándo se repasó la cita en el tablero. Pone a cero el aviso de "sin movimiento" sin tocar updated_at, que es el historial real.';

-- ── Repasar todas de una vez ─────────────────────────────────────────────
-- Sólo las ACTIVAS: una cita realizada o cancelada ya no tiene por qué
-- avisar de nada, y marcarlas sería ensuciar el dato.
CREATE OR REPLACE FUNCTION public.refrescar_citas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text; v_n int;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  -- Con IS DISTINCT FROM / NOT IN sobre un rol NULL el IF no entra y el
  -- guardia no guarda nada; por eso se comprueba el NULL aparte.
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'gerente', 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sólo coordinación puede repasar el tablero.');
  END IF;

  UPDATE public.citas_coordinacion
     SET revisada_at = now()
   WHERE estado IN ('por_contactar','primer_contacto','buscando_opciones','en_coordinacion',
                    'coordinada','reagendada','no_responde_asesor',
                    'recaudando_documentacion','aprobando_credito');

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'citas', v_n);
END $fn$;

GRANT EXECUTE ON FUNCTION public.refrescar_citas() TO authenticated;
