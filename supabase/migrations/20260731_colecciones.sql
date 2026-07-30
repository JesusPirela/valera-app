-- ══════════════════════════════════════════════════════════════════════════
-- COLECCIONES para el cliente (estilo Compass Collections / kvCORE)
-- El agente arma un set de propiedades y manda UN link público al cliente.
-- El cliente ve solo esas, abre las que le interesan y marca favoritas; el
-- agente ve las vistas y los favoritos (señales de compra).
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.colecciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text UNIQUE NOT NULL,
  agente_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id     uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre text,
  titulo         text,
  mensaje        text,
  archivada      boolean NOT NULL DEFAULT false,
  vistas         integer NOT NULL DEFAULT 0,
  abierta_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coleccion_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleccion_id  uuid NOT NULL REFERENCES public.colecciones(id) ON DELETE CASCADE,
  propiedad_id  uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  orden         integer NOT NULL DEFAULT 0,
  favorito      boolean NOT NULL DEFAULT false,
  favorito_at   timestamptz,
  visto_at      timestamptz,
  vistas        integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coleccion_id, propiedad_id)
);

CREATE INDEX IF NOT EXISTS idx_colecciones_agente ON public.colecciones(agente_id);
CREATE INDEX IF NOT EXISTS idx_coleccion_items_col ON public.coleccion_items(coleccion_id);

ALTER TABLE public.colecciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coleccion_items ENABLE ROW LEVEL SECURITY;

-- El agente gestiona SOLO sus colecciones. El acceso público del cliente va por
-- RPCs SECURITY DEFINER (no necesita política).
DROP POLICY IF EXISTS col_agente ON public.colecciones;
CREATE POLICY col_agente ON public.colecciones FOR ALL
  USING (agente_id = auth.uid()) WITH CHECK (agente_id = auth.uid());

DROP POLICY IF EXISTS coli_agente ON public.coleccion_items;
CREATE POLICY coli_agente ON public.coleccion_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.colecciones c WHERE c.id = coleccion_id AND c.agente_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.colecciones c WHERE c.id = coleccion_id AND c.agente_id = auth.uid()));

-- ── Crear colección (vacía) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_coleccion(
  p_titulo text, p_cliente_id uuid, p_cliente_nombre text, p_mensaje text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_token text; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  INSERT INTO public.colecciones (token, agente_id, cliente_id, cliente_nombre, titulo, mensaje)
  VALUES (v_token, v_uid, p_cliente_id, NULLIF(trim(p_cliente_nombre), ''),
          NULLIF(trim(p_titulo), ''), NULLIF(trim(p_mensaje), ''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'token', v_token);
END $$;

-- ── Agregar / quitar propiedad ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.coleccion_agregar_item(p_coleccion_id uuid, p_propiedad_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_ord int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.colecciones WHERE id = p_coleccion_id AND agente_id = v_uid) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT COALESCE(max(orden), -1) + 1 INTO v_ord FROM public.coleccion_items WHERE coleccion_id = p_coleccion_id;
  INSERT INTO public.coleccion_items (coleccion_id, propiedad_id, orden)
  VALUES (p_coleccion_id, p_propiedad_id, v_ord)
  ON CONFLICT (coleccion_id, propiedad_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.coleccion_quitar_item(p_coleccion_id uuid, p_propiedad_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.colecciones WHERE id = p_coleccion_id AND agente_id = v_uid) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.coleccion_items WHERE coleccion_id = p_coleccion_id AND propiedad_id = p_propiedad_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.eliminar_coleccion(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  DELETE FROM public.colecciones WHERE id = p_id AND agente_id = v_uid;
  RETURN jsonb_build_object('ok', FOUND);
END $$;

-- ── Lista de colecciones del agente (con stats) ────────────────────────────
CREATE OR REPLACE FUNCTION public.mis_colecciones()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
    FROM (
      SELECT c.id, c.token, c.titulo, c.cliente_nombre, c.cliente_id, c.mensaje,
             c.vistas, c.abierta_at, c.created_at,
             (SELECT count(*) FROM public.coleccion_items i WHERE i.coleccion_id = c.id) AS n_props,
             (SELECT count(*) FROM public.coleccion_items i WHERE i.coleccion_id = c.id AND i.favorito) AS n_favoritos,
             (SELECT count(*) FROM public.coleccion_items i WHERE i.coleccion_id = c.id AND i.visto_at IS NOT NULL) AS n_vistas_prop
      FROM public.colecciones c
      WHERE c.agente_id = v_uid AND NOT c.archivada
    ) t
  ), '[]'::jsonb);
END $$;

-- ── Detalle para el AGENTE (items + propiedad + engagement) ────────────────
CREATE OR REPLACE FUNCTION public.coleccion_detalle(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_col jsonb;
BEGIN
  SELECT to_jsonb(c) INTO v_col FROM public.colecciones c WHERE c.id = p_id AND c.agente_id = v_uid;
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

-- ── PÚBLICO: obtener colección por token (vista del cliente) ───────────────
CREATE OR REPLACE FUNCTION public.coleccion_publica(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_col public.colecciones; v_res jsonb;
BEGIN
  SELECT * INTO v_col FROM public.colecciones WHERE token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Registrar apertura (primera vez marca abierta_at; siempre suma una vista)
  UPDATE public.colecciones
     SET vistas = vistas + 1, abierta_at = COALESCE(abierta_at, now())
   WHERE id = v_col.id;
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
END $$;

-- ── PÚBLICO: registrar que el cliente abrió una propiedad ──────────────────
CREATE OR REPLACE FUNCTION public.coleccion_registrar_vista_item(p_token text, p_propiedad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.coleccion_items i
     SET vistas = i.vistas + 1, visto_at = COALESCE(i.visto_at, now())
    FROM public.colecciones c
   WHERE c.token = p_token AND i.coleccion_id = c.id AND i.propiedad_id = p_propiedad_id;
END $$;

-- ── PÚBLICO: cliente marca / desmarca favorito ─────────────────────────────
CREATE OR REPLACE FUNCTION public.coleccion_toggle_favorito(p_token text, p_propiedad_id uuid, p_favorito boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean := false;
BEGIN
  UPDATE public.coleccion_items i
     SET favorito = p_favorito, favorito_at = CASE WHEN p_favorito THEN now() ELSE NULL END
    FROM public.colecciones c
   WHERE c.token = p_token AND i.coleccion_id = c.id AND i.propiedad_id = p_propiedad_id;
  v_ok := FOUND;
  RETURN jsonb_build_object('ok', v_ok, 'favorito', p_favorito);
END $$;

-- Permisos: el cliente (anon) puede leer y registrar interacción sin login.
GRANT EXECUTE ON FUNCTION public.coleccion_publica(text)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coleccion_registrar_vista_item(text, uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coleccion_toggle_favorito(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_coleccion(text, uuid, text, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.coleccion_agregar_item(uuid, uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.coleccion_quitar_item(uuid, uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_coleccion(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.mis_colecciones()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.coleccion_detalle(uuid)                     TO authenticated;
