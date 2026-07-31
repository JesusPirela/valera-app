-- Incluir el teléfono del cliente en el detalle y la lista de colecciones, para
-- que "Enviar por WhatsApp" abra DIRECTO el chat del cliente (wa.me/52<tel>)
-- en vez del selector de contactos.

CREATE OR REPLACE FUNCTION public.coleccion_detalle(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_col jsonb;
BEGIN
  SELECT to_jsonb(c) || jsonb_build_object('cliente_telefono', cl.telefono)
    INTO v_col
    FROM public.colecciones c
    LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
   WHERE c.id = p_id AND c.agente_id = v_uid;
  IF v_col IS NULL THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN v_col || jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.orden)
    FROM (
      SELECT i.propiedad_id, i.orden, i.favorito, i.favorito_at, i.visto_at, i.vistas,
             p.codigo, p.titulo, p.precio, p.direccion, p.operacion, p.tipo,
             p.recamaras, p.banos, p.m2,
             (SELECT COALESCE(pi.thumb_url, pi.url) FROM public.propiedad_imagenes pi
              WHERE pi.propiedad_id = p.id ORDER BY pi.orden LIMIT 1) AS imagen
      FROM public.coleccion_items i JOIN public.propiedades p ON p.id = i.propiedad_id
      WHERE i.coleccion_id = p_id
    ) t
  ), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.mis_colecciones()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT c.id, c.token, c.titulo, c.cliente_nombre, c.cliente_id, c.mensaje,
             (SELECT cl.telefono FROM public.clientes cl WHERE cl.id = c.cliente_id) AS cliente_telefono,
             c.vistas, c.abierta_at, c.created_at,
             (SELECT count(*) FROM public.coleccion_items i WHERE i.coleccion_id = c.id) AS n_props,
             (SELECT count(*) FROM public.coleccion_items i WHERE i.coleccion_id = c.id AND i.favorito) AS n_favoritos,
             (SELECT count(*) FROM public.coleccion_items i WHERE i.coleccion_id = c.id AND i.visto_at IS NOT NULL) AS n_vistas_prop
      FROM public.colecciones c
      WHERE c.agente_id = v_uid AND NOT c.archivada
    ) t
  ), '[]'::jsonb);
END $$;
