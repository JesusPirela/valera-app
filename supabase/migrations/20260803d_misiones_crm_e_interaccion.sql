-- 1. Misión CRM: 2 clientes, 10 coins
UPDATE public.misiones SET meta = 2, recompensa_coins = 10
 WHERE tipo = 'diaria' AND categoria = 'crm';

-- 2. Misión interacción: solo cuenta contactos por WhatsApp/llamada
UPDATE public.misiones
   SET titulo = 'Contacta a tus clientes',
       descripcion = 'Contacta a 3 clientes por WhatsApp o llamada'
 WHERE tipo = 'diaria' AND categoria = 'interaccion';

-- 3. Registrar contacto (WhatsApp/llamada) como interacción. Dedupe por
--    cliente+canal+día para no farmear. Solo clientes propios.
CREATE OR REPLACE FUNCTION public.registrar_contacto_cliente(p_cliente_id uuid, p_canal text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_tipo text; v_hoy date;
BEGIN
  IF v_uid IS NULL OR p_cliente_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  v_tipo := CASE WHEN p_canal = 'llamada' THEN 'llamada' ELSE 'mensaje' END;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND responsable_id = v_uid) THEN
    RETURN jsonb_build_object('ok', true, 'nuevo', false, 'motivo', 'ajeno');
  END IF;
  v_hoy := (now() AT TIME ZONE 'America/Mexico_City')::date;
  IF EXISTS (SELECT 1 FROM public.interacciones
             WHERE user_id = v_uid AND cliente_id = p_cliente_id AND tipo = v_tipo
               AND (created_at AT TIME ZONE 'America/Mexico_City')::date = v_hoy) THEN
    RETURN jsonb_build_object('ok', true, 'nuevo', false, 'repetido', true);
  END IF;
  INSERT INTO public.interacciones (user_id, cliente_id, tipo, descripcion)
  VALUES (v_uid, p_cliente_id, v_tipo, CASE WHEN v_tipo = 'llamada' THEN 'Llamada al cliente' ELSE 'Contacto por WhatsApp' END);
  RETURN jsonb_build_object('ok', true, 'nuevo', true);
END $$;
GRANT EXECUTE ON FUNCTION public.registrar_contacto_cliente(uuid, text) TO authenticated;
