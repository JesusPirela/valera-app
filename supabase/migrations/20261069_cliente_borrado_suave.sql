-- Un cliente que borra un prospectador ya NO se va de la base.
--
-- El problema, medido en la bitácora: `eliminar_cliente` hacía
-- "DELETE FROM clientes" de verdad, y esa es la vía que usa el prospectador
-- desde la ficha del cliente. En la bitácora hay 296 clientes borrados así.
-- Los últimos: Jessica borró tres el 20/10 (uno estaba en seguimiento de
-- cierre) y Diana seis el 18/10. De esos registros no quedó nada en la tabla.
--
-- Lo demás ya estaba bien y no hace falta tocarlo:
--  · El CRM del prospectador YA filtra por eliminado_at IS NULL, así que al
--    marcarlo deja de verlo, que es justo lo que se pide.
--  · El CRM de admin YA tiene papelera: lista los que tienen eliminado_at y
--    los restaura. Y no hay ningún cron que los purgue, así que se quedan
--    hasta que alguien de mando decida.
--
-- Lo único que faltaba era que la vía del prospectador marcara en vez de
-- borrar.

-- ─── Quién lo mandó a la papelera ────────────────────────────────────────────
-- Hasta ahora solo se guardaba CUÁNDO. Saber quién es la mitad de la
-- pregunta cuando aparece un cliente bueno en la papelera.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS eliminado_por UUID REFERENCES public.profiles(id);

-- ─── Borrar = mandar a la papelera ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eliminar_cliente(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner   UUID;
  v_role    TEXT;
  v_ya      TIMESTAMPTZ;
  v_filas   INTEGER;
BEGIN
  SELECT responsable_id, eliminado_at INTO v_owner, v_ya
    FROM public.clientes WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF NOT (auth.uid() = v_owner OR v_role IN ('admin', 'supervisor', 'gerente')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Si ya estaba en la papelera, no se vuelve a marcar: así no se pisa la
  -- fecha original ni se cambia quién fue el que lo quitó.
  IF v_ya IS NOT NULL THEN
    RETURN 1;
  END IF;

  -- Ya NO se borra la fila de leads_pool. Antes había que hacerlo porque la
  -- llave foránea bloqueaba el borrado; con la marca no estorba, y esa fila
  -- guarda donante_id, compra_id y comision_liquidada: es el registro de la
  -- comisión de quien donó al cliente. Borrarla le quitaba su comisión.
  UPDATE public.clientes
     SET eliminado_at = now(),
         eliminado_por = auth.uid()
   WHERE id = p_id;

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  -- Devuelve 1 igual que antes, para que la app siga diciendo "eliminado
  -- correctamente" y lo saque de la lista. Para quien lo borra no cambia nada.
  RETURN v_filas;
END;
$function$;

-- ─── Y el borrado de verdad, solo para el mando ──────────────────────────────
-- "Nosotros decidimos cuándo se van de la base": esta es esa decisión, y solo
-- la pueden tomar admin y gerencia. Exige que el cliente YA esté en la
-- papelera, para que nadie se salte el paso de verlo antes de tirarlo.
CREATE OR REPLACE FUNCTION public.eliminar_cliente_definitivo(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_role TEXT; v_ya TIMESTAMPTZ; v_filas INTEGER;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'gerente' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT eliminado_at INTO v_ya FROM public.clientes WHERE id = p_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_ya IS NULL THEN
    RAISE EXCEPTION 'Primero hay que mandarlo a la papelera';
  END IF;

  DELETE FROM public.leads_pool WHERE cliente_id = p_id;
  DELETE FROM public.clientes WHERE id = p_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_cliente_definitivo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.eliminar_cliente_definitivo(uuid) TO authenticated;
