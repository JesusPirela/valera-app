-- ══════════════════════════════════════════════════════════════
-- Cuando un cliente pasa a "compro" (apartó/compró), avisar a los ADMINS
-- para que verifiquen/aprueben el apartado. Cubre cualquier camino
-- (formulario, edición inline del CRM, etc.) porque es un trigger.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_notif_apartado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_resp text;
BEGIN
  IF NEW.estado = 'compro'
     AND (TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado) THEN
    SELECT nombre INTO v_resp FROM public.profiles WHERE id = NEW.responsable_id;
    INSERT INTO public.notificaciones (user_id, cliente_id, titulo, mensaje, tipo)
    SELECT p.id, NEW.id,
      '🔔 Apartado por verificar',
      COALESCE(v_resp, 'Un asesor') || ' marcó que ' || COALESCE(NEW.nombre, 'un cliente')
        || ' apartó. Verifica que el apartado sea correcto.',
      'apartado'
    FROM public.profiles p
    WHERE p.role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notif_apartado ON public.clientes;
CREATE TRIGGER tr_notif_apartado
  AFTER INSERT OR UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_notif_apartado();
