-- Al tocar la notificación de favorito, llevar a la COLECCIÓN (no al cliente ni
-- a la propiedad). Se guarda accion_url con la ruta del detalle de la colección;
-- los handlers de tap la priorizan.
CREATE OR REPLACE FUNCTION public.coleccion_toggle_favorito(p_token text, p_propiedad_id uuid, p_favorito boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_col     public.colecciones;
  v_era_fav boolean;
  v_cod     text;
  v_tit     text;
BEGIN
  SELECT c.* INTO v_col
    FROM public.colecciones c
    JOIN public.coleccion_items i ON i.coleccion_id = c.id
   WHERE c.token = p_token AND i.propiedad_id = p_propiedad_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  SELECT i.favorito INTO v_era_fav
    FROM public.coleccion_items i
   WHERE i.coleccion_id = v_col.id AND i.propiedad_id = p_propiedad_id;

  UPDATE public.coleccion_items
     SET favorito = p_favorito,
         favorito_at = CASE WHEN p_favorito THEN now() ELSE NULL END
   WHERE coleccion_id = v_col.id AND propiedad_id = p_propiedad_id;

  IF p_favorito AND NOT COALESCE(v_era_fav, false) THEN
    SELECT codigo, titulo INTO v_cod, v_tit FROM public.propiedades WHERE id = p_propiedad_id;
    INSERT INTO public.notificaciones (user_id, propiedad_id, accion_url, titulo, mensaje, tipo)
    VALUES (
      v_col.agente_id,
      p_propiedad_id,
      '/(prospectador)/coleccion-detalle?id=' || v_col.id,   -- tap → detalle de la colección
      '❤️ Marcaron una propiedad como favorita',
      COALESCE(NULLIF(trim(v_col.cliente_nombre), ''), 'Un cliente')
        || ' marcó como favorita ' || COALESCE(v_cod, 'una propiedad')
        || CASE WHEN v_tit IS NOT NULL THEN ' — ' || v_tit ELSE '' END
        || CASE WHEN v_col.titulo IS NOT NULL THEN ' (colección: ' || v_col.titulo || ')' ELSE '' END,
      'coleccion_favorito'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'favorito', p_favorito);
END $$;

GRANT EXECUTE ON FUNCTION public.coleccion_toggle_favorito(text, uuid, boolean) TO anon, authenticated;
