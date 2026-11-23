-- Botón admin: UN link evergreen con las propiedades marcadas como `directa`,
-- para mandar a los asesores aliados externos. Vive en `colecciones` (reusa
-- toda la infraestructura ya probada: contador de vistas, favoritos, la
-- página pública /coleccion/[token]), marcada con es_directas=true.
--
-- A diferencia de una colección normal (cuyos items se guardan en
-- coleccion_items al armarla), esta NO guarda items: coleccion_publica() los
-- arma consultando `propiedades` EN VIVO cada vez que alguien abre el link.
-- Así el mismo link siempre refleja las directas actuales — si mañana se
-- marca/desmarca una propiedad como directa, nadie tiene que reenviar nada.
ALTER TABLE public.colecciones
  ADD COLUMN IF NOT EXISTS es_directas boolean NOT NULL DEFAULT false;

-- Solo puede existir UNA colección "directas" (la evergreen); el RPC de abajo
-- reutiliza esa fila en vez de crear una nueva cada vez que un admin la pide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_colecciones_directas_unica
  ON public.colecciones (es_directas) WHERE es_directas;

-- ── ADMIN: entrega el token de la colección de directas, creándola la
--    primera vez que se pide. Reintentos posteriores devuelven la MISMA. ────
CREATE OR REPLACE FUNCTION public.obtener_coleccion_directas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_role  text;
  v_token text;
  v_n     int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo para administradores';
  END IF;

  SELECT token INTO v_token FROM public.colecciones WHERE es_directas = true LIMIT 1;
  IF v_token IS NULL THEN
    v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    INSERT INTO public.colecciones (token, agente_id, titulo, es_directas)
    VALUES (v_token, v_uid, 'Propiedades directas — Valera Real Estate', true);
  END IF;

  SELECT count(*) INTO v_n FROM public.propiedades
   WHERE directa = true AND estado = 'disponible' AND es_inventario = false;

  RETURN jsonb_build_object('token', v_token, 'n_props', v_n);
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_coleccion_directas() TO authenticated;

-- ── PÚBLICO: coleccion_publica ahora arma los items EN VIVO cuando la
--    colección es la de directas, en vez de leerlos de coleccion_items. ────
CREATE OR REPLACE FUNCTION public.coleccion_publica(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col public.colecciones;
  v_res jsonb;
BEGIN
  SELECT * INTO v_col FROM public.colecciones WHERE token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.colecciones
     SET vistas = vistas + 1, abierta_at = COALESCE(abierta_at, now())
   WHERE id = v_col.id;

  IF v_col.es_directas THEN
    SELECT jsonb_build_object(
      'titulo', v_col.titulo,
      'mensaje', v_col.mensaje,
      'cliente_nombre', NULL,
      'agente', (SELECT jsonb_build_object('nombre', pr.nombre, 'telefono', pr.telefono)
                 FROM public.profiles pr WHERE pr.id = v_col.agente_id),
      'items', COALESCE((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
        FROM (
          SELECT p.id AS propiedad_id, false AS favorito,
                 p.codigo, p.titulo, p.precio, p.direccion, p.operacion, p.tipo,
                 p.recamaras, p.banos, p.medios_banos, p.m2, p.m2_terreno, p.estacionamientos,
                 p.created_at,
                 (SELECT COALESCE(pi.thumb_url, pi.url) FROM public.propiedad_imagenes pi
                  WHERE pi.propiedad_id = p.id ORDER BY pi.orden LIMIT 1) AS imagen
          FROM public.propiedades p
          WHERE p.directa = true AND p.estado = 'disponible' AND p.es_inventario = false
        ) t
      ), '[]'::jsonb)
    ) INTO v_res;
    RETURN v_res;
  END IF;

  SELECT jsonb_build_object(
    'titulo', v_col.titulo,
    'mensaje', v_col.mensaje,
    'cliente_nombre', v_col.cliente_nombre,
    'agente', (SELECT jsonb_build_object('nombre', pr.nombre, 'telefono', pr.telefono)
               FROM public.profiles pr WHERE pr.id = v_col.agente_id),
    'items', COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.orden)
      FROM (
        SELECT i.propiedad_id, i.orden, i.favorito,
               p.codigo, p.titulo, p.precio, p.direccion, p.operacion, p.tipo,
               p.recamaras, p.banos, p.medios_banos, p.m2, p.m2_terreno, p.estacionamientos,
               (SELECT COALESCE(pi.thumb_url, pi.url) FROM public.propiedad_imagenes pi
                WHERE pi.propiedad_id = p.id ORDER BY pi.orden LIMIT 1) AS imagen
        FROM public.coleccion_items i JOIN public.propiedades p ON p.id = i.propiedad_id
        WHERE i.coleccion_id = v_col.id
      ) t
    ), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
