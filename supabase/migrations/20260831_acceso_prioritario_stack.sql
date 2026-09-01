-- Acceso prioritario STACKEABLE.
-- Regla: al sacar acceso repetidamente se SUBE de nivel primero
-- (nuevo → prospectador → prospectador_plus) y, una vez en Plus, cada nuevo
-- acceso EXTIENDE el tiempo una semana más (se acumula). El tope sigue siendo
-- Plus; staff no aplica; un Plus PERMANENTE (sin acceso temporal activo) ya está
-- en el tope y no recibe acceso (el cofre le reembolsa monedas). rol_antes se
-- conserva para que el revert regrese siempre al rol ORIGINAL.
CREATE OR REPLACE FUNCTION public.otorgar_acceso_prioritario(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rol text; v_acc_id uuid; v_durante text; v_antes text;
  v_expira timestamptz; v_siguiente text; v_nuevo text;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = p_user_id;
  IF v_rol IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sin_perfil'); END IF;

  IF v_rol IN ('asesor','supervisor','admin') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'staff',
      'mensaje', 'El acceso prioritario es solo para prospectadores.');
  END IF;

  -- ¿Ya tiene un acceso temporal activo? Se STACKEA sobre el mismo registro.
  SELECT id, rol_durante, rol_antes, expira_at
    INTO v_acc_id, v_durante, v_antes, v_expira
  FROM accesos_prioritarios
  WHERE user_id = p_user_id AND revertido = false AND expira_at > now()
  ORDER BY expira_at DESC LIMIT 1;

  IF v_acc_id IS NOT NULL THEN
    v_siguiente := CASE v_durante
      WHEN 'nuevo'        THEN 'prospectador'
      WHEN 'prospectador' THEN 'prospectador_plus'
      ELSE NULL END;
    IF v_siguiente IS NOT NULL THEN
      -- Sube un peldaño más; semana nueva en el nivel alcanzado.
      UPDATE accesos_prioritarios
        SET rol_durante = v_siguiente, expira_at = now() + interval '7 days'
      WHERE id = v_acc_id;
      UPDATE profiles SET role = v_siguiente WHERE id = p_user_id;
      INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
      VALUES (p_user_id, '⭐ ¡Subiste de nivel!',
        'Con tu nuevo acceso prioritario subiste a ' ||
        (CASE v_siguiente WHEN 'prospectador' THEN 'Prospectador' ELSE 'Prospectador Plus' END) ||
        ' por 1 semana. Al terminar regresas a tu nivel original. 🚀', 'sistema');
      RETURN jsonb_build_object('ok', true, 'subido', true, 'nuevo_rol', v_siguiente,
        'mensaje', '⭐ ¡Subiste a ' ||
          (CASE v_siguiente WHEN 'prospectador' THEN 'Prospectador' ELSE 'Prospectador Plus' END) ||
          ' por otra semana!');
    ELSE
      -- Ya está en Plus temporal: acumula tiempo (+1 semana).
      UPDATE accesos_prioritarios SET expira_at = v_expira + interval '7 days' WHERE id = v_acc_id;
      INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
      VALUES (p_user_id, '⭐ Acceso prioritario extendido',
        'Ya estás en Prospectador Plus: te sumamos una semana más de acceso. ¡Aprovéchalo! ⏳', 'sistema');
      RETURN jsonb_build_object('ok', true, 'extendido', true,
        'mensaje', 'Ya estabas en Plus: te sumamos una semana más de acceso prioritario ⏳');
    END IF;
    RETURN jsonb_build_object('ok', true); -- inalcanzable, por si acaso
  END IF;

  -- Sin acceso activo: un Plus PERMANENTE ya está en el tope.
  IF v_rol = 'prospectador_plus' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tope',
      'mensaje', 'Ya estás en el nivel más alto (Plus) 🏆. No necesitas acceso prioritario.');
  END IF;

  v_nuevo := CASE v_rol WHEN 'nuevo' THEN 'prospectador' WHEN 'prospectador' THEN 'prospectador_plus' ELSE NULL END;
  IF v_nuevo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'rol_no_elegible');
  END IF;

  v_expira := now() + interval '7 days';
  UPDATE profiles SET role = v_nuevo WHERE id = p_user_id;
  INSERT INTO accesos_prioritarios (user_id, rol_antes, rol_durante, expira_at)
  VALUES (p_user_id, v_rol, v_nuevo, v_expira) RETURNING id INTO v_acc_id;
  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
  VALUES (p_user_id, '⭐ ¡Acceso prioritario activado!',
    'Por 1 semana subiste a ' || (CASE v_nuevo WHEN 'prospectador' THEN 'Prospectador' ELSE 'Prospectador Plus' END) ||
    '. Al terminar la semana regresas a tu nivel anterior. ¡Aprovéchalo al máximo! 🚀', 'sistema');
  RETURN jsonb_build_object('ok', true, 'nuevo_rol', v_nuevo, 'expira_at', v_expira,
    'mensaje', '⭐ ¡Acceso prioritario activado por 1 semana! Subiste a ' ||
      (CASE v_nuevo WHEN 'prospectador' THEN 'Prospectador' ELSE 'Prospectador Plus' END) || '.');
END $function$;
