-- La hoja de ruta también como link, y cada parada con su estado de confirmada.
--
-- Hasta ahora la hoja sólo existía como PDF que se generaba y se mandaba. Con
-- un link, el asesor la abre desde el teléfono el día del recorrido y ve lo
-- mismo sin descargar nada.
--
-- Qué se guarda y por qué así: el documento se congela tal cual se armó
-- (perfil y paradas completos, en JSON). NO se reconstruye leyendo las citas
-- al abrir el link, porque la hoja lleva campos editados a mano —una ubicación
-- corregida, un precio al día— que no están en ninguna tabla. Si se
-- reconstruyera, esas correcciones se perderían al abrirla.
--
-- OJO con quién lo ve: el propio documento dice "no se comparte con el cliente
-- ni con asesores externos". El link no pide sesión (para eso es un link), así
-- que la única protección es que el token no se adivina. Por eso son 32 bytes
-- al azar y no el id de la hoja.

CREATE TABLE IF NOT EXISTS public.hojas_de_ruta (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text UNIQUE NOT NULL,
  cliente_id  uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  creada_por  uuid REFERENCES public.profiles(id),
  fecha       text NOT NULL,
  perfil      jsonb NOT NULL,
  paradas     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hojas_ruta_creada_por ON public.hojas_de_ruta (creada_por, created_at DESC);

ALTER TABLE public.hojas_de_ruta ENABLE ROW LEVEL SECURITY;

-- Con sesión: cada quien ve y edita las suyas; admin y gerencia, todas.
DROP POLICY IF EXISTS "hojas_ruta_lectura" ON public.hojas_de_ruta;
CREATE POLICY "hojas_ruta_lectura" ON public.hojas_de_ruta
  FOR SELECT TO authenticated
  USING (
    creada_por = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente', 'supervisor'))
  );

DROP POLICY IF EXISTS "hojas_ruta_escritura" ON public.hojas_de_ruta;
CREATE POLICY "hojas_ruta_escritura" ON public.hojas_de_ruta
  FOR INSERT TO authenticated WITH CHECK (creada_por = auth.uid());

DROP POLICY IF EXISTS "hojas_ruta_update" ON public.hojas_de_ruta;
CREATE POLICY "hojas_ruta_update" ON public.hojas_de_ruta
  FOR UPDATE TO authenticated USING (creada_por = auth.uid());

-- ── Guardar la hoja y devolver su token ──────────────────────────────────
-- Si se vuelve a guardar la MISMA hoja (mismo token), se sobrescribe en vez de
-- crear otra: así el link que ya se mandó por WhatsApp sigue sirviendo y
-- muestra la versión corregida.
CREATE OR REPLACE FUNCTION public.guardar_hoja_de_ruta(
  p_cliente_id uuid, p_fecha text, p_perfil jsonb, p_paradas jsonb,
  p_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_token text; v_rol text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- De asesor para arriba, igual que la pantalla. Sin esto, cualquiera con la
  -- sesión abierta podría crear hojas llamando la función directo.
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol IS NULL OR v_rol NOT IN ('asesor', 'supervisor', 'gerente', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta pantalla es para asesores y coordinación.');
  END IF;

  -- pgcrypto vive en el esquema extensions y esta funcion fija search_path a
  -- public, asi que gen_random_bytes no se alcanza sin calificarlo.
  v_token := COALESCE(NULLIF(p_token, ''), encode(extensions.gen_random_bytes(24), 'hex'));

  INSERT INTO public.hojas_de_ruta (token, cliente_id, creada_por, fecha, perfil, paradas)
  VALUES (v_token, p_cliente_id, auth.uid(), p_fecha, p_perfil, p_paradas)
  ON CONFLICT (token) DO UPDATE
    SET fecha = EXCLUDED.fecha, perfil = EXCLUDED.perfil,
        paradas = EXCLUDED.paradas, updated_at = now()
    -- Sólo quien la creó puede reescribirla por el token.
    WHERE hojas_de_ruta.creada_por = auth.uid();

  RETURN jsonb_build_object('ok', true, 'token', v_token);
END $fn$;

GRANT EXECUTE ON FUNCTION public.guardar_hoja_de_ruta(uuid, text, jsonb, jsonb, text) TO authenticated;

-- ── Leerla por el link, sin sesión ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hoja_de_ruta_publica(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT jsonb_build_object(
    'fecha', h.fecha,
    'perfil', h.perfil,
    'paradas', h.paradas,
    'actualizada', h.updated_at
  )
  FROM public.hojas_de_ruta h
  WHERE h.token = p_token;
$fn$;

GRANT EXECUTE ON FUNCTION public.hoja_de_ruta_publica(text) TO anon, authenticated;
