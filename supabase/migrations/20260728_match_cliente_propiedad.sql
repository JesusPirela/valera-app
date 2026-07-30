-- Matching propiedad → clientes: dado una propiedad, devuelve los clientes del
-- AGENTE (auth.uid) a los que les "sirve" según operación, presupuesto y zona.
-- Sirve para el detalle de propiedad: "esta casa le sirve a Juan".
CREATE OR REPLACE FUNCTION public.clientes_para_propiedad(p_propiedad_id uuid)
RETURNS TABLE(id uuid, nombre text, telefono text, estado text, presupuesto text, zona_busqueda text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_prec  numeric;
  v_oper  text;
  v_texto text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT precio, operacion,
         lower(coalesce(direccion,'') || ' ' || coalesce(titulo,'') || ' ' || coalesce(nombre_constructora,''))
  INTO v_prec, v_oper, v_texto
  FROM public.propiedades WHERE id = p_propiedad_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.nombre, c.telefono, c.estado, c.presupuesto, c.zona_busqueda
  FROM public.clientes c
  WHERE c.responsable_id = v_uid
    AND c.eliminado_at IS NULL
    AND c.estado NOT IN ('descartado', 'compro')
    -- Operación: si el cliente busca venta/renta, debe coincidir.
    AND (c.tipo_operacion IS NULL OR v_oper IS NULL OR c.tipo_operacion = v_oper)
    -- Presupuesto: si se puede parsear un número creíble (>=100k), el precio debe
    -- entrar (con 15% de tolerancia). Se toma el MAYOR número del texto (evita
    -- concatenar "$1,500,000 o hasta $800k"). Si no se puede parsear, no filtra.
    AND (
      v_prec IS NULL
      OR COALESCE((SELECT max((replace(m[1], ',', ''))::numeric)
                   FROM regexp_matches(coalesce(c.presupuesto, ''), '[0-9][0-9,]*', 'g') m), 0) < 100000
      OR v_prec <= (SELECT max((replace(m[1], ',', ''))::numeric)
                    FROM regexp_matches(coalesce(c.presupuesto, ''), '[0-9][0-9,]*', 'g') m) * 1.15
    )
    -- Zona: alguna de las zonas del cliente (separadas por coma) aparece en la
    -- propiedad. Si el cliente no tiene zona, no filtra por zona.
    AND (
      coalesce(trim(c.zona_busqueda), '') = ''
      OR EXISTS (
        SELECT 1 FROM regexp_split_to_table(c.zona_busqueda, ',') tok
        WHERE length(trim(tok)) >= 3 AND v_texto LIKE '%' || lower(trim(tok)) || '%'
      )
    )
  ORDER BY c.updated_at DESC NULLS LAST
  LIMIT 12;
END;
$$;
REVOKE ALL ON FUNCTION public.clientes_para_propiedad(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.clientes_para_propiedad(uuid) TO authenticated;
