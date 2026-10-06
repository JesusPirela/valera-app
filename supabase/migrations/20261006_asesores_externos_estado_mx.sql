-- ══════════════════════════════════════════════════════════════════════════════
-- Panel de Asesores externos: ahora se les puede poner el ESTADO de México en
-- el que apoyan (además de la zona). La zona ya existía como texto libre; se
-- mantiene así (para Querétaro la UI la restringe al catálogo canónico de
-- lib/zonas-interes.ts, pero a nivel de columna sigue siendo TEXT libre, igual
-- que `propiedades.estado_mx`, para no tener que mantener un CHECK con los 32
-- estados).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.asesores_externos
  ADD COLUMN IF NOT EXISTS estado_mx TEXT;

CREATE INDEX IF NOT EXISTS idx_asesores_externos_estado_mx ON public.asesores_externos(estado_mx);
CREATE INDEX IF NOT EXISTS idx_asesores_externos_zona      ON public.asesores_externos(zona);

SELECT pg_notify('pgrst', 'reload schema');
