-- ══════════════════════════════════════════════════════════════════════════════
-- Subida semiautomática de videos a Valera University.
--
-- Una edge function (university-buscar-videos) busca en YouTube videos de 4
-- temas fijos y los deja en `vu_video_candidatos` como 'pendiente'. Un admin
-- los revisa en /(admin)/university-videos-cola y aprueba/descarta — al
-- aprobar se crea la lección real en `vu_lecciones`. Nunca se publica nada
-- sin que un humano lo apruebe (eso es lo "semi" de semiautomático).
--
-- Cada lección vive DENTRO de un curso (vu_lecciones.curso_id es NOT NULL), así
-- que se crea un curso "contenedor" fijo por tema — los videos aprobados se
-- agregan ahí como lecciones nuevas, sin tocar los cursos ya armados a mano.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1) Los 4 cursos contenedor (uno por tema). Publicados desde ya: a medida que
--    se aprueben videos, las lecciones aparecen solas para los prospectadores.
INSERT INTO public.vu_cursos (titulo, descripcion_corta, categoria, nivel, publicado, orden)
SELECT * FROM (VALUES
  ('Ventas · Videos recomendados',                  'Selección semanal de videos sobre técnicas y estrategias de ventas.',        'Ventas',   'basico', TRUE, 900),
  ('Inmobiliario · Videos recomendados',             'Selección semanal de videos sobre el mercado y el oficio inmobiliario.',     'Fundamentos', 'basico', TRUE, 901),
  ('Superación personal · Videos recomendados',      'Selección semanal de videos sobre mentalidad y desarrollo personal.',        'Soft skills', 'basico', TRUE, 902),
  ('Administración del tiempo · Videos recomendados','Selección semanal de videos sobre productividad y manejo del tiempo.',       'Soft skills', 'basico', TRUE, 903)
) AS v(titulo, descripcion_corta, categoria, nivel, publicado, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.vu_cursos WHERE vu_cursos.titulo = v.titulo);

-- 2) Cola de candidatos encontrados en YouTube, pendientes de revisión.
CREATE TABLE IF NOT EXISTS public.vu_video_candidatos (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tema                 TEXT        NOT NULL
                                   CHECK (tema IN ('ventas', 'inmobiliario', 'superacion_personal', 'administracion_tiempo')),
  curso_id             UUID        NOT NULL REFERENCES public.vu_cursos(id) ON DELETE CASCADE,
  youtube_video_id     TEXT        NOT NULL UNIQUE,
  youtube_url          TEXT        NOT NULL,
  titulo               TEXT        NOT NULL,
  descripcion          TEXT,
  canal                TEXT,
  miniatura_url        TEXT,
  duracion_segundos    INT,
  publicado_youtube_en TIMESTAMPTZ,
  estado               TEXT        NOT NULL DEFAULT 'pendiente'
                                   CHECK (estado IN ('pendiente', 'aprobado', 'descartado')),
  leccion_id           UUID        REFERENCES public.vu_lecciones(id) ON DELETE SET NULL,
  revisado_por         UUID        REFERENCES auth.users(id),
  revisado_en          TIMESTAMPTZ,
  encontrado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vu_video_candidatos_estado ON public.vu_video_candidatos(estado, tema);

ALTER TABLE public.vu_video_candidatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vu_video_candidatos_admin_all" ON public.vu_video_candidatos FOR ALL
  USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

SELECT pg_notify('pgrst', 'reload schema');
