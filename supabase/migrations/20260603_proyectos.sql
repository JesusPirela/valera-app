-- Dashboard de Proyectos (solo administradores)

CREATE TABLE IF NOT EXISTS public.proyectos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  tipo          TEXT NOT NULL DEFAULT 'general',   -- general | individual
  estado        TEXT NOT NULL DEFAULT 'por_iniciar', -- por_iniciar | en_progreso | en_revision | completado | pausado
  prioridad     TEXT NOT NULL DEFAULT 'media',     -- alta | media | baja
  progreso      INTEGER NOT NULL DEFAULT 0 CHECK (progreso BETWEEN 0 AND 100),
  fecha_limite  DATE,
  responsable_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proyecto_actividades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-actualizar updated_at
CREATE OR REPLACE FUNCTION public.touch_proyectos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_proyectos ON public.proyectos;
CREATE TRIGGER trg_touch_proyectos
  BEFORE UPDATE ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.touch_proyectos();

-- RLS: solo admins
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyecto_actividades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_proyectos" ON public.proyectos
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admins_proyecto_actividades" ON public.proyecto_actividades
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
