-- =========================================================
-- Tabla de constructoras (teléfono de contacto)
-- =========================================================
-- Hasta ahora "constructora" era solo un nombre de texto libre en
-- propiedades.nombre_constructora, sin ningún dato de contacto. Esta tabla
-- guarda el teléfono de cada constructora para poder generar automáticamente
-- el mensaje de WhatsApp al registrar un cliente interesado. No se reemplaza
-- nombre_constructora (sigue siendo la fuente de verdad para agrupar
-- propiedades) — esta tabla solo se relaciona por nombre.

CREATE TABLE IF NOT EXISTS public.constructoras (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            TEXT        NOT NULL UNIQUE,
  telefono_contacto TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.constructoras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "constructoras_read" ON public.constructoras;
CREATE POLICY "constructoras_read" ON public.constructoras FOR SELECT USING (true);

DROP POLICY IF EXISTS "constructoras_admin_write" ON public.constructoras;
CREATE POLICY "constructoras_admin_write" ON public.constructoras FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

-- Backfill: registra cada constructora YA existente en propiedades, para que
-- no se pierda ninguna — el admin solo necesita completarles el teléfono.
INSERT INTO public.constructoras (nombre)
SELECT DISTINCT TRIM(nombre_constructora)
FROM public.propiedades
WHERE es_constructora = true
  AND nombre_constructora IS NOT NULL
  AND TRIM(nombre_constructora) <> ''
ON CONFLICT (nombre) DO NOTHING;

SELECT pg_notify('pgrst', 'reload schema');
