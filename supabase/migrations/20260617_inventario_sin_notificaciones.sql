-- ══════════════════════════════════════════════════════════════
-- Las propiedades de INVENTARIO no deben notificar ni modificar a los
-- usuarios (prospectadores). Antes, crear una propiedad en inventario
-- disparaba "Nueva propiedad disponible" a todos. Además se limpian las
-- 1271 notificaciones ya generadas por propiedades de inventario.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Nueva propiedad: saltar inventario; notificar al PUBLICAR ──
-- Notifica cuando una propiedad pasa a estar disponible en el catálogo:
--   • INSERT con es_inventario=false  → notifica
--   • UPDATE inventario→publicada (true→false) → notifica
--   • Inventario o cualquier otro update → no notifica
CREATE OR REPLACE FUNCTION public.notify_prospectadors_nueva_propiedad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  -- El inventario nunca notifica
  IF NEW.es_inventario THEN
    RETURN NEW;
  END IF;

  -- En UPDATE solo notificar cuando ACABA de salir del inventario;
  -- si ya estaba en catálogo, un update no debe re-notificar.
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.es_inventario, false) = false THEN
    RETURN NEW;
  END IF;

  IF NEW.exclusiva THEN
    INSERT INTO notificaciones (user_id, propiedad_id, titulo, mensaje, tipo)
    SELECT p.id, NEW.id,
      '★ Propiedad exclusiva disponible',
      'Nueva exclusiva: ' || NEW.titulo || ' (' || COALESCE(NEW.codigo, '—') || ') en ' || NEW.direccion,
      'exclusiva'
    FROM profiles p
    WHERE p.role = 'prospectador_plus';
  ELSE
    INSERT INTO notificaciones (user_id, propiedad_id, titulo, mensaje, tipo)
    SELECT p.id, NEW.id,
      'Nueva propiedad disponible',
      'Se publicó: ' || NEW.titulo || ' (' || COALESCE(NEW.codigo, '—') || ') en ' || NEW.direccion,
      'nueva_propiedad'
    FROM profiles p
    WHERE p.role IN ('prospectador', 'prospectador_plus');
  END IF;

  RETURN NEW;
END;
$function$;

-- Recrear el trigger para que cubra INSERT y UPDATE (antes solo INSERT)
DROP TRIGGER IF EXISTS trigger_nueva_propiedad ON public.propiedades;
CREATE TRIGGER trigger_nueva_propiedad
  AFTER INSERT OR UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.notify_prospectadors_nueva_propiedad();

-- ── 2. Auto-destacar por actividad: no tocar inventario ──
CREATE OR REPLACE FUNCTION public.check_actividad_destacar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_usuarios_distintos INT;
  v_titulo             TEXT;
  v_codigo             TEXT;
  v_ya_destacada       BOOLEAN;
  v_es_inventario      BOOLEAN;
BEGIN
  SELECT COUNT(DISTINCT user_id)
  INTO v_usuarios_distintos
  FROM propiedad_actividad
  WHERE propiedad_id = NEW.propiedad_id;

  IF v_usuarios_distintos >= 3 THEN
    SELECT destacada, titulo, codigo, es_inventario
    INTO v_ya_destacada, v_titulo, v_codigo, v_es_inventario
    FROM propiedades
    WHERE id = NEW.propiedad_id;

    IF NOT v_ya_destacada AND NOT COALESCE(v_es_inventario, false) THEN
      UPDATE propiedades
      SET destacada         = TRUE,
          destacada_mensaje = 'Esta propiedad está siendo muy vista por los prospectadores'
      WHERE id = NEW.propiedad_id;

      INSERT INTO notificaciones (user_id, propiedad_id, titulo, mensaje, tipo)
      SELECT p.id, NEW.propiedad_id,
        'Propiedad con mucho interés',
        v_codigo || ' – ' || v_titulo || ' está siendo muy vista y descargada por los prospectadores.'
      FROM profiles p
      WHERE p.role = 'prospectador';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 3. Destacar manual: ignorar inventario ──
CREATE OR REPLACE FUNCTION public.destacar_propiedad_manual(p_id uuid, p_mensaje text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_titulo TEXT;
  v_codigo TEXT;
  v_msg    TEXT;
  v_es_inv BOOLEAN;
BEGIN
  SELECT titulo, codigo, es_inventario INTO v_titulo, v_codigo, v_es_inv
  FROM propiedades WHERE id = p_id;

  -- Las propiedades de inventario no se destacan ni notifican
  IF COALESCE(v_es_inv, false) THEN
    RETURN;
  END IF;

  v_msg := COALESCE(
    NULLIF(TRIM(p_mensaje), ''),
    'El administrador ha destacado esta propiedad como una oportunidad especial.'
  );

  UPDATE propiedades
  SET destacada         = TRUE,
      destacada_mensaje = v_msg
  WHERE id = p_id;

  INSERT INTO notificaciones (user_id, propiedad_id, titulo, mensaje, tipo)
  SELECT p.id, p_id,
    'Propiedad destacada',
    v_codigo || ' – ' || v_titulo || ': ' || v_msg,
    'destacada'
  FROM profiles p
  WHERE p.role = 'prospectador';
END;
$function$;

-- ── 4. Borrar notificaciones ya generadas por propiedades de inventario ──
DELETE FROM public.notificaciones
WHERE propiedad_id IN (SELECT id FROM public.propiedades WHERE es_inventario = true);
