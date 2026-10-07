-- Unifica los estados de seguimiento: un solo nombre por cada cosa.
--
-- Había 21 variantes para 10 estados reales. "APARTADO", "apartado",
-- "Aparto/Compro" y "Apartó" son lo mismo; "REAGENDADA", "Reagenda",
-- "Reagendada" y "REAGENDA" también. Eso rompe cualquier conteo: el mismo
-- estado aparece como cuatro cosas distintas en las gráficas y en los filtros.
--
-- Se deja todo con los nombres del TABLERO DEL ASESOR, que es el vocabulario
-- que la gente ya usa y el que ahora ofrece el selector de la tabla.

-- Respaldo antes de tocar nada.
CREATE TABLE IF NOT EXISTS public.citas_venta_estado_respaldo AS
  SELECT id, estado_seguimiento, now() AS respaldado_at FROM public.citas_venta;

-- ── Las equivalencias ────────────────────────────────────────────────────────
-- Se compara sin acentos, sin signos y en minúsculas, para que no haya que
-- enumerar cada combinación de mayúsculas.
WITH equivalencias(patron, destino) AS (VALUES
  -- Apartó: 17 filas repartidas en 4 escrituras distintas.
  ('apartado',             'Apartó'),
  ('aparto',               'Apartó'),
  ('apartocompro',         'Apartó'),
  -- Reagendada: 53 filas en 4 escrituras.
  ('reagendada',           'Reagendada'),
  ('reagenda',             'Reagendada'),
  -- Cancelada. "CANCELADA/REAGENDA" es el valor que escribía el botón de
  -- cancelar cuando los dos estados eran uno solo; ahora van separados y en
  -- ese texto manda la cancelación, igual que en los colores de la tabla.
  -- "Descartado" es el mismo concepto: en el tablero de coordinación, el
  -- estado 'cancelada' se llama justo "Descartados".
  ('canceladareagenda',    'Cancelada'),
  ('cancelada',            'Cancelada'),
  ('descartado',           'Cancelada'),
  -- Esperando retro / realizada: se decide abajo según tenga retro o no.
  ('esperando retro',      'Esperando retroalimentación'),
  -- El resto.
  ('enviar mas opciones',  'Buscar más opciones'),
  ('seguimiento de cierre','Seguim. cierre · alto interés'),
  ('bajo interes',         'Seguim. cierre · bajo interés'),
  ('cierre a futuro',      'Compra a futuro'),
  ('coordinada',           'Por atender'),
  ('no contesta',          'No responde el cliente'),
  ('cliente no perfilado', 'Falta perfilar / crédito')
)
UPDATE public.citas_venta cv
   SET estado_seguimiento = e.destino
  FROM equivalencias e
 WHERE public.normaliza_nombre(cv.estado_seguimiento) = e.patron
   AND cv.estado_seguimiento IS DISTINCT FROM e.destino;

-- ── "realizada" depende de si ya tiene retro ─────────────────────────────────
-- El tablero del asesor llama al estado 'realizada' "Esperando
-- retroalimentación", y eso es correcto mientras falte la retro. Pero 39 de
-- esas 74 citas YA la tienen escrita: decirles que la están esperando sería
-- mentira. Las que ya la tienen quedan como "Realizada".
UPDATE public.citas_venta
   SET estado_seguimiento = CASE
         WHEN retro_completada_at IS NOT NULL THEN 'Realizada'
         ELSE 'Esperando retroalimentación'
       END
 WHERE public.normaliza_nombre(estado_seguimiento) = 'realizada';

-- ── El botón de cancelar deja de escribir el texto mezclado ──────────────────
-- Escribía siempre 'CANCELADA/REAGENDA'. Ahora que Reagendada y Cancelada son
-- estados separados, recibe cuál poner. Por defecto 'Cancelada', para que
-- cualquier llamada vieja siga funcionando igual que antes.
CREATE OR REPLACE FUNCTION public.cancelar_cita_venta(p_id uuid, p_estado text DEFAULT 'Cancelada')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text; v_ases uuid; v_cc uuid; v_estado text;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  SELECT asesor_id, cita_coordinacion_id INTO v_ases, v_cc FROM citas_venta WHERE id = p_id;
  IF v_rol NOT IN ('admin','supervisor','gerente') AND (v_ases IS NULL OR v_ases <> auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Solo se aceptan los dos valores que tienen sentido aquí: si llegara otra
  -- cosa, volveríamos a ensuciar la columna que acabamos de limpiar.
  v_estado := CASE WHEN p_estado = 'Reagendada' THEN 'Reagendada' ELSE 'Cancelada' END;

  IF v_cc IS NOT NULL THEN
    UPDATE citas_coordinacion
       SET estado = CASE WHEN v_estado = 'Reagendada' THEN 'reagendada' ELSE 'cancelada' END
     WHERE id = v_cc;
  END IF;
  UPDATE citas_venta SET estado_seguimiento = v_estado WHERE id = p_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.cancelar_cita_venta(uuid, text) TO authenticated;

-- ── Qué quedó ────────────────────────────────────────────────────────────────
SELECT estado_seguimiento AS valor, COUNT(*) AS n
  FROM public.citas_venta
 WHERE nullif(trim(estado_seguimiento), '') IS NOT NULL
 GROUP BY 1 ORDER BY 2 DESC;
