-- Tope GLOBAL de publicaciones por propiedad: 10 en 7 días, entre TODOS.
--
-- Ya había un tope de 10 por PERSONA. El problema de Marketplace no es que una
-- persona publique mucho, es que diez personas publiquen lo MISMO: medido, la
-- misma propiedad la publican 8.3 personas en promedio (máximo 58), y Facebook
-- lo lee como spam y empieza a rechazar los anuncios de todos.
--
-- Qué tan agresivo es esto, medido antes de ponerlo: en la última semana solo
-- 4 propiedades de 832 pasaron de 10 publicaciones (el máximo fue 23). O sea
-- que frena justo los casos extremos y no estorba al trabajo normal.
--
-- Dos formas de volver a habilitarla, las dos que pidió el usuario:
--   1) sola, al pasar los 7 días (el conteo es móvil);
--   2) un admin le da luz verde antes, si hace falta.

CREATE TABLE IF NOT EXISTS public.propiedad_luz_verde (
  propiedad_id   uuid PRIMARY KEY REFERENCES public.propiedades(id) ON DELETE CASCADE,
  autorizado_por uuid REFERENCES public.profiles(id),
  autorizado_at  timestamptz NOT NULL DEFAULT now(),
  -- La autorización CADUCA. Si fuera para siempre, una propiedad autorizada
  -- una vez quedaría libre de tope el resto de su vida y volveríamos al
  -- problema original sin que nadie se diera cuenta.
  vence_at       timestamptz NOT NULL DEFAULT now() + interval '7 days',
  motivo         text
);

ALTER TABLE public.propiedad_luz_verde ENABLE ROW LEVEL SECURITY;

-- Todos la LEEN (la app necesita saber si una propiedad está autorizada para
-- no bloquear el botón); solo los admins escriben, y eso lo hace la RPC.
DROP POLICY IF EXISTS "luz_verde_lectura" ON public.propiedad_luz_verde;
CREATE POLICY "luz_verde_lectura" ON public.propiedad_luz_verde
  FOR SELECT TO authenticated USING (true);

-- ── Qué propiedades están saturadas ──────────────────────────────────────────
-- Devuelve SOLO las bloqueadas, que son un puñado: la app las pide una vez y
-- con eso sabe qué botones apagar. Si devolviera las 2,200 sería un lastre.
CREATE OR REPLACE FUNCTION public.propiedades_saturadas()
RETURNS TABLE(propiedad_id uuid, veces int, personas int, libre_desde timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT pl.propiedad_id,
         COUNT(*)::int AS veces,
         COUNT(DISTINCT pl.user_id)::int AS personas,
         -- Cuándo se libera sola: cuando la 10ª publicación más vieja de la
         -- ventana cumpla 7 días.
         (MIN(pl.created_at) + interval '7 days') AS libre_desde
    FROM public.publicacion_log pl
   WHERE pl.created_at >= now() - interval '7 days'
   GROUP BY pl.propiedad_id
  HAVING COUNT(*) >= 10
     AND NOT EXISTS (
       SELECT 1 FROM public.propiedad_luz_verde lv
        WHERE lv.propiedad_id = pl.propiedad_id AND lv.vence_at > now()
     );
$fn$;

GRANT EXECUTE ON FUNCTION public.propiedades_saturadas() TO authenticated;

-- ── Dar / quitar luz verde (solo admin) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dar_luz_verde(p_propiedad_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  -- Se compara con IS DISTINCT FROM porque un rol NULL con "<> 'admin'" da
  -- NULL y el IF no entra: el guardia no guardaría nada.
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo un admin puede dar luz verde.');
  END IF;

  INSERT INTO public.propiedad_luz_verde (propiedad_id, autorizado_por, autorizado_at, vence_at, motivo)
  VALUES (p_propiedad_id, auth.uid(), now(), now() + interval '7 days', p_motivo)
  ON CONFLICT (propiedad_id) DO UPDATE
    SET autorizado_por = auth.uid(), autorizado_at = now(),
        vence_at = now() + interval '7 days', motivo = EXCLUDED.motivo;

  RETURN jsonb_build_object('ok', true, 'vence_at', now() + interval '7 days');
END $fn$;

GRANT EXECUTE ON FUNCTION public.dar_luz_verde(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.quitar_luz_verde(p_propiedad_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo un admin puede quitar la luz verde.');
  END IF;
  DELETE FROM public.propiedad_luz_verde WHERE propiedad_id = p_propiedad_id;
  RETURN jsonb_build_object('ok', true);
END $fn$;

GRANT EXECUTE ON FUNCTION public.quitar_luz_verde(uuid) TO authenticated;

-- ── Lo que ve el admin: saturadas CON su conteo, autorizadas o no ────────────
CREATE OR REPLACE FUNCTION public.publicaciones_de_la_semana()
RETURNS TABLE(propiedad_id uuid, codigo text, titulo text, veces int, personas int,
              autorizada boolean, vence_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT p.id, p.codigo, p.titulo,
         COUNT(pl.*)::int,
         COUNT(DISTINCT pl.user_id)::int,
         (lv.propiedad_id IS NOT NULL AND lv.vence_at > now()),
         lv.vence_at
    FROM public.publicacion_log pl
    JOIN public.propiedades p ON p.id = pl.propiedad_id
    LEFT JOIN public.propiedad_luz_verde lv ON lv.propiedad_id = p.id
   WHERE pl.created_at >= now() - interval '7 days'
   GROUP BY p.id, p.codigo, p.titulo, lv.propiedad_id, lv.vence_at
  HAVING COUNT(pl.*) >= 7          -- se muestran desde 7 para ver las que van a topar
   ORDER BY COUNT(pl.*) DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.publicaciones_de_la_semana() TO authenticated;
