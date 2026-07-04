-- ═══════════════════════════════════════════════════════════════════════════
-- Índices de rendimiento (auditoría 03/jul/2026)
--
-- Causa raíz #1 detectada con pg_stat_user_tables: propiedad_imagenes tenía
-- 24,021,212 escaneos secuenciales (100% seq) contra 265 por índice, sobre 25k
-- filas. Cada carga de portada (listas de propiedades, CRM, detalle, historial)
-- filtra por propiedad_id y, SIN índice, escaneaba la tabla completa. Es el mayor
-- cuello de botella de la app: afecta prácticamente todas las pantallas.
--
-- coin_transactions y publicacion_log tenían el mismo problema en sus filtros
-- más comunes (user_id / propiedad_id).
--
-- Ya aplicados en producción vía Management API; este archivo los deja versionados.
-- ═══════════════════════════════════════════════════════════════════════════

-- Portada / galería por propiedad, ordenada por `orden` (cubre el patrón exacto
-- de la app: WHERE propiedad_id IN (...) ORDER BY orden).
CREATE INDEX IF NOT EXISTS idx_propiedad_imagenes_prop_orden
  ON public.propiedad_imagenes(propiedad_id, orden);

-- Historial/monedas del usuario: WHERE user_id = ... ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_coin_tx_user_created
  ON public.coin_transactions(user_id, created_at DESC);

-- Panel de publicadores / conteos por propiedad: WHERE propiedad_id = ...
CREATE INDEX IF NOT EXISTS idx_publicacion_log_propiedad
  ON public.publicacion_log(propiedad_id);

ANALYZE public.propiedad_imagenes;
ANALYZE public.coin_transactions;
ANALYZE public.publicacion_log;
