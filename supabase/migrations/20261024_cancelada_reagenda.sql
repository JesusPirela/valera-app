-- El estado "Cancelada" se llama "Cancelada/Reagenda".
--
-- Es el nombre que usa el equipo: cuando una cita no se dio, se reporta así
-- —cancelada o por reagendar— y se decide después. Queda aparte de
-- "Reagendada", que es cuando YA tiene fecha nueva.
--
-- Las funciones que clasifican siguen valiendo tal cual: esCancelada busca
-- "cancel" (lo encuentra) y esReagendada pide "reagend" SIN "cancel", así que
-- este texto cuenta como cancelada y no se cuela en las dos.
UPDATE public.citas_venta
   SET estado_seguimiento = 'Cancelada/Reagenda'
 WHERE estado_seguimiento = 'Cancelada';

-- El botón de cancelar escribe el nombre nuevo.
CREATE OR REPLACE FUNCTION public.cancelar_cita_venta(p_id uuid, p_estado text DEFAULT 'Cancelada/Reagenda')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text; v_ases uuid; v_cc uuid; v_estado text;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  SELECT asesor_id, cita_coordinacion_id INTO v_ases, v_cc FROM citas_venta WHERE id = p_id;
  IF v_rol NOT IN ('admin','supervisor','gerente') AND (v_ases IS NULL OR v_ases <> auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_estado := CASE WHEN p_estado = 'Reagendada' THEN 'Reagendada' ELSE 'Cancelada/Reagenda' END;

  IF v_cc IS NOT NULL THEN
    UPDATE citas_coordinacion
       SET estado = CASE WHEN v_estado = 'Reagendada' THEN 'reagendada' ELSE 'cancelada' END
     WHERE id = v_cc;
  END IF;
  UPDATE citas_venta SET estado_seguimiento = v_estado WHERE id = p_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.cancelar_cita_venta(uuid, text) TO authenticated;

SELECT estado_seguimiento AS valor, COUNT(*) AS n
  FROM public.citas_venta
 WHERE estado_seguimiento ILIKE '%cancel%' OR estado_seguimiento ILIKE '%reagend%'
 GROUP BY 1 ORDER BY 2 DESC;
