-- Extiende las funciones de notificación de propiedades para incluir
-- supervisor y asesor, que antes quedaban fuera por no estar en el WHERE de rol.

-- ── 1. Nueva propiedad / exclusiva ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_prospectadors_nueva_propiedad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.es_inventario THEN
    RETURN NEW;
  END IF;

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
    WHERE p.role IN ('prospectador_plus', 'supervisor', 'asesor');
  ELSE
    INSERT INTO notificaciones (user_id, propiedad_id, titulo, mensaje, tipo)
    SELECT p.id, NEW.id,
      'Nueva propiedad disponible',
      'Se publicó: ' || NEW.titulo || ' (' || COALESCE(NEW.codigo, '—') || ') en ' || NEW.direccion,
      'nueva_propiedad'
    FROM profiles p
    WHERE p.role IN ('prospectador', 'prospectador_plus', 'supervisor', 'asesor');
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2. Propiedad con mucho interés (auto-destacar) ────────────────────────────
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
        v_codigo || ' – ' || v_titulo || ' está siendo muy vista y descargada por los prospectadores.',
        'destacada'
      FROM profiles p
      WHERE p.role IN ('prospectador', 'prospectador_plus', 'supervisor', 'asesor');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 3. Destacar manual ────────────────────────────────────────────────────────
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
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'supervisor', 'asesor');
END;
$function$;

SELECT pg_notify('pgrst', 'reload schema');
