-- ══════════════════════════════════════════════════════════════
-- TABLA: citas_coordinacion
-- Dashboard de coordinación de citas en tiempo real para admins.
-- Se alimenta automáticamente cuando un prospectador cambia el
-- estado de un cliente a 'cita_agendada' o 'cita_por_agendar'.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.citas_coordinacion (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  prospectador_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  coordinado_por   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  propiedad_id     UUID        REFERENCES public.propiedades(id) ON DELETE SET NULL,
  estado           TEXT        NOT NULL DEFAULT 'por_contactar',
  -- Estados: por_contactar | primer_contacto | en_coordinacion | coordinada | reagendada | realizada | cancelada
  fecha_cita       TIMESTAMPTZ,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citas_cliente     ON public.citas_coordinacion(cliente_id);
CREATE INDEX IF NOT EXISTS idx_citas_estado      ON public.citas_coordinacion(estado);
CREATE INDEX IF NOT EXISTS idx_citas_prospectador ON public.citas_coordinacion(prospectador_id);
CREATE INDEX IF NOT EXISTS idx_citas_fecha        ON public.citas_coordinacion(fecha_cita);

-- Auto-actualizar updated_at
CREATE OR REPLACE FUNCTION public.update_citas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS citas_updated_at ON public.citas_coordinacion;
CREATE TRIGGER citas_updated_at
  BEFORE UPDATE ON public.citas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.update_citas_updated_at();

-- RLS
ALTER TABLE public.citas_coordinacion ENABLE ROW LEVEL SECURITY;

-- Admins: acceso total
CREATE POLICY "citas_admin_all" ON public.citas_coordinacion
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Prospectadores: solo ven sus propias citas
CREATE POLICY "citas_prospectador_select" ON public.citas_coordinacion
  FOR SELECT
  USING (auth.uid() = prospectador_id);

-- Prospectadores: solo insertan con su propio id
CREATE POLICY "citas_prospectador_insert" ON public.citas_coordinacion
  FOR INSERT
  WITH CHECK (auth.uid() = prospectador_id);
