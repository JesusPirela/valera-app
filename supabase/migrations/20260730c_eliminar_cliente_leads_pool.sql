-- FIX: no se podían borrar LEADS del CRM.
-- Causa: eliminar_cliente() hace DELETE físico, pero leads_pool.cliente_id →
-- clientes.id es FK con delete_rule = NO ACTION (RESTRICT). Los clientes que
-- vinieron del pool de leads tienen una fila en leads_pool que los referencia,
-- así que el DELETE fallaba con violación de llave foránea (los clientes
-- "normales", sin fila en el pool, sí se borraban → por eso parecía aleatorio).
--
-- Arreglo: antes de borrar el cliente, se elimina su fila del pool. El lead se
-- va por completo (es un borrado permanente, "no se puede deshacer"), no regresa
-- al pool. Los demás hijos (interacciones, citas, seguimientos_dia) ya son
-- CASCADE, y recordatorios/notificaciones son SET NULL, así que no estorban.
CREATE OR REPLACE FUNCTION public.eliminar_cliente(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Quitar la referencia del pool de leads (FK RESTRICT) para no bloquear.
  DELETE FROM public.leads_pool WHERE cliente_id = p_id;

  DELETE FROM public.clientes WHERE id = p_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
