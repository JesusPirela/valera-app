-- ─────────────────────────────────────────────────────────────────────────────
-- publicacion_log: registro de cada evento de publicación individual
-- Soluciona: propiedades_publicadas contaba 1 aunque la propiedad se publicara
-- 10 veces (tabla propiedad_publicacion tiene UNIQUE por propiedad+usuario).
-- Ahora cada publicación genera una fila aquí con su timestamp exacto.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.publicacion_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id UUID        NOT NULL REFERENCES public.propiedades(id)  ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publicacion_log_user_created
  ON public.publicacion_log (user_id, created_at);

-- RLS: solo el dueño del registro y los admins pueden leer
ALTER TABLE public.publicacion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "publog_own"   ON public.publicacion_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "publog_admin" ON public.publicacion_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
);
CREATE POLICY "publog_insert" ON public.publicacion_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Trigger: inserta en publicacion_log cada vez que se upsertea una publicación ──
CREATE OR REPLACE FUNCTION fn_log_publicacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Solo registrar si se está marcando como publicada (no al despublicar)
  IF NEW.publicada = TRUE THEN
    INSERT INTO public.publicacion_log (propiedad_id, user_id)
    VALUES (NEW.propiedad_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_publicacion_log ON public.propiedad_publicacion;
CREATE TRIGGER tr_publicacion_log
  AFTER INSERT OR UPDATE ON public.propiedad_publicacion
  FOR EACH ROW EXECUTE FUNCTION fn_log_publicacion();

-- ── Backfill: insertar entradas históricas a partir de veces_publicada ──────
-- Para cada fila en propiedad_publicacion con veces_publicada > 0,
-- generamos veces_publicada entradas todas con fecha_publicacion como timestamp.
-- Esto aproxima el historial (no conocemos los timestamps individuales anteriores).
INSERT INTO public.publicacion_log (propiedad_id, user_id, created_at)
SELECT
  pp.propiedad_id,
  pp.user_id,
  -- Distribuir entradas hacia atrás desde fecha_publicacion: 1h por cada una
  pp.fecha_publicacion - (gs.n - 1) * INTERVAL '1 hour' AS created_at
FROM public.propiedad_publicacion pp
CROSS JOIN generate_series(1, GREATEST(pp.veces_publicada, 0)) AS gs(n)
WHERE pp.publicada = TRUE
  AND pp.veces_publicada > 0
  AND pp.fecha_publicacion IS NOT NULL
ON CONFLICT DO NOTHING;
