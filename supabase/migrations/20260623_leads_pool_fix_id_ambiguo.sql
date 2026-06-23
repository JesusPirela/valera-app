-- Fix: "column reference id is ambiguous" en las RPCs del pool de leads.
-- Las funciones con RETURNS TABLE declaran un output column "id" que chocaba
-- con "profiles.id" en las subqueries de validación. Se califica con alias "pr".

CREATE OR REPLACE FUNCTION public.get_leads_pool_disponibles()
RETURNS TABLE (
  id           UUID,
  nombre       TEXT,
  telefono     TEXT,
  zona_interes TEXT,
  nota         TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT lp.id, lp.nombre, lp.telefono, lp.zona_interes, lp.nota, lp.created_at
  FROM public.leads_pool lp
  WHERE lp.estado = 'disponible'
  ORDER BY lp.created_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_leads_pool_disponibles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leads_pool_historial()
RETURNS TABLE (
  id                UUID,
  nombre            TEXT,
  telefono          TEXT,
  zona_interes      TEXT,
  fuente_asignacion TEXT,
  asignado_at       TIMESTAMPTZ,
  usuario_nombre    TEXT,
  usuario_id        UUID,
  cliente_id        UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT
    lp.id,
    lp.nombre,
    lp.telefono,
    lp.zona_interes,
    lp.fuente_asignacion,
    lp.asignado_at,
    COALESCE(p.nombre, 'Usuario desconocido')::TEXT,
    lp.asignado_a,
    lp.cliente_id
  FROM public.leads_pool lp
  LEFT JOIN public.profiles p ON p.id = lp.asignado_a
  WHERE lp.estado = 'asignado'
  ORDER BY lp.asignado_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_leads_pool_historial TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_agregar_lead_pool(
  p_telefono     TEXT,
  p_nombre       TEXT    DEFAULT NULL,
  p_zona_interes TEXT    DEFAULT NULL,
  p_nota         TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF trim(COALESCE(p_telefono,'')) = '' THEN
    RAISE EXCEPTION 'El telefono es obligatorio';
  END IF;
  INSERT INTO public.leads_pool (nombre, telefono, zona_interes, nota, created_by)
  VALUES (
    NULLIF(trim(p_nombre),''), trim(p_telefono),
    NULLIF(trim(p_zona_interes),''), NULLIF(trim(p_nota),''),
    auth.uid()
  )
  RETURNING leads_pool.id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_agregar_lead_pool TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_eliminar_lead_pool(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.leads_pool WHERE leads_pool.id = p_lead_id AND estado = 'disponible';
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_eliminar_lead_pool TO authenticated;
