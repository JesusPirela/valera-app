-- Límite de uso de la "descripción para publicar con IA" (solo usuarios plus+).
-- Cuenta+registra por usuario por día (hora de México) en propiedad_actividad
-- (tipo = 'desc_ia'). El tope se pasa desde la edge function.
CREATE OR REPLACE FUNCTION public.usar_desc_ia(p_limite integer, p_propiedad_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_usos integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no autenticado');
  END IF;

  SELECT COUNT(*) INTO v_usos
  FROM public.propiedad_actividad
  WHERE user_id = v_uid AND tipo = 'desc_ia'
    AND (created_at AT TIME ZONE 'America/Mexico_City')::date = (now() AT TIME ZONE 'America/Mexico_City')::date;

  IF v_usos >= p_limite THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limite', 'usos', v_usos, 'limite', p_limite);
  END IF;

  INSERT INTO public.propiedad_actividad (propiedad_id, user_id, tipo)
  VALUES (p_propiedad_id, v_uid, 'desc_ia');

  RETURN jsonb_build_object('ok', true, 'usos', v_usos + 1, 'limite', p_limite,
                            'restantes', p_limite - (v_usos + 1));
END;
$$;
REVOKE ALL ON FUNCTION public.usar_desc_ia(integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.usar_desc_ia(integer, uuid) TO authenticated;

-- El tipo 'desc_ia' (y 'solicitud_diseno' del botón de diseño) no estaban
-- permitidos por el CHECK original (solo 'vista','descarga'). Se amplía.
ALTER TABLE public.propiedad_actividad DROP CONSTRAINT IF EXISTS propiedad_actividad_tipo_check;
ALTER TABLE public.propiedad_actividad ADD CONSTRAINT propiedad_actividad_tipo_check
  CHECK (tipo = ANY (ARRAY['vista','descarga','desc_ia','solicitud_diseno']));
