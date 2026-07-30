-- FIX matching propiedad → clientes: antes recomendaba ~12 clientes en CASI
-- todas las propiedades. Dos causas:
--
--   1. ZONA demasiado gruesa. La dirección de casi toda propiedad incluye el
--      MUNICIPIO (El Marqués, Corregidora) y el ESTADO (Querétaro). Como
--      muchísimos clientes tienen esos términos en zona_busqueda ("El Marqués"
--      lo usan 100+ clientes), coincidían con TODO. Además, si el cliente no
--      tenía zona, la condición "OR zona vacía" dejaba pasar todo.
--
--   2. PRESUPUESTO casi nunca se parseaba. La mayoría de los clientes lo captura
--      como "$900mil_a_$1.2m", "$2m_a_$2,4m", "1.4M", "8k", "1.600.000"… El
--      parser viejo sólo entendía comas de miles ("1,600,000"), así que el
--      resto quedaba como "sin presupuesto" y el filtro de precio no aplicaba.
--
-- Arreglo:
--   • presupuesto_max(): entiende m/mil/k, decimales con coma o punto, miles con
--     coma o punto, y rangos (toma el tope). Devuelve el máximo en pesos o NULL.
--   • La zona pasa a ser señal REQUERIDA y ESPECÍFICA (se ignoran municipio/
--     estado/ciudad).

-- ── Parser de presupuesto en texto libre → número máximo (pesos) ──────────────
CREATE OR REPLACE FUNCTION public.presupuesto_max(txt text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  s text; m text[]; num text; unit text; val numeric; best numeric := 0;
BEGIN
  IF txt IS NULL THEN RETURN NULL; END IF;
  s := lower(txt);
  s := replace(replace(s, '_', ' '), '$', ' ');
  -- Cada número con su unidad opcional (mil antes que m en la alternancia).
  FOR m IN SELECT regexp_matches(s, '(\d[\d.,]*)\s*(millones|millon|mdp|mil|m|k)?', 'g') LOOP
    num := m[1]; unit := coalesce(m[2], ''); val := NULL;
    BEGIN
      IF unit IN ('m','millon','millones','mdp') THEN
        val := replace(num, ',', '.')::numeric * 1000000;        -- "2,4m" / "1.2m" → millones
      ELSIF unit IN ('mil','k') THEN
        val := replace(replace(num, ',', ''), '.', '')::numeric * 1000;  -- "900mil" / "8k"
      ELSE
        IF num ~ '^\d{1,3}([.,]\d{3})+$' THEN                     -- miles: 1,600,000 / 1.600.000
          val := replace(replace(num, ',', ''), '.', '')::numeric;
        ELSIF num ~ '^\d{1,2}[.,]\d{1,2}$' THEN                   -- decimal suelto: 1.9 / 2,4 → millones
          val := replace(num, ',', '.')::numeric * 1000000;
        ELSE
          val := replace(replace(num, ',', ''), '.', '')::numeric;  -- entero plano: 7000, 20000
        END IF;
      END IF;
    EXCEPTION WHEN others THEN val := NULL; END;
    IF val IS NOT NULL AND val >= 1000 AND val > best THEN best := val; END IF;
  END LOOP;
  RETURN NULLIF(best, 0);
END $fn$;

-- ── Matching propiedad → clientes del agente ─────────────────────────────────
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
    -- Operación: si el cliente busca venta/renta, debe coincidir (restricción).
    AND (c.tipo_operacion IS NULL OR v_oper IS NULL OR c.tipo_operacion = v_oper)
    -- Presupuesto: el precio debe entrar en el tope del cliente (con 15% de
    -- tolerancia). Si no se puede parsear ningún número creíble, no filtra.
    AND (
      v_prec IS NULL
      OR public.presupuesto_max(c.presupuesto) IS NULL
      OR v_prec <= public.presupuesto_max(c.presupuesto) * 1.15
    )
    -- Zona: SEÑAL REQUERIDA. El cliente debe buscar una zona ESPECÍFICA
    -- (fraccionamiento/colonia) que aparezca en la propiedad. Se descartan los
    -- tokens genéricos de municipio/estado/ciudad porque están en casi todas las
    -- direcciones y harían coincidir todo. Comparación sin acentos por robustez.
    AND EXISTS (
      SELECT 1
      FROM regexp_split_to_table(coalesce(c.zona_busqueda, ''), ',') tok
      WHERE length(trim(tok)) >= 3
        AND translate(lower(trim(tok)), 'áéíóúü', 'aeiouu') NOT IN (
          'queretaro', 'qro', 'qro.', 'quer', 'el marques', 'marques', 'corregidora',
          'el pueblito', 'pueblito', 'huimilpan', 'pedro escobedo', 'san juan del rio',
          'tequisquiapan', 'colon', 'el marques queretaro',
          'monterrey', 'nuevo leon', 'nl', 'san pedro', 'guadalupe', 'apodaca',
          'puebla', 'mexico', 'cdmx', 'ciudad de mexico', 'edomex', 'estado de mexico',
          'no_conozco', 'no conozco', 'cualquiera', 'sin preferencia', 'indistinto'
        )
        AND v_texto LIKE '%' || lower(trim(tok)) || '%'
    )
  ORDER BY c.updated_at DESC NULLS LAST
  LIMIT 12;
END;
$$;
REVOKE ALL ON FUNCTION public.clientes_para_propiedad(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.clientes_para_propiedad(uuid) TO authenticated;
