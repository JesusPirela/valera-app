-- El kanban de coordinación de citas pasa a usar solo 5 estados nuevos
-- (aparto, recaudando_documentacion, aprobando_credito, firma_contrato,
-- escrituracion para venta; los mismos menos aprobando_credito/escrituracion
-- para renta). Los estados viejos del pipeline de coordinación inicial
-- (por_contactar, primer_contacto, buscando_opciones, en_coordinacion,
-- coordinada, reagendada, no_responde_asesor, realizada, cancelada) ya no
-- tienen columna en el tablero — las citas que quedaron en esos estados se
-- migran a 'aparto' para que no queden "perdidas" sin aparecer en ningún board.

UPDATE public.citas_coordinacion
SET estado = 'aparto'
WHERE estado NOT IN (
  'aparto', 'recaudando_documentacion', 'aprobando_credito', 'firma_contrato', 'escrituracion'
);
