-- ══════════════════════════════════════════════════════════════
-- Eliminar cliente de forma fiable (panel CRM).
-- La política RLS de DELETE solo permite borrar al dueño (responsable_id)
-- o admin — NO a supervisores ni a clientes reasignados. Cuando RLS bloquea
-- un DELETE lo hace en silencio (0 filas, sin error), así que el cliente
-- "no se borraba" pero la UI creía que sí. Esta función SECURITY DEFINER
-- valida permisos (dueño / admin / supervisor) y borra de verdad,
-- devolviendo cuántas filas eliminó. Los hijos caen por ON DELETE CASCADE.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.eliminar_cliente(p_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner   uuid;
  v_role    text;
  v_deleted integer;
BEGIN
  SELECT responsable_id INTO v_owner FROM public.clientes WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN 0; -- el cliente ya no existe
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF NOT (auth.uid() = v_owner OR v_role IN ('admin', 'supervisor')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.clientes WHERE id = p_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eliminar_cliente(uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
