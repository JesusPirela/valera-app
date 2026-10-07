-- ══════════════════════════════════════════════════════════════════════════════
-- Cola de PUBLICACIÓN para Valera University.
--
-- Antes, "Aprobar" en /(admin)/university-videos-cola creaba la lección de
-- inmediato. Ahora solo lo mete a la cola ('aprobado'); un cron la va
-- vaciando de a UNO, lunes/miércoles/viernes, para que entren los 3 videos
-- semanales a ese ritmo aunque el admin apruebe varios de un jalón.
--
-- No necesita edge function ni service_role key (a diferencia de la búsqueda
-- en YouTube): es pura lógica SQL, así que el cron se agenda aquí mismo.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vu_video_candidatos
  ADD COLUMN IF NOT EXISTS publicado_en TIMESTAMPTZ;

ALTER TABLE public.vu_video_candidatos
  DROP CONSTRAINT IF EXISTS vu_video_candidatos_estado_check;
ALTER TABLE public.vu_video_candidatos
  ADD CONSTRAINT vu_video_candidatos_estado_check
  CHECK (estado IN ('pendiente', 'aprobado', 'publicado', 'descartado'));

-- Toma el candidato 'aprobado' más antiguo (por fecha de aprobación) y crea
-- su lección real — lo mismo que hacía el botón "Aprobar" antes, solo que
-- ahora lo dispara el cron en vez del clic. FOR UPDATE SKIP LOCKED: si algún
-- día se llama dos veces en paralelo, nunca publica el mismo candidato dos
-- veces ni se bloquean entre sí.
CREATE OR REPLACE FUNCTION public.vu_publicar_siguiente_video()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cand RECORD;
  v_orden INT;
  v_leccion_id UUID;
BEGIN
  SELECT * INTO v_cand FROM vu_video_candidatos
    WHERE estado = 'aprobado'
    ORDER BY revisado_en ASC NULLS LAST, encontrado_en ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(MAX(orden), 0) + 1 INTO v_orden FROM vu_lecciones WHERE curso_id = v_cand.curso_id;

  INSERT INTO vu_lecciones (curso_id, titulo, descripcion, youtube_url, orden)
  VALUES (v_cand.curso_id, v_cand.titulo, v_cand.descripcion, v_cand.youtube_url, v_orden)
  RETURNING id INTO v_leccion_id;

  UPDATE vu_video_candidatos
  SET estado = 'publicado', leccion_id = v_leccion_id, publicado_en = NOW()
  WHERE id = v_cand.id;

  RETURN v_leccion_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vu_publicar_siguiente_video() FROM anon;

SELECT cron.unschedule('university-publicar-video')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'university-publicar-video');

-- Lunes, miércoles y viernes a las 9:00 am: publica UN video de la cola.
SELECT cron.schedule(
  'university-publicar-video',
  '0 9 * * 1,3,5',
  $cron$ SELECT public.vu_publicar_siguiente_video(); $cron$
);

SELECT pg_notify('pgrst', 'reload schema');
