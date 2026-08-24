-- Historial de accesos prioritarios (subidas temporales de rol).
CREATE TABLE IF NOT EXISTS public.accesos_prioritarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rol_antes   text NOT NULL,
  rol_durante text NOT NULL,
  otorgado_at timestamptz NOT NULL DEFAULT now(),
  expira_at   timestamptz NOT NULL,
  revertido   boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_accesos_activos ON public.accesos_prioritarios (expira_at) WHERE revertido = false;
ALTER TABLE public.accesos_prioritarios ENABLE ROW LEVEL SECURITY;

-- Otorga acceso prioritario (1 semana) subiendo un peldaño: nuevo→prospectador,
-- prospectador→prospectador_plus. Tope = Plus. Staff (asesor/supervisor/admin) y
-- Plus NO reciben (devuelve motivo para que el llamador reembolse/avise). Si ya
-- tiene uno activo, extiende una semana en vez de subir otro peldaño.
CREATE OR REPLACE FUNCTION public.otorgar_acceso_prioritario(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_rol text; v_nuevo text; v_acc_id uuid; v_expira timestamptz;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = p_user_id;
  IF v_rol IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sin_perfil'); END IF;

  IF v_rol IN ('asesor','supervisor','admin') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'staff',
      'mensaje', 'El acceso prioritario es solo para prospectadores.');
  END IF;
  IF v_rol = 'prospectador_plus' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tope',
      'mensaje', 'Ya estás en el nivel más alto (Plus) 🏆. No necesitas acceso prioritario.');
  END IF;

  -- ¿Ya tiene uno activo? Extender una semana más (no subir otro peldaño).
  SELECT id, expira_at INTO v_acc_id, v_expira
  FROM accesos_prioritarios
  WHERE user_id = p_user_id AND revertido = false AND expira_at > now()
  ORDER BY expira_at DESC LIMIT 1;
  IF v_acc_id IS NOT NULL THEN
    UPDATE accesos_prioritarios SET expira_at = v_expira + interval '7 days' WHERE id = v_acc_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (p_user_id, '⭐ Acceso prioritario extendido',
      'Te extendimos tu acceso prioritario una semana más. ¡Aprovéchalo!', 'sistema');
    RETURN jsonb_build_object('ok', true, 'extendido', true,
      'mensaje', 'Ya tenías acceso prioritario: te lo extendimos una semana más ⭐');
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
END $fn$;

-- Revierte los accesos vencidos: regresa al rol anterior SOLO si el rol actual
-- sigue siendo el temporal (si un admin lo cambió a mano, se respeta ese cambio).
CREATE OR REPLACE FUNCTION public.revertir_accesos_prioritarios_vencidos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_rec record; v_n int := 0;
BEGIN
  FOR v_rec IN
    SELECT * FROM accesos_prioritarios WHERE revertido = false AND expira_at <= now()
  LOOP
    UPDATE profiles SET role = v_rec.rol_antes
    WHERE id = v_rec.user_id AND role = v_rec.rol_durante;
    UPDATE accesos_prioritarios SET revertido = true WHERE id = v_rec.id;
    IF FOUND THEN
      INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
      VALUES (v_rec.user_id, '⌛ Terminó tu acceso prioritario',
        'Tu semana de acceso prioritario terminó. Sigue avanzando para subir de nivel de forma permanente 💪', 'sistema');
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $fn$;
