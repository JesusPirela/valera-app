-- Rellena huecos de teléfono/prospecto/coordino/atendio/forma de pago en
-- citas_venta (excel) cruzando por nombre de cliente con el dashboard de citas y
-- el perfil del cliente. Se llama al terminar cada importación del Excel.
CREATE OR REPLACE FUNCTION public.backfill_citas_venta()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  IF v_rol NOT IN ('admin', 'supervisor')
     AND current_setting('request.jwt.claims', true)::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  WITH citas AS (
    SELECT translate(lower(trim(cl.nombre)), 'áéíóúñ', 'aeioun') AS nn,
           cl.telefono, cl.tipo_credito,
           pc.nombre AS coord, pp.nombre AS prosp, pa.nombre AS ases, cc.asesor_id
    FROM citas_coordinacion cc
    JOIN clientes cl ON cl.id = cc.cliente_id
    LEFT JOIN profiles pc ON pc.id = cc.coordinado_por
    LEFT JOIN profiles pp ON pp.id = cc.prospectador_id
    LEFT JOIN profiles pa ON pa.id = cc.asesor_id
  ),
  best AS (
    SELECT nn,
      (array_agg(telefono)     FILTER (WHERE telefono     IS NOT NULL AND telefono <> ''))[1] AS telefono,
      (array_agg(tipo_credito) FILTER (WHERE tipo_credito IS NOT NULL AND tipo_credito <> ''))[1] AS tipo_credito,
      (array_agg(coord)        FILTER (WHERE coord        IS NOT NULL))[1] AS coord,
      (array_agg(prosp)        FILTER (WHERE prosp        IS NOT NULL))[1] AS prosp,
      (array_agg(ases)         FILTER (WHERE ases         IS NOT NULL))[1] AS ases,
      (array_agg(asesor_id)    FILTER (WHERE asesor_id    IS NOT NULL))[1] AS asesor_id
    FROM citas WHERE nn <> '' GROUP BY nn
  )
  UPDATE citas_venta cv
  SET telefono      = COALESCE(NULLIF(cv.telefono, ''),      b.telefono),
      detalles_pago = COALESCE(NULLIF(cv.detalles_pago, ''), b.tipo_credito),
      coordino      = COALESCE(NULLIF(cv.coordino, ''),      b.coord),
      prospecto     = COALESCE(NULLIF(cv.prospecto, ''),     b.prosp),
      atendio       = COALESCE(NULLIF(cv.atendio, ''),       b.ases),
      asesor_id     = COALESCE(cv.asesor_id, b.asesor_id)
  FROM best b
  WHERE cv.origen = 'excel'
    AND translate(lower(trim(cv.cliente_nombre)), 'áéíóúñ', 'aeioun') = b.nn;
END $$;
GRANT EXECUTE ON FUNCTION public.backfill_citas_venta() TO authenticated;
