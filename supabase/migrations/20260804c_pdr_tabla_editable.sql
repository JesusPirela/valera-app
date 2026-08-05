-- Tabla de precios editable: los PDR pasan de un archivo estático a una tabla en
-- BD para poder editarlos/añadirlos/borrarlos inline (como Excel). Solo staff
-- (admin/supervisor) puede leer y escribir. La app la siembra desde el dataset
-- estático la primera vez que está vacía.

CREATE TABLE IF NOT EXISTS public.pdr_referencia (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona       text NOT NULL,
  etiqueta   text NOT NULL DEFAULT '',
  precio     bigint,
  caract     text,
  tipo       text,
  orden      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pdr_referencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdr_staff_all ON public.pdr_referencia;
CREATE POLICY pdr_staff_all ON public.pdr_referencia
  FOR ALL
  USING     (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')));

-- Características como texto libre editable en la tabla de precios (si está, se
-- muestra en vez de las derivadas de recámaras/baños).
ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS caracteristicas_texto text;
