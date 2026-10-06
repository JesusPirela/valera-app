-- ══════════════════════════════════════════════════════════════════════════════
-- Backfill de estado_mx en asesores_externos ya existentes (se agregó la
-- columna en 20261006_asesores_externos_estado_mx.sql, pero quedó NULL para
-- los que ya estaban registrados — sin estado, el filtro por estado del panel
-- no los agrupa).
--
-- Reusa detectar_estado_mx() (de 20260818_estado_mx_estructurado.sql, la misma
-- función que ya usa `propiedades`) sobre el texto de `zona`, para no inventar
-- una segunda heurística.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.asesores_externos
SET estado_mx = public.detectar_estado_mx(zona)
WHERE estado_mx IS NULL AND zona IS NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');

-- Nota: zonas ambiguas como "San Juan" o "SJR" (sin "del Río") no las detecta
-- la función y quedan sin estado — hay que ponérselo a mano desde "✎" en esas
-- fichas (ya con el picker de Estado + zona de Querétaro).
