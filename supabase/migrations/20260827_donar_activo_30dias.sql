-- "Activo" para donación directa: ventana de 30 días (antes 7).
CREATE OR REPLACE FUNCTION public.es_usuario_activo(p_uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM propiedad_publicacion WHERE user_id=p_uid AND fecha_publicacion > now()-interval '30 days')
      OR EXISTS (SELECT 1 FROM seguimientos_dia WHERE user_id=p_uid AND fecha > ((now() AT TIME ZONE 'America/Mexico_City')::date - 30))
      OR EXISTS (SELECT 1 FROM interacciones WHERE user_id=p_uid AND tipo IN ('mensaje','llamada') AND created_at > now()-interval '30 days');
$$;
