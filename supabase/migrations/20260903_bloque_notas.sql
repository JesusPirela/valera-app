-- Notas de bloque: ahora cada nota puede ser DIARIA (ligada a un día, con
-- historial) o PERMANENTE (siempre visible). Antes solo existía un texto único
-- en profiles.notas_bloque. Se conserva ese campo por compatibilidad pero la UI
-- nueva usa esta tabla.
CREATE TABLE IF NOT EXISTS public.bloque_notas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,  -- sobre quién
  autor_id    uuid DEFAULT auth.uid(),                                          -- quién la escribió
  texto       text NOT NULL,
  tipo        text NOT NULL DEFAULT 'diaria' CHECK (tipo IN ('diaria','permanente')),
  fecha       date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Mexico_City')::date),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bloque_notas_user ON public.bloque_notas (user_id, created_at DESC);

ALTER TABLE public.bloque_notas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bloque_notas_staff ON public.bloque_notas;
CREATE POLICY bloque_notas_staff ON public.bloque_notas FOR ALL
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));

-- Migrar la nota única existente como nota PERMANENTE (solo una vez).
INSERT INTO public.bloque_notas (user_id, autor_id, texto, tipo, fecha)
SELECT id, NULL, btrim(notas_bloque), 'permanente',
       (now() AT TIME ZONE 'America/Mexico_City')::date
FROM public.profiles
WHERE notas_bloque IS NOT NULL AND btrim(notas_bloque) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.bloque_notas);
