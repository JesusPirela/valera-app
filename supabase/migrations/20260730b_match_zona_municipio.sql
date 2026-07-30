-- Ajuste de matching por zona: el MUNICIPIO sí debe contar como zona válida.
--
-- Antes (fix anterior) descartaba municipios (El Marqués, Corregidora…) para
-- evitar el "12 en todas". Pero eso es demasiado: si un cliente pone
-- "El Marqués" o "Corregidora", SÍ queremos mostrarle todas las propiedades de
-- ese municipio. Lo único que no queremos es que un cliente que puso el ESTADO
-- ("Querétaro"/"Qro") matchee con TODO (porque el estado está en la dirección
-- de todas las propiedades).
--
-- Por eso el stoplist se reduce a estado/región + basura, dejando los municipios
-- como señal válida. Además el match ahora es SIN ACENTOS ("El Marques" ==
-- "El Marqués").
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
         -- texto normalizado (minúsculas + sin acentos) para el match de zona
         translate(lower(coalesce(direccion,'') || ' ' || coalesce(titulo,'') || ' ' || coalesce(nombre_constructora,'')),
                   'áéíóúüñ', 'aeiouun')
  INTO v_prec, v_oper, v_texto
  FROM public.propiedades WHERE id = p_propiedad_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.nombre, c.telefono, c.estado, c.presupuesto, c.zona_busqueda
  FROM public.clientes c
  WHERE c.responsable_id = v_uid
    AND c.eliminado_at IS NULL
    AND c.estado NOT IN ('descartado', 'compro')
    -- Operación: si el cliente busca venta/renta, debe coincidir (restricción).
    AND (c.tipo_operacion IS NULL OR v_oper IS NULL OR c.tipo_operacion = v_oper)
    -- Presupuesto: el precio debe entrar en el tope del cliente (con 15% de
    -- tolerancia). presupuesto_max() entiende m/mil/k, decimales y rangos.
    AND (
      v_prec IS NULL
      OR public.presupuesto_max(c.presupuesto) IS NULL
      OR v_prec <= public.presupuesto_max(c.presupuesto) * 1.15
    )
    -- Zona: señal REQUERIDA. El cliente debe buscar una zona (fraccionamiento,
    -- colonia o MUNICIPIO) que aparezca en la propiedad. Sólo se descarta el
    -- ESTADO/región (Querétaro, Qro, otros estados) y valores basura, porque el
    -- estado está en la dirección de todas las propiedades. Match sin acentos.
    AND EXISTS (
      SELECT 1
      FROM regexp_split_to_table(coalesce(c.zona_busqueda, ''), ',') tok
      WHERE length(trim(tok)) >= 3
        AND translate(lower(trim(tok)), 'áéíóúüñ', 'aeiouun') NOT IN (
          -- estado / región (aparecen en casi toda dirección)
          'queretaro', 'qro', 'qro.', 'quer', 'edo queretaro',
          'nuevo leon', 'nl', 'puebla', 'mexico', 'cdmx',
          'ciudad de mexico', 'estado de mexico', 'edomex',
          -- basura / sin preferencia
          'no_conozco', 'no conozco', 'cualquiera', 'sin preferencia', 'indistinto', 'cualquier'
        )
        AND v_texto LIKE '%' || translate(lower(trim(tok)), 'áéíóúüñ', 'aeiouun') || '%'
    )
  ORDER BY c.updated_at DESC NULLS LAST
  LIMIT 12;
END;
$$;
