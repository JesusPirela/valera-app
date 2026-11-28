-- CUENTAS DE INMOBILIARIA ALIADA · Etapa 4: el link de invitación.
--
-- Esto no es para los aliados que ya tenemos: es para engancharlos. Un admin
-- genera UN link evergreen (igual que el de "directas para aliados") y se lo
-- manda a una inmobiliaria que todavía NO es cliente. El link enseña directas
-- + constructoras (lo que de verdad nos diferencia, no el inventario interno)
-- y, en vez del botón de WhatsApp al asesor que tiene una colección normal,
-- trae un botón "Quiero probarlo" que les pide sus datos y nos avisa.
--
-- Reusa toda la infraestructura de `colecciones` ya probada con es_directas:
-- mismo patrón, una columna más, una rama más en coleccion_publica().

ALTER TABLE public.colecciones
  ADD COLUMN IF NOT EXISTS es_invitacion boolean NOT NULL DEFAULT false;

-- Solo puede existir UNA colección de invitación, igual que con directas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_colecciones_invitacion_unica
  ON public.colecciones (es_invitacion) WHERE es_invitacion;

-- -- 1. Dónde caen las solicitudes de "quiero probarlo" -------------------------
CREATE TABLE IF NOT EXISTS public.solicitudes_aliado (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL,
  inmobiliaria  text NOT NULL,
  telefono      text,
  email         text,
  coleccion_id  uuid REFERENCES public.colecciones(id) ON DELETE SET NULL,
  atendida      boolean NOT NULL DEFAULT false,
  atendida_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_aliado_pendientes
  ON public.solicitudes_aliado (created_at DESC) WHERE NOT atendida;

ALTER TABLE public.solicitudes_aliado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS solicitudes_aliado_admin ON public.solicitudes_aliado;
CREATE POLICY solicitudes_aliado_admin ON public.solicitudes_aliado
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -- 2. ADMIN: entrega el token de la colección de invitación -------------------
-- Mismo patrón que obtener_coleccion_directas(): la primera vez la crea, las
-- siguientes devuelve la misma.
CREATE OR REPLACE FUNCTION public.obtener_coleccion_invitacion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_token text;
  v_n     int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo para administradores'; END IF;

  SELECT token INTO v_token FROM public.colecciones WHERE es_invitacion = true LIMIT 1;
  IF v_token IS NULL THEN
    v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    INSERT INTO public.colecciones (token, agente_id, titulo, es_invitacion)
    VALUES (v_token, v_uid, 'Catálogo Valera Real Estate', true);
  END IF;

  SELECT count(*) INTO v_n FROM public.propiedades
   WHERE (directa = true OR es_constructora = true)
     AND estado = 'disponible' AND es_inventario = false;

  RETURN jsonb_build_object('token', v_token, 'n_props', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_coleccion_invitacion() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.obtener_coleccion_invitacion() TO authenticated;

-- -- 3. PÚBLICO: coleccion_publica aprende la rama de invitación ----------------
-- Misma función de siempre, una rama más antes de la de es_directas. Sin
-- agente (nadie en particular la manda) y con los items armados en vivo.
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

  IF v_col.es_invitacion THEN
    SELECT jsonb_build_object(
      'titulo', v_col.titulo,
      'mensaje', v_col.mensaje,
      'cliente_nombre', NULL,
      'es_invitacion', true,
      'agente', NULL,
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
          WHERE (p.directa = true OR p.es_constructora = true)
            AND p.estado = 'disponible' AND p.es_inventario = false
        ) t
      ), '[]'::jsonb)
    ) INTO v_res;
    RETURN v_res;
  END IF;

  IF v_col.es_directas THEN
    SELECT jsonb_build_object(
      'titulo', v_col.titulo,
      'mensaje', v_col.mensaje,
      'cliente_nombre', NULL,
      'es_invitacion', false,
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
    'es_invitacion', false,
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

-- -- 4. PÚBLICO: "Quiero probarlo" ----------------------------------------------
-- Sin login, como el resto de la página. Guarda la solicitud y avisa a todos
-- los admins (vía `notificaciones`, igual que cualquier otro aviso interno).
CREATE OR REPLACE FUNCTION public.solicitar_prueba_aliado(
  p_token text, p_nombre text, p_inmobiliaria text, p_telefono text DEFAULT NULL, p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col_id uuid;
BEGIN
  IF trim(coalesce(p_nombre, '')) = '' OR trim(coalesce(p_inmobiliaria, '')) = '' THEN
    RAISE EXCEPTION 'Falta el nombre o la inmobiliaria';
  END IF;

  SELECT id INTO v_col_id FROM public.colecciones WHERE token = p_token;

  INSERT INTO public.solicitudes_aliado (nombre, inmobiliaria, telefono, email, coleccion_id)
  VALUES (
    trim(p_nombre), trim(p_inmobiliaria),
    nullif(trim(coalesce(p_telefono, '')), ''), nullif(trim(coalesce(p_email, '')), ''),
    v_col_id
  );

  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, leida)
  SELECT pr.id, '🏢 Quiere probar la app', trim(p_inmobiliaria) || ' — ' || trim(p_nombre), 'solicitud_aliado', false
    FROM public.profiles pr WHERE pr.role = 'admin';

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_prueba_aliado(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.solicitar_prueba_aliado(text, text, text, text, text) TO anon, authenticated;

-- -- 5. ADMIN: marcar una solicitud como atendida --------------------------------
CREATE OR REPLACE FUNCTION public.marcar_solicitud_aliado_atendida(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo para administradores'; END IF;
  UPDATE public.solicitudes_aliado SET atendida = true, atendida_at = now() WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_solicitud_aliado_atendida(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_solicitud_aliado_atendida(uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- REVERTIR
--   drop function public.marcar_solicitud_aliado_atendida(uuid);
--   drop function public.solicitar_prueba_aliado(text, text, text, text, text);
--   drop table public.solicitudes_aliado;
--   alter table public.colecciones drop column es_invitacion;
--   -- y devolver coleccion_publica() a la versión de 20261079_coleccion_directas.sql
