-- ══════════════════════════════════════════════════════════════════════════════
-- DESARROLLOS PENDIENTES — lista de desarrollos/constructoras que se sabe que
-- faltan por subir al catálogo (aún no tienen propiedades cargadas). Vive
-- dentro de la pantalla de Constructoras, como una tercera "vista" junto al
-- catálogo y los contactos. Solo admin y gerente la ven/gestionan — es
-- deliberadamente MÁS SIMPLE que `proyectos` (que es un tablero genérico de
-- tareas, solo-admin, con progreso/prioridad/actividades/archivos): esto es
-- nada más una lista de "qué falta subir" con 3 estados.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.desarrollos_pendientes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT        NOT NULL,
  constructora  TEXT,
  zona          TEXT,
  notas         TEXT,
  estado        TEXT        NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'en_proceso', 'subido')),
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_desarrollos_pendientes_estado ON public.desarrollos_pendientes(estado);

CREATE OR REPLACE FUNCTION public.touch_desarrollos_pendientes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_desarrollos_pendientes ON public.desarrollos_pendientes;
CREATE TRIGGER trg_touch_desarrollos_pendientes
  BEFORE UPDATE ON public.desarrollos_pendientes
  FOR EACH ROW EXECUTE FUNCTION public.touch_desarrollos_pendientes();

ALTER TABLE public.desarrollos_pendientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gerente_desarrollos_pendientes" ON public.desarrollos_pendientes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'gerente'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'gerente'))
  );

SELECT pg_notify('pgrst', 'reload schema');
