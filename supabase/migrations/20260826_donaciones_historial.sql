-- Historial de donaciones (solo admin/supervisor). Devuelve el log reciente.
CREATE OR REPLACE FUNCTION public.get_donaciones_historial()
RETURNS TABLE(id uuid, donante_nombre text, tipo text, cliente_nombre text, destino_nombre text, creado_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_rol text;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
    SELECT d.id, d.donante_nombre, d.tipo, d.cliente_nombre, d.destino_nombre, d.creado_at
    FROM donaciones d ORDER BY d.creado_at DESC LIMIT 500;
END $fn$;
