-- Conteo de compras/cofres pendientes de atención (para el badge en el menú
-- admin "Tienda"). Solo admin/supervisor; otros reciben 0.
CREATE OR REPLACE FUNCTION public.get_compras_pendientes_count()
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::int
  FROM public.store_compras sc
  WHERE sc.estado = 'pendiente'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor')
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_pendientes_count() TO authenticated;
SELECT pg_notify('pgrst', 'reload schema');
