-- Permite borrar artículos de la tienda aunque tengan compras asociadas.
-- Las compras existentes conservan su historial con item_id = NULL
-- (get_compras_tienda ya usa COALESCE para mostrar "Artículo eliminado").
ALTER TABLE public.store_compras ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.store_compras DROP CONSTRAINT IF EXISTS store_compras_item_id_fkey;
ALTER TABLE public.store_compras
  ADD CONSTRAINT store_compras_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.store_items(id) ON DELETE SET NULL;
