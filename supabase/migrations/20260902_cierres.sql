-- Apartado de CIERRES (admin): seguimiento de cierres de venta y renta.
-- Tabla propia editable (como citas_venta). Precarga inicial con los clientes
-- que ya compraron; de ahí se mantiene a mano.

CREATE TABLE IF NOT EXISTS public.cierres (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden                int,
  cliente_nombre       text,
  telefono             text,
  tipo_operacion       text,                       -- 'venta' | 'renta'
  interesado_en        text,
  etapa                text DEFAULT 'Apartado',    -- Apartado/Trámite/Por escriturar/Escriturado/Caído
  fecha_escrituracion  date,
  comision             numeric,                     -- dinero a ganar (a mano)
  prospecto            text,                        -- quién prospectó
  coordino             text,                        -- quién agendó
  atendio              text,                        -- quién atendió
  notas                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE public.cierres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cierres_admin ON public.cierres;
CREATE POLICY cierres_admin ON public.cierres FOR ALL
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- updated_at automático.
CREATE OR REPLACE FUNCTION public.fn_cierres_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_cierres_touch ON public.cierres;
CREATE TRIGGER trg_cierres_touch BEFORE UPDATE ON public.cierres
  FOR EACH ROW EXECUTE FUNCTION public.fn_cierres_touch();

-- Precarga: clientes que ya compraron. Trae quién prospectó/agendó/atendió desde
-- la cita más reciente que coincida por nombre (si existe). Solo si está vacía.
INSERT INTO public.cierres
  (cliente_nombre, telefono, tipo_operacion, interesado_en, etapa, prospecto, coordino, atendio, orden)
SELECT
  c.nombre, c.telefono, c.tipo_operacion, cv.interesado_en,
  CASE WHEN c.cierre_completado THEN 'Escriturado' ELSE 'Trámite' END,
  cv.prospecto, cv.coordino, cv.atendio,
  row_number() OVER (ORDER BY c.updated_at DESC)
FROM public.clientes c
LEFT JOIN LATERAL (
  SELECT interesado_en, prospecto, coordino, atendio
  FROM public.citas_venta v
  WHERE lower(btrim(v.cliente_nombre)) = lower(btrim(c.nombre))
  ORDER BY v.created_at DESC
  LIMIT 1
) cv ON true
WHERE c.eliminado_at IS NULL
  AND c.estado = 'compro'
  AND NOT EXISTS (SELECT 1 FROM public.cierres);
