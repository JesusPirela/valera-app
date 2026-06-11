-- Índice para acelerar la carga del CRM de admin/supervisor,
-- que lista TODOS los clientes ordenados por updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_clientes_updated_at ON clientes(updated_at DESC);
