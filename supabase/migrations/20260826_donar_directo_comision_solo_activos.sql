-- ── "Activo" = actividad en los últimos 7 días (publicó, dio seguimiento o interactuó)
CREATE OR REPLACE FUNCTION public.es_usuario_activo(p_uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM propiedad_publicacion WHERE user_id=p_uid AND fecha_publicacion > now()-interval '7 days')
      OR EXISTS (SELECT 1 FROM seguimientos_dia WHERE user_id=p_uid AND fecha > ((now() AT TIME ZONE 'America/Mexico_City')::date - 7))
      OR EXISTS (SELECT 1 FROM interacciones WHERE user_id=p_uid AND tipo IN ('mensaje','llamada') AND created_at > now()-interval '7 days');
$$;

-- Lista de compañeros ACTIVOS a los que se puede donar directo (excluye al que pide).
CREATE OR REPLACE FUNCTION public.get_asesores_activos()
RETURNS TABLE(id uuid, nombre text) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.nombre FROM profiles p
  WHERE p.role IN ('prospectador','prospectador_plus','asesor','supervisor')
    AND p.id <> auth.uid() AND p.nombre IS NOT NULL
    AND public.es_usuario_activo(p.id)
  ORDER BY p.nombre;
$$;

-- Comisión también en donación DIRECTA: se premia por clientes.donado_por (unifica
-- pool + directo). Guarda comision_donacion_at para no premiar dos veces.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS comision_donacion_at timestamptz;

CREATE OR REPLACE FUNCTION public.fn_recompensar_donacion_compra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
  IF NEW.estado IN ('compro','compro_externo') AND OLD.estado IS DISTINCT FROM NEW.estado
     AND NEW.donado_por IS NOT NULL
     AND NEW.donado_por IS DISTINCT FROM NEW.responsable_id
     AND NEW.comision_donacion_at IS NULL THEN
    UPDATE clientes SET comision_donacion_at = now() WHERE id = NEW.id;  -- (no re-dispara: trigger es OF estado)
    UPDATE user_stats SET valera_coins = valera_coins + 200, xp = xp + 300 WHERE id = NEW.donado_por;
    INSERT INTO coin_transactions (user_id, cantidad, concepto)
    VALUES (NEW.donado_por, 200, 'Comisión por cliente donado que compró 🤝');
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (NEW.donado_por, '🤝 ¡Tu cliente donado compró!',
      'Un cliente que donaste cerró la compra. Ganaste 200 coins + 300 XP y te toca tu parte de la comisión.', 'sistema');
  END IF;
  RETURN NEW;
END $fn$;

-- Log de donaciones (para el historial de quién ha donado).
CREATE TABLE IF NOT EXISTS public.donaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donante_id uuid REFERENCES profiles(id),
  donante_nombre text,
  tipo text NOT NULL,               -- 'pool' | 'directo'
  cliente_nombre text,
  cliente_origen_id uuid,
  destino_id uuid,                  -- null si fue al pool
  destino_nombre text,
  creado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.donaciones ENABLE ROW LEVEL SECURITY;

-- donar_cliente: directo ahora SÍ da comisión, pero solo a ACTIVOS. Registra el log.
CREATE OR REPLACE FUNCTION public.donar_cliente(p_cliente_id uuid, p_destino_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_rol text; v_c record; v_pool_id uuid;
        v_donante_nombre text; v_destino_nombre text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  SELECT role, nombre INTO v_rol, v_donante_nombre FROM profiles WHERE id = v_uid;

  SELECT * INTO v_c FROM clientes WHERE id = p_cliente_id AND eliminado_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado'); END IF;
  IF v_c.responsable_id <> v_uid AND v_rol NOT IN ('admin','supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo puedes donar tus propios clientes');
  END IF;
  IF COALESCE(btrim(v_c.telefono),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El cliente necesita un teléfono para donarlo');
  END IF;
  IF v_c.estado IN ('compro','compro_externo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes donar un cliente que ya compró');
  END IF;

  -- ── Donación DIRECTA (con comisión) — solo a gente ACTIVA ──────────────────
  IF p_destino_id IS NOT NULL THEN
    IF p_destino_id = v_uid THEN
      RETURN jsonb_build_object('ok', false, 'error', 'No puedes donarte el cliente a ti mismo');
    END IF;
    SELECT nombre INTO v_destino_nombre FROM profiles WHERE id = p_destino_id;
    IF v_destino_nombre IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Destino no válido'); END IF;
    IF NOT public.es_usuario_activo(p_destino_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Solo puedes donar a compañeros ACTIVOS (con actividad en la última semana).');
    END IF;
    UPDATE clientes
    SET responsable_id = p_destino_id, donado_por = v_uid, donado_por_nombre = v_donante_nombre,
        comision_donacion_at = NULL
    WHERE id = p_cliente_id;
    INSERT INTO donaciones (donante_id, donante_nombre, tipo, cliente_nombre, cliente_origen_id, destino_id, destino_nombre)
    VALUES (v_uid, v_donante_nombre, 'directo', v_c.nombre, p_cliente_id, p_destino_id, v_destino_nombre);
    INSERT INTO notificaciones (user_id, cliente_id, titulo, mensaje, tipo)
    VALUES (p_destino_id, p_cliente_id, '🎁 Te donaron un cliente',
      COALESCE(v_donante_nombre,'Un compañero') || ' te donó a ' || COALESCE(v_c.nombre,'un cliente') ||
      '. Ya está en tu CRM listo para trabajar.', 'sistema');
    RETURN jsonb_build_object('ok', true, 'directo', true,
      'mensaje', '🤝 Le donaste a ' || COALESCE(v_c.nombre,'este cliente') || ' a ' || v_destino_nombre ||
        '. Si lo cierra, te toca tu parte de la comisión.');
  END IF;

  -- ── Donación al POOL (al azar, con comisión) ───────────────────────────────
  INSERT INTO leads_pool (nombre, telefono, zona_interes, nota, estado, created_by, donante_id, cliente_origen_id)
  VALUES (v_c.nombre, v_c.telefono, v_c.zona_busqueda,
          COALESCE(NULLIF(v_c.notas,''), 'Cliente donado'), 'disponible', v_uid, v_uid, p_cliente_id)
  RETURNING id INTO v_pool_id;
  UPDATE clientes SET eliminado_at = now(), razon_descarte = 'Donado al pool de leads' WHERE id = p_cliente_id;
  INSERT INTO donaciones (donante_id, donante_nombre, tipo, cliente_nombre, cliente_origen_id)
  VALUES (v_uid, v_donante_nombre, 'pool', v_c.nombre, p_cliente_id);

  RETURN jsonb_build_object('ok', true, 'pool_id', v_pool_id,
    'mensaje', '🤝 ¡Gracias por donar a ' || COALESCE(v_c.nombre,'este cliente') ||
      ' al pool! Si alguien lo cierra, te toca tu parte de la comisión.');
END $fn$;
