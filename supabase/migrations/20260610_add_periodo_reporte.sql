-- Agregar columna periodo_reporte a report_programados
-- Para que cada programación sepa de qué período debe generar el reporte

ALTER TABLE public.report_programados
ADD COLUMN IF NOT EXISTS periodo_reporte TEXT NOT NULL DEFAULT '7dias'
  CHECK (periodo_reporte IN ('24h', '7dias', '30dias'));
